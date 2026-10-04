"""Check relative markdown links of the native hand-off file set (an extracted bundle or a workspace).

Usage (from anywhere; --root is the folder that contains Code/BE-dev-software-license-management/ and Docs/):
  python -B docs/guides/tools/check-handoff-links.py --root <dir containing Code/BE-.../ and Docs/> --files-from-manifest <manifest.json>
      [--baseline-be <BE git checkout>] [--baseline-docs <Docs git checkout>] [--out <json>]

A link target is OK when it exists under --root. Otherwise, when baseline checkouts are given, it is
'baseline-only' if the file is tracked in that repository's HEAD and unchanged in the working tree, and
'BASELINE-DIFFERS' if tracked but modified (the receiver would read an older version), else 'MISSING'.
Links into git-ignored areas (Reviews/, Reports/, docs/workspace/) are reported as 'IGNORED-AREA'.
BASELINE-DIFFERS compares with the working tree of the checkouts you pass: run against the preparer's workspace it proves
the bundle is complete; run by a receiver it reports files that differ in the receiver's own checkout.
Exit codes: 0 ok, 1 a required-reading link is MISSING/BASELINE-DIFFERS, 2 usage error (e.g. a baseline is not a git checkout).
"""
import argparse, json, os, re, subprocess, sys, urllib.parse

BE = "Code/BE-dev-software-license-management"
LINK = re.compile(r"(?<!!)\[[^\]]*\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)")
IGNORED = ("Docs/Reviews/", "Docs/Reports/", BE + "/docs/workspace/")
# Required reading: every BE markdown file and the Docs business core. Links from other (supporting diagram)
# files are reported for information only.
REQUIRED_DOCS = ("Docs/Decisions/project-decisions.md", "Docs/Requiments/", "Docs/BE-UserStory/",
                 "Docs/ERD/README.md", "Docs/ERD/CONCEPTUAL ERD - DANH SÁCH ENTITY.md", "Docs/ERD/logical/LOGICAL-ERD-S0.md")
# Known exceptions, each with its reason (pre-existing in the Docs repository, not created by the bundle).
EXCEPTIONS = {
    "Docs/Research-AI/evidence/": "git-ignored research evidence (Docs .gitignore: Research-AI/evidence); historical citations of QĐ-36/37, not needed for native work",
    "Docs/Diagrams/use-case-diagram/saas-sentry-use-case-diagram.drawio": "original Use Case diagram removed from the repository in commit 192632c (finding F29, pre-existing)",
}

def git_sets(repo):
    if not repo:
        return None
    probe = subprocess.run(["git", "-C", repo, "rev-parse", "--is-inside-work-tree"], capture_output=True)
    if probe.returncode != 0:
        print(f"error: {repo} is not a git checkout (needed for --baseline-*)", file=sys.stderr)
        sys.exit(2)
    tracked = set(subprocess.run(["git", "-C", repo, "ls-files", "-z"], capture_output=True, check=True).stdout.decode("utf-8").split("\0"))
    changed = set()
    out = subprocess.run(["git", "-C", repo, "status", "--porcelain=v1", "-z", "--untracked-files=no"], capture_output=True, check=True).stdout.decode("utf-8")
    for rec in out.split("\0"):
        if len(rec) > 3:
            changed.add(rec[3:])
    return tracked, changed

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", required=True)
    ap.add_argument("--files-from-manifest", required=True)
    ap.add_argument("--baseline-be")
    ap.add_argument("--baseline-docs")
    ap.add_argument("--out")
    a = ap.parse_args()
    root = os.path.abspath(a.root)
    man = json.load(open(a.files_from_manifest, encoding="utf-8"))
    files = [BE + "/" + e["path"] for e in man["backend"]] + ["Docs/" + e["path"] for e in man["docsRepository"]]
    sets = {BE + "/": git_sets(a.baseline_be), "Docs/": git_sets(a.baseline_docs)}
    results, counts = [], {}
    for f in files:
        if not f.endswith(".md"):
            continue
        p = os.path.join(root, f)
        if not os.path.exists(p):
            results.append({"file": f, "status": "SOURCE-MISSING"}); continue
        text = open(p, encoding="utf-8").read()
        text = re.sub(r"```.*?```", "", text, flags=re.S)
        for m in LINK.finditer(text):
            tgt = m.group(1)
            if re.match(r"^[a-z]+:", tgt) or tgt.startswith("#"):
                continue
            tgt = urllib.parse.unquote(tgt.split("#", 1)[0])
            if not tgt:
                continue
            rel = os.path.normpath(os.path.join(os.path.dirname(f), tgt)).replace("\\", "/")
            if os.path.exists(os.path.join(root, rel)):
                st = "ok"
            elif rel.startswith(IGNORED):
                st = "IGNORED-AREA"
            else:
                st = "MISSING"
                for pre, s in sets.items():
                    if s and rel.startswith(pre):
                        inner = rel[len(pre):]
                        tracked, changed = s
                        if inner in tracked or any(t.startswith(inner.rstrip("/") + "/") for t in tracked):
                            st = "BASELINE-DIFFERS" if inner in changed else "baseline-only"
            if st in ("MISSING", "BASELINE-DIFFERS"):
                why = next((v for k, v in EXCEPTIONS.items() if rel.startswith(k)), None)
                if why:
                    st = "EXCEPTION"
                elif not (f.startswith(BE + "/") or f.startswith(REQUIRED_DOCS)):
                    st = "INFO-" + st
            counts[st] = counts.get(st, 0) + 1
            if st != "ok":
                results.append({"file": f, "link": m.group(1), "resolved": rel, "status": st, **({"reason": why} if st == "EXCEPTION" else {})})
    rep = {"counts": counts, "problems": results}
    if a.out:
        json.dump(rep, open(a.out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(json.dumps(counts, ensure_ascii=False))
    for r in results:
        print(r["status"], "|", r.get("file"), "->", r.get("resolved"))
    bad = [r for r in results if r["status"] in ("MISSING", "BASELINE-DIFFERS", "SOURCE-MISSING")]
    sys.exit(1 if bad else 0)

main()
