import re, sys
t = sys.argv[1]
for line in open("AI_PROMPT.md"):
    if line.startswith(t + " "):
        m = re.search(r"FILES: (.*?)\.\s*Done when", line)
        if m:
            print(" ".join(x.strip() for x in m.group(1).split(",") if x.strip()))
        break
