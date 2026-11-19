# Dubois Automotive Rescue (Kyle Dubois): what every worker must know
Business: one-man auto repair in Phenix City, AL 36869 (shop bay + mobile mechanic, ~25 mi radius incl. Columbus GA / Fort Benning). Owner/tech Kyle Dubois. Customers are often standing next to a broken car on a phone. Appointment times are Eastern Time (ET).
Stack: Next.js 16 App Router, TypeScript strict, Tailwind v4 (tokens in app/globals.css: ink #0F172A, steel #1E293B, brand amber #F59E0B, ok emerald #10B981; font "Archivo Variable"; utilities `font-display`, `hazard`, `grid-plate`). Icons: lucide-react (check the name exists in node_modules/lucide-react/dist/lucide-react.d.ts; e.g. there is no Trash2/Loader2/AlertTriangle — use Trash, LoaderCircle, Info).

## Config (single source of truth)
config/business.ts (BUSINESS, BUSINESS_EMAIL, telHref, mailtoHref, publicShopAddress, SHOW_EXACT_SHOP_ADDRESS) · config/services.ts (SERVICES, SERVICE_BY_ID; ids: diagnostics, brakes, battery, starter, alternator, oil-change, fluids, belts, pre-purchase, transmission, engine, alignment, ac, suspension) · config/serviceArea.ts (checkCoverage, SERVICE_ZIPS) · config/scheduling.ts (BOOKING_WINDOWS) · config/promos.ts · config/memberships.ts (PLANS) · config/media.ts (PHOTOS, BEFORE_AFTER, VIDEOS, SHOW_PHOTO_GUIDANCE) · config/content.ts (REVIEWS — real only, never invent; FAQ).

## Data map (supabase/schema.sql, verified)
customers, vehicles, bookings (ref KA-XXXXXXX, mode mobile|shop, status new→estimate_sent→approved→in_progress→completed→paid|cancelled), invoices (token, status draft|sent|approved|paid|void, *_cents, tax_rate_ppm), invoice_items, inspection_photos (rating green|yellow|red), memberships, promos, tax_presets, business_settings (row id=1), admins, stripe_events. Row types: lib/db/types.ts.

## Key files
app/(site)/page.tsx home · components/home/* (Hero, OffersBar, RadiusChecker, ServicesGrid, BeforeAfter, VideoShowcase, Reviews, Faq) · app/(site)/book/page.tsx + components/booking/BookingWizard.tsx (5 steps + confirmation) · app/(site)/book/confirmation/[ref]/page.tsx · app/(site)/memberships/page.tsx + components/memberships/MembershipPlans.tsx · app/invoice/[token]/page.tsx (+ receipt/) · components/invoice/* · app/admin/(protected)/* (Supabase-auth admin; disabled in demo) · components/admin/* · components/ui/Button.tsx (Button, ButtonLink, buttonClasses) · components/ui/PhotoSlot.tsx.

## Routes
/ · /book (?mode=mobile|shop&service=<id>&promo=<CODE>&zip=<5 digits>) · /book/confirmation/[ref] · /memberships · /invoice/[token] · /invoice/[token]/receipt · /admin/* · /api/* (bookings, availability, uploads, promos/validate, checkout/*, billing-portal, stripe/webhook) · /robots.txt /sitemap.xml /opengraph-image.

## Demo mode (no keys)
`npm run build:demo` then `npm run start:demo`. lib/demo.ts: DEMO flag, sample invoice at /invoice/demo-estimate-kyles-auto-0001, bookings/approvals kept in cookies. Admin pages redirect to /admin/login in demo.

## QA
tests/qa/run.sh (demo build → next start :8790 → tests/qa/step1.py with Playwright; prints `== step1 score P/N` and `  FAIL ...` lines with `:: SCREEN` diagnostics). Unit tests: tests/*.test.ts via `npm test` (tsx --test). Current baseline: 14/14.
