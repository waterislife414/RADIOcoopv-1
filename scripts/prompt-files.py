"""Print a task's FILES or READ list from AI_PROMPT.md, space-separated.
Task line format: K3 name: steps... FILES: a.tsx, b.ts. READ: c.ts. Done when ...
Usage: python3 scripts/prompt-files.py K3 [files|read]"""
import re
import sys

task = sys.argv[1]
key = "READ" if len(sys.argv) > 2 and sys.argv[2] == "read" else "FILES"
for line in open("AI_PROMPT.md", encoding="utf-8"):
    if line.startswith(task + " "):
        m = re.search(key + r": (.*?)\.(?:\s+(?:FILES:|READ:|TEST:|Done when)|\s*$)", line)
        if m:
            print(" ".join(x.strip() for x in m.group(1).split(",") if x.strip()))
        break
