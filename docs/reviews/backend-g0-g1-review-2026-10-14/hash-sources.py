"""SHA-256 (LF, no BOM) of the Docs files pinned by snapshot S-2026-10-12b.

Usage: python hash-sources.py <docs-checkout> [rev ...]   (default revs: 0e0bb83 982ea92)
Prints: working-tree hash | hash at each rev | path
"""
import hashlib
import subprocess
import sys

FILES = [
    "Requiments/BRD - HỆ THỐNG QUẢN TRỊ BẢN QUYỀN PHẦN MỀM & TỐI ƯU CHI PHÍ CÔNG NGHỆ.md",
    "Requiments/Định nghĩa phạm vi & nghiệp vụ.md",
    "Decisions/project-decisions.md",
    "BE-UserStory/user-stories-and-epics.md",
    "BE-UserStory/epics/EP-01.md",
    "BE-UserStory/epics/EP-02.md",
    "BE-UserStory/epics/EP-03.md",
    "BE-UserStory/src/00-head.md",
    "BE-UserStory/src/99-tail.md",
    "BE-UserStory/src/EP-01.md",
    "BE-UserStory/src/EP-02.md",
    "ERD/CONCEPTUAL ERD - DANH SÁCH ENTITY.md",
]


def digest(data):
    if data.startswith(b"\xef\xbb\xbf"):
        data = data[3:]
    return hashlib.sha256(data.replace(b"\r\n", b"\n")).hexdigest()


def at_rev(docs, rev, path):
    result = subprocess.run(["git", "-C", docs, "show", f"{rev}:{path}"], capture_output=True)
    return digest(result.stdout) if result.returncode == 0 else "MISSING"


def main():
    docs = sys.argv[1]
    revs = sys.argv[2:] or ["0e0bb83", "982ea92"]
    for path in FILES:
        with open(f"{docs}/{path}", "rb") as handle:
            row = [digest(handle.read())] + [at_rev(docs, rev, path) for rev in revs]
        print(" | ".join(row), "|", path)


if __name__ == "__main__":
    main()
