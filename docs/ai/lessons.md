# Lessons (the manager adds one line after every miss; read before working)
L1 Never guess a collection, field, route or test-id. grep for it in the repo first; if it does not exist, say so in your reply.
L2 A file you are told to create must contain real, working code. An empty file is a failed task.
L3 Edit only files the task names (plus new files it asks for). Do not touch .gitignore, workflows or docs.
L4 Do not hard-code the business name or phone numbers; use branding.config.json.
L5 Your final message must list: files changed, what you verified (lint/build result), what you did not verify. Do not claim success you did not see.
L6 If a condition needs data the server does not send (like details.settings), say so instead of coding a branch that can never run.
L7 Before creating any file, check whether it already exists (ls / grep). If it exists, READ it and edit it; never overwrite or replace a working file with a new version.
L8 Files under /tmp or outside the repo do not exist for you. Import helpers only from paths inside the repo (e.g. tests/qa/common.py).
L9 When a QA check fails, the failure line now ends with ':: SCREEN [url] testids=[...] buttons=[...]' showing what the page really had. Compare that with the selector the test waits for before changing any code.
