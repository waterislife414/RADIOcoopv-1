# Instructions for any AI working on this repo (Radio Co-op Taxi)

Read first: `docs/HANDOVER.md`, `docs/LAWYER-REVIEW.md`, and the build spec (`build-spec-2026-11-15.md` + part 2) if the owner gave it to you.

## The stack is NOT Supabase and NOT TypeScript
React 19 + Vite + Tailwind (plain JavaScript/JSX) · Firebase: Auth, Firestore, Storage, Cloud Functions v2 (CommonJS in `functions/`) · Stripe · Twilio. Security lives in `firestore.rules` (there is no RLS). Shared pure logic is in `functions/lib/*.mjs` with tests beside it.

## Work rules
1. One numbered spec section per branch/commit. Branch name `ai/<section>`. Never push to main.
2. Everything must work in BOTH builds: `npm run build` and `npm run build:demo` (demo stand-ins are in `src/demo/`; don't delete them).
3. Before saying "done": `npx oxlint src functions`, both builds, `node --test functions/lib/*.test.mjs`. Server/rules changes also need the emulator tests (`tests/e2e/*.e2e.cjs`, `tests/rules`). Say plainly what you did NOT run.
4. Config values go in `branding.config.json` (then `node scripts/sync-branding.mjs`). No hard-coded phone numbers, prices or colors.
5. Money is integer cents.

## Never do (stop and ask the owner instead)
- Never type, create, print or commit any secret key, token, password or card/bank detail. Keys are filled in later by the owner only.
- Never deploy, publish, or run `firebase deploy`. Never touch the live site or any Stripe/Twilio/Google account.
- Never write board, offers, ledger, wallet, referral, payment or payout data from the client. Only Cloud Functions write those; keep it that way and add a rules test for any new collection.
- Never weaken `firestore.rules` to make something work.
- Never call Radio Co-op a "middleman"; never invent legal wording. Legal text changes bump `policies.legalVersion` and go on `docs/LAWYER-REVIEW.md`.

## Safe for a free model
Single-screen UI work: rating modal, agreement boxes, plan dropdown, driver application questions, roster add/remove, copy and layout fixes.

## Needs the owner's reviewer (Claude) before merge
Dispatch/lease logic, `firestore.rules`, anything in `functions/` touching money, fees, shifts, PINs, or permissions.
