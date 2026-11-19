# Kyle's Auto & Mobile Repair

Next.js 16 (App Router, TypeScript) · Tailwind v4 · Supabase · Stripe · Resend · `qrcode`.
Phenix City, AL 36869 / Columbus, GA. Shop bay plus mobile mechanic.

> Branch `kyle/main` of `waterislife414/RADIOcoopv-1`. It is a separate app from Radio Co-op and shares the repo only for the AI-team workflows and secrets.

## Structure
```
app/
  (site)/            public site: / · /book · /book/confirmation/[ref] · /memberships
  invoice/[token]/   tokenized estimate → approve → pay → /receipt (print/PDF)
  admin/             /admin/login + (protected): jobs board, jobs/[id], invoices, invoices/[id|new], qr, memberships, settings
  api/               bookings, availability, uploads, promos/validate, checkout/{deposit,invoice,membership}, billing-portal, stripe/webhook
  robots.ts sitemap.ts opengraph-image.tsx not-found.tsx layout.tsx globals.css
components/          home/ booking/ invoice/ admin/ memberships/ layout/ ui/
config/              business.ts serviceArea.ts services.ts scheduling.ts promos.ts memberships.ts media.ts content.ts
lib/                 supabase/{admin,server,browser}.ts db/ stripe.ts webhooks.ts email.ts email-templates.ts
                     invoice-math.ts invoices.ts bookings.ts validation.ts qr.ts qr-png.ts ics.ts time.ts money.ts ids.ts auth.ts demo.ts
supabase/schema.sql  tables, RLS, storage buckets, seeds (tax presets, promos, admin)
proxy.ts             Next 16 proxy: refreshes the Supabase session and gates /admin
tests/               unit (npm test) · qa/ Playwright click-through (bash tests/qa/run.sh)
scripts/             stripe-setup.ts · merge-bot.sh · prompt-files.py
```

## Try it with no keys (demo mode)
```bash
npm ci
npm run build:demo && npm run start:demo   # http://localhost:3000
```
Bookings, approvals and payments are simulated and kept in cookies. The sample estimate is at `/invoice/demo-estimate-kyles-auto-0001`.
**Shareable preview:** import this repo into Vercel, set the Production Branch to `kyle/main`, add the env var `NEXT_PUBLIC_DEMO_MODE=1`, then deploy.

## Go live
1. **Supabase:** create a project → SQL Editor → run `supabase/schema.sql`. Auth → disable public sign-ups → add user `kyledubios2412@gmail.com` with a password (this is the admin).
2. **Stripe:** `STRIPE_SECRET_KEY=sk_... npm run stripe:setup` prints the membership price IDs. Turn on Apple Pay / Google Pay in Payment methods. Turn on the Customer Portal and copy its login link. Add a webhook to `https://<site>/api/stripe/webhook` with these events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.updated`, `customer.subscription.deleted`, `charge.refunded`.
3. **Resend:** verify the sending domain and set `EMAIL_FROM`. Replies go to `kyledubios2412@gmail.com`.
4. Copy `.env.example` → hosting env vars (Vercel or Netlify) and deploy. Do **not** set `NEXT_PUBLIC_DEMO_MODE`.
5. Fill in the placeholders in `config/business.ts`: street, phone, Google review link and exact geo. Add real photos to `config/media.ts` and set `SHOW_PHOTO_GUIDANCE=false`. Add only real reviews to `config/content.ts`.

## Checks
`npx eslint .` · `npx tsc --noEmit` · `npm test` · `npm run build` · `bash tests/qa/run.sh` (click-through, must be all-pass).

## AI team (free workers)
Tasks are K-numbered lines in `AI_PROMPT.md`. Push `ai-go/K1` off `kyle/main`, or run `gh workflow run ai-task.yml --ref kyle/main -f task=K1`.
Merge with `gh workflow run merge-bot.yml --ref kyle/main -f tasks="K1 K2"`. The result is on branch `kyle/merge-result`.
QA alone: `gh workflow run qa.yml --ref kyle/main`. The result is on branch `kyle/qa-result`.
