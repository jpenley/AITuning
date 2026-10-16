"""Measure the edges of a Rust workspace: the crate graph and each crate's module graph.

    python3 scripts/edges.py [--manifest-path <Cargo.toml>] [--crate <name>] [--at <module::path>] [--include-tests]
    python3 scripts/edges.py --selftest

Crates: the workspace members and the path dependencies between them (`cargo metadata --no-deps`).
Modules: for each member's library (or its binaries, when it has no library), every module reached through
`mod` declarations from the crate root, and every path in `use` declarations and in code that names a module
of this crate or of another member. --at picks the module whose children are measured (default: the root).

A deep reach is a path from outside a module into one of its descendants, past the module's own file (its
interface). A cycle is a set of sibling modules, or member crates, that reach each other.

Read as text, so blind spots: paths made by macros, names reached through a glob import (`use a::*`), and
`#[cfg]`-disabled code. `#[cfg(test)]` modules are skipped unless --include-tests is given.

stdout: one JSON object; stderr: a human-readable report.
Exit: 0 no cycles or deep reaches, 1 findings, 2 could not run (no cargo, metadata failed, bad arguments).
"""

import contextlib
import io
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

LIB_KINDS = {"lib", "rlib", "dylib", "cdylib", "staticlib", "proc-macro"}
RAW_STR = re.compile(r'(?:b|c)?r(#*)"')
CHAR = re.compile(r"b?'(?:\\(?:u\{[0-9a-fA-F]+\}|x[0-9a-fA-F]{2}|.)|[^\\'\n])'")
MOD_DECL = re.compile(
    r"(?P<attrs>(?:#\[[^\]]*\]\s*)*)(?P<vis>\bpub\b(?:\s*\([^)]*\))?\s*)?\bmod\s+(?:r#)?(?P<name>\w+)\s*(?P<end>[;{])")
PATH_ATTR = re.compile(r'#\[\s*path\s*=\s*"([^"]+)"\s*\]')
USE = re.compile(r"(?P<vis>\bpub\b(?:\s*\([^)]*\))?\s*)?\buse\s+(?P<tree>[^;]+);")
PUB_IN = re.compile(r"\bpub\s*\(\s*in\s+[^)]*\)")
PATH = re.compile(r"(?<![\w$:])(?:r#)?[A-Za-z_]\w*(?:\s*::\s*(?:r#)?[A-Za-z_]\w*)+")
TOKEN = re.compile(r"::|[{}*,]|(?:r#)?\w+")


def blank(s):
    return "".join("\n" if ch == "\n" else " " for ch in s)


def strip(src):
    """Blank out comments, strings, and char literals, keeping every offset and line number."""
    out, i, n = [], 0, len(src)
    while i < n:
        prev = src[i - 1] if i else " "
        if src.startswith("//", i):
            j = src.find("\n", i)
            j = n if j < 0 else j
        elif src.startswith("/*", i):
            depth, j = 0, i
            while j < n:
                if src.startswith("/*", j):
                    depth, j = depth + 1, j + 2
                elif src.startswith("*/", j):
                    depth, j = depth - 1, j + 2
                    if depth == 0:
                        break
                else:
                    j += 1
        elif not (prev.isalnum() or prev == "_") and (m := RAW_STR.match(src, i)):
            end = src.find('"' + m.group(1), m.end())
            j = n if end < 0 else end + 1 + len(m.group(1))
        elif src[i] == '"' or (src[i] in "bc" and src.startswith('"', i + 1) and not (prev.isalnum() or prev == "_")):
            j = src.index('"', i) + 1
            while j < n and src[j] != '"':
                j += 2 if src[j] == "\\" else 1
            j = min(j + 1, n)
        elif (src[i] == "'" or (src[i] == "b" and src.startswith("'", i + 1))) and (m := CHAR.match(src, i)):
            j = m.end()
        else:
            out.append(src[i])
            i += 1
            continue
        out.append(blank(src[i:j]))
        i = j
    return "".join(out)


def close_brace(text, open_at):
    depth = 0
    for j in range(open_at, len(text)):
        if text[j] == "{":
            depth += 1
        elif text[j] == "}":
            depth -= 1
            if depth == 0:
                return j
    return len(text)


class Crate:
    def __init__(self, name, root_file, workspace_root):
        self.name = name
        self.root_file = Path(root_file)
        self.workspace_root = Path(workspace_root)
        self.mods = {}         # module path (tuple) -> {"file", "vis", "test"}
        self.regions = {}      # file -> [(start, end, module path)], innermost last
        self.texts = {}        # file -> (raw, stripped)
        self.unresolved = []   # `mod x;` declarations whose file wasn't found
        self.load()

    def read(self, f):
        if f not in self.texts:
            raw = f.read_text(encoding="utf-8", errors="replace")
            self.texts[f] = (raw, strip(raw))
        return self.texts[f]

    def load(self):
        self.mods[()] = {"file": self.root_file, "vis": "", "test": False}
        self.regions[self.root_file] = [(0, None, ())]
        self.scan(self.root_file, (), 0, None, self.root_file.parent, False)

    def scan(self, f, parent, start, end, child_dir, in_test):
        raw, text = self.read(f)
        end = len(text) if end is None else end
        pos = start
        while (m := MOD_DECL.search(text, pos, end)):
            name, attrs = m.group("name"), m.group("attrs")
            path = parent + (name,)
            test = in_test or "cfg(test)" in re.sub(r"\s", "", attrs)
            info = {"file": f, "vis": (m.group("vis") or "").strip(), "test": test}
            if m.group("end") == "{":
                close = close_brace(text, m.end() - 1)
                self.mods[path] = info
                self.regions[f].append((m.end(), close, path))
                self.scan(f, path, m.end(), close, child_dir / name, test)
                pos = close + 1
                continue
            pos = m.end()
            given = PATH_ATTR.search(raw, m.start("attrs"), m.start("name"))
            candidates = [f.parent / given.group(1)] if given else [child_dir / f"{name}.rs", child_dir / name / "mod.rs"]
            found = next((c for c in candidates if c.is_file()), None)
            if found is None:
                self.unresolved.append({"crate": self.name, "module": show(self.name, path), "declared_in": self.rel(f),
                                        "line": text.count("\n", 0, m.start("name")) + 1})
                continue
            info["file"] = found
            self.mods[path] = info
            self.regions.setdefault(found, []).append((0, None, path))
            self.scan(found, path, 0, None, child_dir / name, test)

    def rel(self, f):
        try:
            return Path(f).relative_to(self.workspace_root).as_posix()
        except ValueError:
            return str(f)

    def module_at(self, f, offset):
        best = None
        for start, end, path in self.regions[f]:
            if start <= offset and (end is None or offset < end):
                best = path
        return best


def show(crate, path):
    return "::".join((crate.replace("-", "_"),) + path) if path else crate


def parse_use(tree):
    tokens = [t for t in TOKEN.findall(tree)]
    pos = 0

    def one(prefix):
        nonlocal pos
        segs = list(prefix)
        while pos < len(tokens):
            t = tokens[pos]
            if t == "{":
                pos += 1
                items = []
                while pos < len(tokens) and tokens[pos] != "}":
                    items += one(segs)
                    if pos < len(tokens) and tokens[pos] == ",":
                        pos += 1
                pos += 1
                return items
            if t == "*":
                pos += 1
                return [(segs, None, True)]
            if t in (",", "}"):
                break
            if t == "as":
                alias = tokens[pos + 1] if pos + 1 < len(tokens) else None
                pos += 2
                return [(segs, alias, False)]
            if t != "::":
                segs.append(t[2:] if t.startswith("r#") else t)
            pos += 1
        return [(segs, None, False)]

    out = []
    while pos < len(tokens):
        before = pos
        out += one([])
        if pos < len(tokens) and tokens[pos] == ",":
            pos += 1
        elif pos == before:
            pos += 1
    result = []
    for segs, alias, glob in out:
        if segs and segs[-1] == "self":
            segs = segs[:-1]
        if segs:
            result.append((segs, alias or (None if glob else segs[-1]), glob))
    return result


def references(crates, externs, include_tests):
    """Every path naming a module of a member crate: (importer crate, module, target crate, module, rest, where)."""
    aliases = {}   # (crate, module) -> {name: (crate, module)}
    reexports = {}  # (crate, module) -> set of names re-exported
    uses = []
    for c in crates.values():
        for f, (raw, text) in c.texts.items():
            for m in USE.finditer(text):
                cur = c.module_at(f, m.start())
                if cur is None:
                    continue
                for segs, alias, glob in parse_use(m.group("tree")):
                    uses.append((c, cur, f, m, segs, alias, glob))
    for c, cur, f, m, segs, alias, glob in uses:
        r = resolve(segs, c, cur, crates, externs, {})
        if r and not r[2] and not glob and alias and alias != "_":
            aliases.setdefault((c.name, cur), {})[alias] = (r[0].name, r[1])
        if m.group("vis") and alias:
            reexports.setdefault((c.name, cur), set()).add(alias)
    refs = []
    for c, cur, f, m, segs, alias, glob in uses:
        r = resolve(segs, c, cur, crates, externs, aliases)
        if r:
            refs.append(ref(c, cur, f, m.start(), r, "::".join(segs)))
    for c in crates.values():
        for f, (raw, text) in c.texts.items():
            skip = [(m.start(), m.end()) for m in USE.finditer(text)] + [(m.start(), m.end()) for m in PUB_IN.finditer(text)]
            for m in PATH.finditer(text):
                if any(a <= m.start() < b for a, b in skip):
                    continue
                cur = c.module_at(f, m.start())
                if cur is None:
                    continue
                segs = [s.strip().removeprefix("r#") for s in m.group(0).split("::")]
                r = resolve(segs, c, cur, crates, externs, aliases)
                if r:
                    refs.append(ref(c, cur, f, m.start(), r, "::".join(segs)))
    kept = [x for x in refs if include_tests or not (crates[x["crate"]].mods[x["from"]]["test"])]
    return kept, reexports


def ref(c, cur, f, offset, r, written):
    return {"crate": c.name, "from": cur, "to_crate": r[0].name, "to": r[1], "rest": r[2], "file": c.rel(f),
            "line": c.texts[f][1].count("\n", 0, offset) + 1, "path": written}


def resolve(segs, c, cur, crates, externs, aliases):
    s = list(segs)
    head = s[0]
    target, base = c, cur
    if head == "crate":
        base, s = (), s[1:]
    elif head == "self":
        s = s[1:]
    elif head == "super":
        while s and s[0] == "super":
            if not base:
                return None
            base, s = base[:-1], s[1:]
    elif head in aliases.get((c.name, cur), {}):
        tc, base = aliases[(c.name, cur)][head]
        target, s = crates[tc], s[1:]
    elif cur + (head,) in c.mods:
        pass
    elif head in externs.get(c.name, {}):
        target, base, s = crates[externs[c.name][head]], (), s[1:]
    else:
        return None
    path = base
    while s and path + (s[0],) in target.mods:
        path, s = path + (s[0],), s[1:]
    return target, path, s


def within(path, ancestor):
    return path[: len(ancestor)] == ancestor


def sccs(nodes, edges):
    """Tarjan's strongly connected components; returns the components with more than one node."""
    index, low, stack, on, out, counter = {}, {}, [], set(), [], [0]

    def visit(v):
        index[v] = low[v] = counter[0]
        counter[0] += 1
        stack.append(v)
        on.add(v)
        for w in sorted(edges.get(v, ())):
            if w not in index:
                visit(w)
                low[v] = min(low[v], low[w])
            elif w in on:
                low[v] = min(low[v], index[w])
        if low[v] == index[v]:
            comp = []
            while True:
                w = stack.pop()
                on.discard(w)
                comp.append(w)
                if w == v:
                    break
            if len(comp) > 1:
                out.append(sorted(comp))

    for v in sorted(nodes):
        if v not in index:
            visit(v)
    return out


def measure_modules(c, at, refs, reexports, include_tests, externs):
    live = lambda p: include_tests or not c.mods[p]["test"]
    children = sorted(p for p in c.mods if len(p) == len(at) + 1 and within(p, at) and live(p))
    child_of = lambda p: next((k for k in children if within(p, k)), None)
    edges = {k: set() for k in children}
    deep, graphs, seen = [], {}, {}
    for r in refs:
        if r["to_crate"] != c.name:
            continue
        if r["crate"] != c.name:
            # Another member can only name what this crate exposes; a finding only when it bypasses a re-export.
            if not at and r["to"]:
                d = reach(c, r, (), reexports, externs)
                if d["use_instead"]:
                    deep.append(d)
            continue
        src, dst = child_of(r["from"]), child_of(r["to"])
        if dst and src and src != dst:
            edges[src].add(dst)
        if dst and r["to"] != dst and not within(r["from"], dst):
            deep.append(reach(c, r, dst, reexports, externs))
        # Each path joins the child graph of the deepest module holding both ends, for cycles at every level.
        n = 0
        while n < min(len(r["from"]), len(r["to"])) and r["from"][n] == r["to"][n]:
            n += 1
        parent = r["from"][:n]
        if within(parent, at) and len(r["from"]) > n and len(r["to"]) > n:
            a, b = r["from"][: n + 1], r["to"][: n + 1]
            if live(a) and live(b):
                graphs.setdefault(parent, {}).setdefault(a, set()).add(b)
                seen.setdefault((a, b), f'{r["file"]}:{r["line"]} {r["path"]}')
    fan = [{"module": show(c.name, k), "fan_in": sum(k in e for e in edges.values()), "fan_out": len(edges[k]),
            "uses": sorted(show(c.name, d) for d in edges[k])} for k in children]
    cycles = []
    for parent in sorted(graphs):
        g = graphs[parent]
        for comp in sccs(set(g) | {b for bs in g.values() for b in bs}, g):
            links = [{"from": show(c.name, a), "to": show(c.name, b), "at": seen[(a, b)]}
                     for a in comp for b in comp if (a, b) in seen]
            cycles.append({"in": show(c.name, parent), "modules": [show(c.name, k) for k in comp], "links": links})
    return {"crate": c.name, "root": c.rel(c.root_file), "at": show(c.name, at), "fan": fan, "cycles": cycles,
            "deep_reaches": deep}


def reach(c, r, interface, reexports, externs):
    """A path into `interface`'s descendants; use_instead is the shortest re-exported path to the same name."""
    past = interface + (r["to"][len(interface)],) if len(r["to"]) > len(interface) else interface
    name = r["rest"][0] if r["rest"] else r["to"][-1]
    end = len(r["to"]) if r["rest"] else len(r["to"]) - 1
    shorter = next((r["to"][:k] for k in range(len(interface), end)
                    if name in reexports.get((c.name, r["to"][:k]), set())), None)
    names = [n for n, target in externs.get(r["crate"], {}).items() if target == c.name]
    prefix = "crate" if r["crate"] == c.name else (names[0] if names else c.name.replace("-", "_"))
    return {"from": show(r["crate"], r["from"]), "path": r["path"], "interface": show(c.name, interface),
            "past": show(c.name, past), "past_visibility": c.mods[past]["vis"] or "private",
            "use_instead": "::".join((prefix,) + shorter + (name,)) if shorter is not None else None,
            "at": f'{r["file"]}:{r["line"]}'}


def public_unused(crates, libs, refs):
    """Modules another member could name (pub all the way down) that no other member does."""
    out = []
    for label in libs:
        c = crates[label]
        used = {r["to"] for r in refs if r["to_crate"] == label and r["crate"] != label}
        for p in sorted(c.mods):
            public = all(c.mods[p[:k]]["vis"] == "pub" for k in range(1, len(p) + 1))
            if p and public and not c.mods[p]["test"] and not any(within(u, p) for u in used):
                out.append(show(label, p))
    return out


def crate_graph(meta):
    members = set(meta["workspace_members"])
    pkgs = [p for p in meta["packages"] if p["id"] in members]
    names = {p["name"] for p in pkgs}
    edges = []
    for p in pkgs:
        for d in p["dependencies"]:
            if d.get("path") and d["name"] in names:
                edges.append({"from": p["name"], "to": d["name"], "kind": d.get("kind") or "normal"})
    runtime = [e for e in edges if e["kind"] != "dev"]
    fan = [{"crate": n, "fan_in": sum(e["to"] == n for e in runtime), "fan_out": sum(e["from"] == n for e in runtime),
            "dev_deps": sorted(e["to"] for e in edges if e["from"] == n and e["kind"] == "dev")} for n in sorted(names)]
    g = {}
    for e in edges:
        g.setdefault(e["from"], set()).add(e["to"])
    cycles = [{"crates": comp, "links": [e for e in edges if e["from"] in comp and e["to"] in comp]}
              for comp in sccs(names, g)]
    return {"members": sorted(names), "edges": edges, "fan": fan, "cycles": cycles}


def roots(meta):
    members = set(meta["workspace_members"])
    out = []
    for p in meta["packages"]:
        if p["id"] not in members:
            continue
        libs = [t for t in p["targets"] if LIB_KINDS & set(t["kind"])]
        bins = [t for t in p["targets"] if "bin" in t["kind"]]
        for t in libs[:1] or bins:
            label = p["name"] if libs or len(bins) == 1 else f'{p["name"]}:{t["name"]}'
            out.append((p, label, t["src_path"], bool(libs)))
    return out


def measure(meta, only=None, at=None, include_tests=False):
    graph = crate_graph(meta)
    crates, externs, libname = {}, {}, {}
    for p, label, src, is_lib in roots(meta):
        crates[label] = Crate(label, src, meta.get("workspace_root", Path(src).anchor))
        if is_lib:
            libname[p["name"]] = label
    for p, label, src, is_lib in roots(meta):
        for d in p["dependencies"]:
            if d.get("path") and d["name"] in libname:
                externs.setdefault(label, {})[(d.get("rename") or d["name"]).replace("-", "_")] = libname[d["name"]]
    refs, reexports = references(crates, externs, include_tests)
    at_path = tuple(s for s in (at or "").split("::") if s and s != "crate")
    modules = []
    for label, c in crates.items():
        if only and label != only and not label.startswith(only + ":"):
            continue
        if at_path not in c.mods:
            continue
        modules.append(measure_modules(c, at_path, refs, reexports, include_tests, externs))
    if (only or at) and not modules:
        raise LookupError(f"no crate{' ' + only if only else ''} with module {at or 'crate'} in this workspace")
    unresolved = [u for c in crates.values() for u in c.unresolved]
    unused = public_unused(crates, [l for l in libname.values() if not only or l == only], refs) if len(libname) > 1 else []
    return {"crates": graph, "modules": modules, "public_unused": unused, "unresolved_modules": unresolved}


def report(r):
    log = lambda s="": sys.stderr.write(s + "\n")
    g = r["crates"]
    log(f"Crates ({len(g['members'])} workspace members)")
    for f in sorted(g["fan"], key=lambda f: (-f["fan_in"], f["crate"])):
        dev = f", dev-deps {', '.join(f['dev_deps'])}" if f["dev_deps"] else ""
        log(f"  {f['crate']}: fan-in {f['fan_in']}, fan-out {f['fan_out']}{dev}")
    log(f"Crate cycles: {len(g['cycles'])}")
    for c in g["cycles"]:
        log("  " + ", ".join(f"{e['from']} -> {e['to']} ({e['kind']})" for e in c["links"]))
    for m in r["modules"]:
        log(f"\nModules of {m['crate']}, children of {m['at']} ({len(m['fan'])})")
        for f in sorted(m["fan"], key=lambda f: (-f["fan_in"], f["module"])):
            log(f"  {f['module']}: fan-in {f['fan_in']}, fan-out {f['fan_out']}")
        log(f"Cycles: {len(m['cycles'])}")
        for c in m["cycles"]:
            log(f"  in {c['in']}: {' <-> '.join(c['modules'])}")
            for link in c["links"]:
                log(f"    {link['from']} -> {link['to']}: {link['at']}")
        log(f"Deep reaches: {len(m['deep_reaches'])}")
        for d in m["deep_reaches"]:
            tag = f"; re-exported as {d['use_instead']}" if d["use_instead"] else ""
            log(f"  {d['from']} -> {d['path']} past {d['interface']} (via {d['past']}, {d['past_visibility']}{tag}) at {d['at']}")
    if r["public_unused"]:
        log(f"\nPublic modules no other member uses ({len(r['public_unused'])}): {', '.join(r['public_unused'])}")
    for u in r["unresolved_modules"]:
        log(f"Unresolved: mod {u['module']} declared in {u['declared_in']}:{u['line']} has no file, so it isn't measured")


def findings(r):
    return bool(r["crates"]["cycles"] or any(m["cycles"] or m["deep_reaches"] for m in r["modules"]))


def value(argv, flag):
    return argv[argv.index(flag) + 1] if flag in argv and argv.index(flag) + 1 < len(argv) else None


def run(argv):
    known = {"--manifest-path", "--crate", "--at", "--include-tests"}
    if any(a.startswith("--") and a not in known for a in argv):
        sys.stderr.write(__doc__)
        return 2
    cmd = ["cargo", "metadata", "--format-version", "1", "--no-deps"]
    if value(argv, "--manifest-path"):
        cmd += ["--manifest-path", value(argv, "--manifest-path")]
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
    except FileNotFoundError:
        sys.stderr.write("edges: cargo is not on PATH\n")
        print(json.dumps({"status": "error", "reason": "cargo missing"}))
        return 2
    if p.returncode != 0:
        sys.stderr.write(f"edges: cargo metadata failed:\n{p.stderr}")
        print(json.dumps({"status": "error", "reason": "cargo metadata failed"}))
        return 2
    try:
        r = measure(json.loads(p.stdout), value(argv, "--crate"), value(argv, "--at"), "--include-tests" in argv)
    except (LookupError, OSError, ValueError) as e:
        sys.stderr.write(f"edges: {e}\n")
        print(json.dumps({"status": "error", "reason": str(e)}))
        return 2
    report(r)
    print(json.dumps(r))
    return 1 if findings(r) else 0


def write(root, files):
    for rel, text in files.items():
        p = root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding="utf-8", newline="\n")


def fake_meta(root, crates):
    """The part of `cargo metadata --no-deps` the script reads, for a workspace written by the selftest."""
    pkgs = []
    for name, deps in crates.items():
        src = root / name / "src"
        targets = [{"name": name, "kind": ["lib"], "src_path": str(src / "lib.rs")}] if (src / "lib.rs").exists() \
            else [{"name": name, "kind": ["bin"], "src_path": str(src / "main.rs")}]
        pkgs.append({"id": f"path+file://{name}#0.1.0", "name": name, "targets": targets,
                     "dependencies": [{"name": d[0], "kind": d[1], "path": str(root / d[0]), "rename": (d + (None,))[2]}
                                      for d in deps]})
    return {"packages": pkgs, "workspace_members": [p["id"] for p in pkgs], "workspace_root": str(root)}


def selftest():
    failures = []
    check = lambda ok, what: ok or failures.append(what)
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        write(root, {
            # Planted: a cycle between billing and orders through items, deep reaches into billing::tax by a
            # `use`, by a path in a function body, and through a module alias; a `mod` with no file.
            "shop/src/lib.rs": "pub mod billing;\npub mod orders;\nmod reports;\nmod ghost;\npub use orders::place;\n",
            "shop/src/billing/mod.rs": (
                "pub mod tax;\nmod gateway;\npub use tax::rate;\nuse crate::orders::Order;\n"
                "pub struct Invoice { pub total: u64 }\n"
                "pub fn invoice(o: &Order) -> Invoice { gateway::send(o.amount); Invoice { total: o.amount } }\n"),
            "shop/src/billing/tax.rs": "pub fn rate(n: u64) -> u64 { n / 10 }\n",
            "shop/src/billing/gateway.rs": (
                "pub(crate) fn send(n: u64) -> u64 { super::tax::rate(n) }\n"
                "fn lifetimes<'a>(s: &'a str) -> char { let _q = '\\''; let _c = '{'; s.chars().next().unwrap_or('x') }\n"),
            "shop/src/orders/mod.rs": (
                "use crate::billing::{self, tax::rate};\n"
                "pub struct Order { pub amount: u64 }\n"
                "pub fn place(n: u64) -> u64 { billing::invoice(&Order { amount: n }).total + rate(1) }\n"
                "pub fn again(n: u64) -> u64 { billing::tax::rate(n) }\n"
                "#[cfg(test)]\nmod tests { use crate::billing::tax::rate; }\n"),
            "shop/src/reports.rs": (
                "// crate::billing::tax::rate in a comment is not a reach\n"
                "pub fn total() -> u64 { let _s = \"crate::billing::tax::rate\"; crate::billing::tax::rate(0) }\n"
                "mod inner { pub fn x() {} }\npub fn y() { self::inner::x() }\n"),
            # Another member (depending on shop under the name `store`) reaching past a re-export.
            "app/src/main.rs": "fn main() { let _ = store::billing::tax::rate(1) + store::place(2); }\n",
            # Clean: b uses a only through a's interface.
            "clean/src/lib.rs": "mod a;\nmod b;\n",
            "clean/src/a/mod.rs": "mod imp;\npub(crate) use imp::work;\n",
            "clean/src/a/imp.rs": "pub(crate) fn work() -> u8 { 1 }\n",
            "clean/src/b.rs": "use crate::a;\npub(crate) fn go() -> u8 { a::work() }\n",
        })
        meta = fake_meta(root, {"shop": [("app", "dev")], "app": [("shop", None, "store")], "clean": []})
        r = measure(meta)
        shop = next(m for m in r["modules"] if m["crate"] == "shop")
        pair = {"shop::billing", "shop::orders"}
        check(any(set(c["modules"]) == pair for c in shop["cycles"]), "planted module cycle not caught")
        deep = {(d["from"], d["at"].rsplit(":", 1)[1]) for d in shop["deep_reaches"]}
        check(("shop::orders", "1") in deep, "deep reach by `use` not caught")
        check(("shop::orders", "4") in deep, "deep reach through a module alias not caught")
        check(("shop::reports", "2") in deep, "deep reach by a path in a function body not caught")
        check(sum(d["from"] == "shop::reports" for d in shop["deep_reaches"]) == 1, "comment or string read as code")
        check(all(d["use_instead"] == ("store" if d["from"] == "app" else "crate") + "::billing::rate"
                  for d in shop["deep_reaches"] if d["path"].endswith("tax::rate")), "re-export of rate not offered")
        check(not any(d["from"].startswith("shop::billing") for d in shop["deep_reaches"]),
              "a module's own paths (super::) reported as a reach")
        check(not any("tests" in d["from"] for d in shop["deep_reaches"]), "cfg(test) module not skipped")
        check(not any("inner" in d["path"] for d in shop["deep_reaches"]), "inline module path reported")
        check(any(d["from"] == "app" and d["path"] == "store::billing::tax::rate" for d in shop["deep_reaches"]),
              "cross-crate reach past a re-export (renamed dependency) not caught")
        check(not any(d["path"] == "store::place" for d in shop["deep_reaches"]), "a root re-export reported as a reach")
        check(r["public_unused"] == ["shop::orders"], "public module no other member uses not listed")
        fan = {f["module"]: f for f in shop["fan"]}
        check(fan["shop::billing"]["fan_in"] == 2 and fan["shop::orders"]["fan_out"] == 1, "module fan counts wrong")
        check(any(set(c["crates"]) == {"app", "shop"} for c in r["crates"]["cycles"]), "dev-dependency crate cycle not caught")
        check(any(u["module"] == "shop::ghost" for u in r["unresolved_modules"]), "missing module file not reported")
        clean = next(m for m in r["modules"] if m["crate"] == "clean")
        check(not clean["cycles"] and not clean["deep_reaches"], "clean crate reported findings")
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            bad_manifest = run(["--manifest-path", str(root / "no-such" / "Cargo.toml")])
            bad_flag = run(["--bogus"])
        check(bad_manifest == 2, "bad manifest did not exit 2")
        check(bad_flag == 2, "unknown flag did not exit 2")
    for f in failures:
        sys.stderr.write(f"selftest FAIL: {f}\n")
    print(json.dumps({"status": "fail" if failures else "pass", "failures": failures}))
    return 1 if failures else 0


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        sys.exit(selftest())
    sys.exit(run(sys.argv[1:]))
