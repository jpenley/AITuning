import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Keep this separate from herdr's managed herdr-agent-state.ts integration.
export default function (pi: ExtensionAPI): void {
  const nativeInputKinds = new Set(["select", "confirm", "input", "editor"]);
  let nativePromptKind: string | undefined;
  let taskWaitActive = false;
  let taskWaitReported = false;
  let taskReady = false;
  let taskInitialization: ReturnType<typeof setImmediate> | undefined;

  function reportTaskWait(): void {
    if (!taskReady || taskWaitActive === taskWaitReported) return;
    taskWaitReported = taskWaitActive;
    pi.events.emit("herdr:blocked", { active: taskWaitActive, label: "Waiting for external task action" });
  }

  pi.events.on("task-guard:blocked", (data: unknown) => {
    if (!data || typeof data !== "object" || !("active" in data) || typeof data.active !== "boolean") return;
    taskWaitActive = data.active;
    reportTaskWait();
  });

  pi.on("session_start", () => {
    // Herdr ignores reports before its session_start handler has initialized.
    taskReady = false;
    if (taskInitialization) clearImmediate(taskInitialization);
    taskInitialization = setImmediate(() => {
      taskInitialization = undefined;
      taskReady = true;
      pi.events.emit("task-guard:status-request", {});
      reportTaskWait();
    });
  });

  function reportWait(active: boolean): void {
    pi.events.emit("herdr:blocked", { active, label: "Waiting for user input" });
  }

  // Pi emits one pair for the entire overlapping/nested UI group, not each dialog.
  // Generic custom components can be nonblocking viewers or progress displays.
  pi.on("ui_prompt_start", (event) => {
    if (nativePromptKind || !nativeInputKinds.has(event.kind)) return;
    nativePromptKind = event.kind;
    reportWait(true);
  });

  pi.on("ui_prompt_end", (event) => {
    if (!nativePromptKind || event.kind !== nativePromptKind) return;
    nativePromptKind = undefined;
    reportWait(false);
  });

  pi.on("session_shutdown", () => {
    if (taskInitialization) clearImmediate(taskInitialization);
    taskInitialization = undefined;
    taskWaitActive = false;
    reportTaskWait();
    taskReady = false;
    if (!nativePromptKind) return;
    nativePromptKind = undefined;
    reportWait(false);
  });

  pi.events.on("rpiv:ask-user:blocked", (data: unknown) => {
    if (!data || typeof data !== "object" || !("active" in data) || typeof data.active !== "boolean") {
      return;
    }

    reportWait(data.active);
  });
}
