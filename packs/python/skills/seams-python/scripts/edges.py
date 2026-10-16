"""Measure the edges of a Python package with grimp: fan-in and fan-out, cycles, and deep imports.

    python scripts/edges.py <package> [--at <subpackage>] [--exclude-type-checking]
    python scripts/edges.py --selftest

<package> is the top-level package, importable from the current environment (installed, or on the path).
--at picks the package whose children are measured (default: <package>).

A deep import is a direct import from outside a child package into one of its descendants (past its
__init__). Private means some part of the imported name starts with a single underscore.

stdout: one JSON object; stderr: a human-readable report.
Exit: 0 no cycles or deep imports, 1 findings, 2 could not run (grimp missing, package not importable).
"""

import json
import sys
import tempfile
from pathlib import Path


def is_private(module):
    return any(p.startswith("_") and not p.startswith("__") for p in module.split("."))


def within(module, package):
    return module == package or module.startswith(package + ".")


def child_of(module, children):
    return next((c for c in children if within(module, c)), None)


def measure(package, at=None, exclude_type_checking=False):
    import grimp

    graph = grimp.build_graph(package, exclude_type_checking_imports=exclude_type_checking, cache_dir=None)
    at = at or package
    if at not in graph.modules:
        raise LookupError(f"{at} is not in the graph of {package}")
    children = sorted(graph.find_children(at))
    edges = {c: set() for c in children}
    deep = []
    for importer in sorted(graph.modules):
        for imported in sorted(graph.find_modules_directly_imported_by(importer)):
            src, dst = child_of(importer, children), child_of(imported, children)
            if dst is None or src == dst:
                continue
            if src is not None:
                edges[src].add(dst)
            if imported != dst:
                lines = graph.get_import_details(importer=importer, imported=imported)
                deep.append({
                    "importer": importer,
                    "imported": imported,
                    "interface": dst,
                    "private": is_private(imported[len(dst):]),
                    "lines": [d["line_number"] for d in lines],
                })
    fan = [
        {"module": c, "fan_in": sum(c in e for e in edges.values()), "fan_out": len(edges[c]),
         "imports": sorted(edges[c])}
        for c in children
    ]
    cycles = []
    for p in [at] + [c for c in children if graph.find_children(c)]:
        breakers = graph.nominate_cycle_breakers(p)
        if breakers:
            cycles.append({"package": p, "break_by_removing": sorted([a, b] for a, b in breakers)})
    return {"package": package, "at": at, "fan": fan, "cycles": cycles, "deep_imports": deep}


def report(r):
    log = lambda s="": sys.stderr.write(s + "\n")
    log(f"Edges of {r['at']} ({len(r['fan'])} children)")
    for f in sorted(r["fan"], key=lambda f: (-f["fan_in"], f["module"])):
        log(f"  {f['module']}: fan-in {f['fan_in']}, fan-out {f['fan_out']}")
    log(f"Cycles: {len(r['cycles'])}")
    for c in r["cycles"]:
        log(f"  in {c['package']}, break by removing: " + ", ".join(f"{a} -> {b}" for a, b in c["break_by_removing"]))
    log(f"Deep imports: {len(r['deep_imports'])}")
    for d in r["deep_imports"]:
        tag = " (private)" if d["private"] else ""
        log(f"  {d['importer']} -> {d['imported']}{tag}, past {d['interface']}, line {d['lines']}")


def run(argv):
    args = [a for a in argv if not a.startswith("--")]
    at = argv[argv.index("--at") + 1] if "--at" in argv else None
    if at in args:
        args.remove(at)
    if len(args) != 1:
        sys.stderr.write(__doc__)
        return 2
    try:
        r = measure(args[0], at, "--exclude-type-checking" in argv)
    except ImportError as e:
        sys.stderr.write(f"edges: grimp is not installed in this environment ({e})\n")
        print(json.dumps({"status": "error", "reason": "grimp missing"}))
        return 2
    except Exception as e:
        sys.stderr.write(f"edges: could not build the graph for {args[0]}: {e}\n")
        print(json.dumps({"status": "error", "reason": str(e)}))
        return 2
    report(r)
    print(json.dumps(r))
    return 1 if r["cycles"] or r["deep_imports"] else 0


def write(root, files):
    for rel, text in files.items():
        p = root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding="utf-8")


def selftest():
    failures = []
    check = lambda ok, what: ok or failures.append(what)
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        write(root, {
            # Planted faults: a cycle between billing and orders, and a deep private import.
            "planted/__init__.py": "",
            "planted/billing/__init__.py": "from planted.billing.invoice import charge\n",
            "planted/billing/_gateway.py": "def send(n):\n    return n\n",
            "planted/billing/invoice.py": "from planted.billing._gateway import send\nfrom planted.orders import total\n\ndef charge(n):\n    return send(total(n))\n",
            "planted/orders/__init__.py": "from planted.billing._gateway import send\n\ndef total(n):\n    return send(n)\n",
            # Clean: orders uses billing only through its interface.
            "clean/__init__.py": "",
            "clean/billing/__init__.py": "from clean.billing._gateway import send as charge\n",
            "clean/billing/_gateway.py": "def send(n):\n    return n\n",
            "clean/orders/__init__.py": "from clean.billing import charge\n",
        })
        sys.path.insert(0, tmp)
        try:
            p = measure("planted")
            check(any(c["package"] == "planted" for c in p["cycles"]), "planted cycle not caught")
            check(any(d["imported"] == "planted.billing._gateway" and d["private"] and d["lines"] == [1]
                      for d in p["deep_imports"]), "planted deep private import not caught")
            fan = {f["module"]: f for f in p["fan"]}
            check(fan["planted.orders"]["fan_out"] == 1 and fan["planted.billing"]["fan_in"] == 1, "fan counts wrong")
            c = measure("clean")
            check(not c["cycles"] and not c["deep_imports"], "clean package reported findings")
            check(run(["no_such_package_xyz"]) == 2, "unimportable package did not exit 2")
        finally:
            sys.path.remove(tmp)
    for f in failures:
        sys.stderr.write(f"selftest FAIL: {f}\n")
    print(json.dumps({"status": "fail" if failures else "pass", "failures": failures}))
    return 1 if failures else 0


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        sys.exit(selftest())
    sys.exit(run(sys.argv[1:]))
