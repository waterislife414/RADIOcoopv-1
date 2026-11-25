"""Print a task's FILES (default) or READ list from AI_PROMPT.md.
Usage: python3 docs/ai/prompt-files.py T12 [files|read]
Accepts both styles: 'FILES: a, b. Done when ...' and 'FILES: a b READ: c d'."""
import re, sys

t = sys.argv[1]
kind = (sys.argv[2] if len(sys.argv) > 2 else "files").upper()
STOP = r"(?=\s+(?:FILES|READ):|\.?\s*Done when|\s*$)"
for line in open("AI_PROMPT.md", encoding="utf-8"):
    if line.startswith(t + " "):
        m = re.search(kind + r":\s*(.*?)" + STOP, line.rstrip())
        if m:
            parts = re.split(r"[,\s]+", m.group(1).strip().rstrip("."))
            print(" ".join(p for p in parts if p))
        elif kind == "FILES":
            # Fallback for lines written as "edit only tests/qa/step1.py; ..." with no FILES: tag.
            only = re.findall(r"edit only ([\w./-]+\.\w+(?:(?:,\s*|\s+and\s+)[\w./-]+\.\w+)*)", line)
            files = [f for grp in only for f in re.split(r",\s*|\s+and\s+", grp) if f]
            print(" ".join(dict.fromkeys(files)))
        break
