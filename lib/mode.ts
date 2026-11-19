/**
 * Site modes (client-safe — no server imports).
 * LAUNCH (NEXT_PUBLIC_LAUNCH_MODE=1): zero-cost live mode. No Supabase/Stripe/Resend.
 *   Bookings go to Netlify Forms + the customer texts/emails Kyle. Prices/specials come from Kyle's Google Sheet.
 *   Memberships, online payments, digital invoices and admin are hidden until the business is ready for them.
 * DEMO  (NEXT_PUBLIC_DEMO_MODE=1): clickable preview with fake data (used by CI click-through).
 */
export const LAUNCH = process.env.NEXT_PUBLIC_LAUNCH_MODE === '1';
export const DEMO_ONLY = process.env.NEXT_PUBLIC_DEMO_MODE === '1' && !LAUNCH;
