/**
 * Reviews: ONLY paste real reviews (e.g. copied from Google with the customer's first name + last initial).
 * The section shows a "be one of the first" CTA while this list is empty. Never invent reviews —
 * fabricated testimonials violate FTC rules and Google's policies.
 *
 * Shape example (do not ship as-is):
 *   { author: 'Marcus T.', rating: 5, date: '2026-10-02', job: '2016 F-150 Alternator', location: 'Phenix City', duration: '90 mins',
 *     text: '...exact customer wording...', source: 'google' }
 */
export type Review = {
  author: string;
  rating: 1 | 2 | 3 | 4 | 5;
  date: string;
  job: string;
  location: string;
  duration?: string;
  text: string;
  source: 'google' | 'facebook' | 'direct';
};

export const REVIEWS: readonly Review[] = [];

export type FaqItem = { q: string; a: string };

export const FAQ: readonly FaqItem[] = [
  {
    q: 'What do you need from me for a mobile repair?',
    a: 'A flat, paved or firm surface (driveway, parking lot, or level street spot where parking is legal) with room to open the hood and doors. If you are at an apartment or workplace, check that on-site repairs are allowed. Brakes, batteries, starters, alternators, belts, fluids, and diagnostics are all mobile-friendly.',
  },
  {
    q: 'What jobs have to come to the shop?',
    a: 'Anything that needs a lift or special equipment: transmissions, heavy engine work, alignments, A/C recovery/recharge, and suspension rebuilds. If we arrive and find the job needs a lift, we will tell you before doing anything and help arrange getting it to the bay.',
  },
  {
    q: 'What if you can’t find or fix the problem?',
    a: 'Then you don’t pay. If Kyle can’t diagnose it or can’t fix it, there’s no charge — not for the diagnostic and not for the trip out.',
  },
  {
    q: 'Where do your parts come from? Can I bring my own?',
    a: 'We use quality OEM-equivalent or OEM parts from local suppliers in Phenix City and Columbus so most jobs get done same day. You can supply your own parts; those jobs are labor-only.',
  },
  {
    q: 'How do I pay?',
    a: 'You get an itemized digital estimate to approve before work starts. When the job is done, pay by card, Apple Pay, or Google Pay from the same link. Fleet accounts can be set up with monthly invoicing and net-15 terms.',
  },
  {
    q: 'Do you cover both Alabama and Georgia?',
    a: 'Yes. Mobile service covers roughly 25 miles from our Phenix City base — Phenix City, Ladonia, Smiths Station, Seale, Columbus, Fort Benning, Midland, and Fortson. Sales tax is charged at the rate for where the work is done. Enter your ZIP above to confirm coverage.',
  },
  {
    q: 'Is the diagnostic fee really waived?',
    a: 'Yes. If you approve the repair we diagnosed, the diagnostic fee comes off your invoice. If Kyle finds the problem and you decide not to repair, you pay only the diagnostic fee and keep the written findings. If he can’t find it, you pay nothing.',
  },
  {
    q: 'What time zone are your appointments in?',
    a: 'All appointment windows and reminders are Eastern Time (ET), the same clock Phenix City and Columbus run on day-to-day.',
  },
];
