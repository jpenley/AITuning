# Owned-process cleanup reused from Factory Floor. Uses native snapshots and pinned handles, without WMI or taskkill.
param([int]$RootPid, [int]$CallerPid, [int]$WaitMs = 5000)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
public static class OwnedProcessTree {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct Entry {
    public uint Size, Usage, Pid; public IntPtr Heap; public uint Module, Threads, Parent; public int Priority; public uint Flags;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=260)] public string Exe;
  }
  sealed class Owned {
    public int Pid; public IntPtr Handle; public long Created; public bool MayTerminate, Attempted;
    public string Failure;
  }
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetProcessTimes(IntPtr process, out long created, out long exited, out long kernel, out long user);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateProcess(IntPtr process, uint code);
  [DllImport("kernel32.dll", SetLastError=true)] static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint pid);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool Process32FirstW(IntPtr snapshot, ref Entry entry);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool Process32NextW(IntPtr snapshot, ref Entry entry);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll")] static extern uint GetCurrentProcessId();
  [DllImport("ntdll.dll")] static extern int NtQuerySystemInformation(int infoClass, IntPtr buffer, int length, out int needed);
  const uint Query = 0x1000, Synchronize = 0x100000, Terminate = 0x1;

  static Exception Failed(string what) { return new InvalidOperationException(what + " (Windows error " + Marshal.GetLastWin32Error() + ")."); }
  static bool Running(Owned process) {
    uint wait = WaitForSingleObject(process.Handle, 0);
    if (wait == 0) return false;
    if (wait != 258) throw Failed("Could not wait for process " + process.Pid);
    return true;
  }
  static long Exited(Owned process) {
    long created, exited, kernel, user;
    if (!GetProcessTimes(process.Handle, out created, out exited, out kernel, out user)) throw Failed("Could not read process " + process.Pid);
    return exited;
  }
  // What Open returns for a process this user may not even inspect, when the caller can tell from
  // its start time whether it is a descendant at all.
  static readonly Owned Denied = new Owned();
  static Owned Open(int pid, bool mayBeDenied) {
    IntPtr handle = OpenProcess(Query | Synchronize | Terminate, false, pid);
    bool mayTerminate = handle != IntPtr.Zero;
    if (!mayTerminate) {
      int error = Marshal.GetLastWin32Error();
      if (error == 87) return null; // The process already exited.
      handle = OpenProcess(Query | Synchronize, false, pid);
      if (handle == IntPtr.Zero) {
        error = Marshal.GetLastWin32Error();
        if (error == 87) return null;
        if (error == 5 && mayBeDenied) return Denied;
        throw new InvalidOperationException("Could not inspect process " + pid + " (Windows error " + error + ").");
      }
    }
    try {
      long created, exited, kernel, user;
      if (!GetProcessTimes(handle, out created, out exited, out kernel, out user)) throw Failed("Could not read process " + pid);
      return new Owned { Pid = pid, Handle = handle, Created = created, MayTerminate = mayTerminate };
    } catch { CloseHandle(handle); throw; }
  }
  // The system's process list carries each process's start time, which needs no handle to it.
  static bool StartedAt(int pid, out long started) {
    started = 0;
    int length = 1 << 20;
    while (true) {
      IntPtr buffer = Marshal.AllocHGlobal(length);
      try {
        int needed;
        int status = NtQuerySystemInformation(5, buffer, length, out needed); // SystemProcessInformation
        if (status == unchecked((int)0xC0000004)) { length = Math.Max(length * 2, needed + 65536); continue; } // STATUS_INFO_LENGTH_MISMATCH
        if (status != 0) throw new InvalidOperationException("Could not list process start times (NTSTATUS 0x" + status.ToString("X8") + ").");
        // SYSTEM_PROCESS_INFORMATION: NextEntryOffset at 0, CreateTime at 32, UniqueProcessId after ImageName and BasePriority.
        int idAt = IntPtr.Size == 8 ? 80 : 68;
        for (int offset = 0; ; ) {
          IntPtr entry = IntPtr.Add(buffer, offset);
          if (Marshal.ReadIntPtr(entry, idAt).ToInt64() == pid) { started = Marshal.ReadInt64(entry, 32); return true; }
          int next = Marshal.ReadInt32(entry, 0);
          if (next == 0) return false;
          offset += next;
        }
      } finally { Marshal.FreeHGlobal(buffer); }
    }
  }
  static Dictionary<int, Entry> Snapshot() {
    var all = new Dictionary<int, Entry>();
    IntPtr snapshot = CreateToolhelp32Snapshot(2, 0);
    if (snapshot == new IntPtr(-1)) throw Failed("Could not list processes");
    try {
      Entry entry = new Entry(); entry.Size = (uint)Marshal.SizeOf(typeof(Entry));
      bool more = Process32FirstW(snapshot, ref entry);
      while (more) { all[(int)entry.Pid] = entry; more = Process32NextW(snapshot, ref entry); }
      if (Marshal.GetLastWin32Error() != 18) throw Failed("Could not finish listing processes");
      return all;
    } finally { CloseHandle(snapshot); }
  }
  static int Collect(List<Owned> tree, HashSet<int> seen, int caller) {
    var all = Snapshot(); int added = 0;
    for (int i = 0; i < tree.Count; i++) {
      Owned parent = tree[i];
      foreach (Entry entry in all.Values) {
        int pid = (int)entry.Pid;
        if (entry.Parent != parent.Pid || seen.Contains(pid)) continue;
        Owned child = Open(pid, true);
        if (child == null) continue;
        if (child == Denied) {
          // A snapshot keeps the id of a parent long gone, so a system process this user may not
          // open (vmmem, say) can name an id an owned process reuses. Its start time, read without
          // a handle, tells: one started outside the parent's lifetime is no descendant. Any other
          // could be one, and cleanup must not pass it by.
          long started;
          long parentExited = Exited(parent);
          if (StartedAt(pid, out started) && (started < parent.Created || (parentExited != 0 && started > parentExited))) continue;
          throw new InvalidOperationException("Could not inspect process " + pid + " (Windows error 5).");
        }
        // Holding the parent handle pins its identity. The child's creation must fall in that
        // exact parent's lifetime, not that of an earlier or later process with the same id.
        try {
          // The first snapshot may name a child whose id was reused before OpenProcess. The
          // held child handle now pins that id: recheck its parent before accepting the child.
          var current = Snapshot(); Entry verified;
          if (!current.TryGetValue(pid, out verified)) {
            if (Running(child)) throw new InvalidOperationException("Could not verify the parent of process " + pid + ".");
            foreach (Entry possible in current.Values) {
              if (possible.Parent == pid) throw new InvalidOperationException("Could not verify ancestry below exited process " + pid + ".");
            }
            continue;
          }
          if (verified.Parent != parent.Pid) continue;
          long exited = Exited(parent);
          if (child.Created < parent.Created || (exited != 0 && child.Created > exited)) continue;
          if (pid == caller || pid == GetCurrentProcessId()) throw new InvalidOperationException("Refused to end the cleanup caller or helper.");
          tree.Add(child); seen.Add(pid); added++; child = null;
        } finally { if (child != null) CloseHandle(child.Handle); }
      }
    }
    return added;
  }

  public static void End(int pid, int caller, int waitMs) {
    if (pid <= 0 || pid == caller || pid == GetCurrentProcessId()) throw new InvalidOperationException("Refused to end the cleanup caller or helper.");
    var tree = new List<Owned>(); var seen = new HashSet<int>();
    try {
      Owned root = Open(pid, false); if (root == null) return;
      tree.Add(root); seen.Add(pid);
      Owned helper = Open((int)GetCurrentProcessId(), false);
      try {
        var current = Snapshot(); Entry rootEntry, helperEntry;
        if (!current.TryGetValue(pid, out rootEntry) || rootEntry.Parent != caller ||
            !current.TryGetValue((int)GetCurrentProcessId(), out helperEntry) || helperEntry.Parent != caller ||
            root.Created > helper.Created)
          throw new InvalidOperationException("Refused a root that is not the caller's pre-existing child.");
      } finally { if (helper != null) CloseHandle(helper.Handle); }
      var elapsed = Stopwatch.StartNew();
      while (true) {
        Collect(tree, seen, caller);
        foreach (Owned each in tree) {
          if (each.Attempted || !Running(each)) continue;
          each.Attempted = true;
          // End parents first, so they stop starting children. A later snapshot catches children
          // born between the earlier snapshot and termination, including detached grandchildren.
          if (!each.MayTerminate) each.Failure = "termination access denied";
          else if (!TerminateProcess(each.Handle, 1)) {
            int error = Marshal.GetLastWin32Error();
            if (Running(each)) each.Failure = "termination failed (Windows error " + error + ")";
          }
        }
        var left = new List<Owned>();
        foreach (Owned each in tree) if (Running(each)) left.Add(each);
        if (left.Count == 0) {
          // Every known parent has now stopped. No child can appear after this final snapshot.
          if (Collect(tree, seen, caller) == 0) return;
          continue;
        }
        if (elapsed.ElapsedMilliseconds >= waitMs) {
          var reasons = new List<string>();
          foreach (Owned each in left) reasons.Add("process " + each.Pid + " still running" + (each.Failure == null ? " after it was ended" : ": " + each.Failure));
          throw new InvalidOperationException(string.Join("; ", reasons));
        }
        Thread.Sleep(25);
      }
    } finally {
      // A signaled process handle means teardown finished; release all pinned identities together.
      foreach (Owned each in tree) CloseHandle(each.Handle);
    }
  }
}
'@ | Out-Null
try { [OwnedProcessTree]::End($RootPid, $CallerPid, $WaitMs) }
catch { [Console]::Error.WriteLine($_.Exception.GetBaseException().Message); exit 1 }
