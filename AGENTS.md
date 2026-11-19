# Instructions for any AI working on Kyle's Auto & Mobile Repair (branch kyle/main)
This branch is a SEPARATE app that shares a GitHub repo with Radio Co-op. Never touch `main`, `step1-wip` or any `T`-numbered branch. Kyle tasks are `K1, K2 ...`; your branch is `ai/<K>`.
Read first: docs/ai/KNOWLEDGE.md and docs/ai/lessons.md.

## Stack (this branch)
Next.js 16 App Router + React 19 + **TypeScript (strict)** + Tailwind CSS v4 + lucide-react. Supabase (Postgres + RLS + Storage), Stripe Checkout, Resend.
It is **NOT** Firebase, **NOT** Vite, **NOT** plain JS. There is no `src/`, no `functions/`, no `firestore.rules`.

## Rules
1. Before saying done: `npx eslint .`, `npx tsc --noEmit`, `npm test`, `npm run build`, `bash tests/qa/run.sh` (demo click-through must stay all-pass). Say plainly what you did NOT run.
2. Business facts (name, phone, email, hours, rates, warranty) come from `config/*.ts`. Never hard-code them in components.
3. The email is `kyledubios2412@gmail.com` — "dubios" is intentional. Never "fix" it.
4. Money is integer cents. Tax rates are parts-per-million (9.75% = 97500).
5. Server-only modules import `'server-only'`. Client components start with `'use client'` and must not import from `lib/supabase/admin`, `lib/stripe`, `lib/email*`, `lib/bookings`, `lib/invoices`, `lib/demo`.
6. Every new page must work in DEMO mode (`NEXT_PUBLIC_DEMO_MODE=1`, no keys). Guard any data call with `DEMO` from `lib/demo.ts`.
7. Phone-first: tap targets ≥ 44px, inputs ≥ 16px text, nothing hover-only. Keep copy short and plain.

## Never (stop and ask the owner)
- Never type, create, print or commit secrets/keys/tokens/card or bank details.
- Never deploy or touch live Supabase/Stripe/Resend accounts.
- Never change `supabase/schema.sql` RLS policies, `lib/stripe.ts`, `lib/webhooks.ts`, `app/api/stripe/**`, `app/api/checkout/**`, `lib/invoice-math.ts`, `lib/auth.ts`, `proxy.ts`, or admin server actions.

## Safe for free workers
Single-screen UI and copy, new static/SEO pages, loading/error states, test files, accessibility fixes.

## Manager only (Claude)
Payments, tax math, auth/permissions, RLS/schema, webhooks, booking/invoice business logic.
