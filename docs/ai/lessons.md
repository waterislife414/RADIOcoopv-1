# Lessons (the manager adds one line after every miss; read before working)
L1 Never guess an import, prop, route, config key or icon name. grep the repo first; if it does not exist, say so.
L2 A file you are told to create must contain real, working code. An empty file is a failed task.
L3 Edit only the FILES your task names (plus new files it asks for). Do not touch workflows, docs, package.json, lockfiles, AGENTS.md or AI_PROMPT.md.
L4 Business name, phone, email, hours, prices: import from config/*.ts. Never hard-code them.
L5 Your final message must list: files changed, what you verified (lint/tsc/build result), what you did not verify. Do not claim success you did not see.
L6 This is TypeScript strict with noUncheckedIndexedAccess: array[i] can be undefined; handle it. No `any`.
L7 Before creating a file, check whether it exists. If it exists, READ it and edit it; never overwrite a working file.
L8 Next 16: page/route `params` and `searchParams` are Promises — `const { id } = await params`. `cookies()`/`headers()` are async.
L9 A component using useState/useEffect/onClick needs 'use client' on line 1. Server-only libs must never be imported into it.
L10 When a QA check fails, the line ends with ':: SCREEN [url] h1=... buttons=[...]' showing what the page really had. Compare that with the selector before changing code.
L11 Free tiers are small. Read the files first, plan, then make ONE complete edit; no exploration chatter.
L12 Passing lint and build does NOT prove the UI works. Only the click-through score decides a merge.
