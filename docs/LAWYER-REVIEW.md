# Items for Malcolm's lawyer

The app was built carefully, but none of this is legal advice. Each line says what the app does
today and where to change it. Text lives in `src/legal/documents.js`; numbers live in
`branding.config.json` (changing a fee there also bumps the terms version, so everyone agrees again).

## Changed Nov 23, 2026, fourth time (legal version 2026-11-23.4; everyone agrees again)
- [ ] **Terms §4, changing your trip.** During the ride a rider can change the drop-off in the app (the driver's phone
  shows it and rings) or tell the driver; stops on request. The meter keeps running, also while waiting at a stop
  ($0.35/min; the physical meter can't give free minutes mid-ride). Price Lock ends after a drop-off change or a stop.
  After 15 minutes at a stop (`rideRules.stopEndTripMinutes`) the driver may end the trip and charge the meter so far to
  the card; cash riders may be asked to pay the meter before a long stop. Disability: time helping a rider in or out is
  never a reason to end a trip. Is that enough for the ADA rule against extra charges for riders with disabilities?
- [ ] **Meter over the estimate.** The driver's typed meter can now go over the old limit (2.5x estimate + $15) when the
  rider approves it on the driver's phone (they see "This is more than the trip estimate"), or after a drop-off change
  or a stop (then only the $250 cap applies). Without the rider there, the old limit still sends it to the office.
- [ ] **Privacy §1, Google sign-in.** "Continue with Google" gives us name and email only. Riders who sign in with Google
  then add their phone and agree with the same one box. Later App Store (iOS) app: Apple requires an equivalent private
  sign-in option (Sign in with Apple) when Google sign-in is offered.

## Changed Nov 23, 2026, third time (legal version 2026-11-23.3; everyone agrees again)
Owner delegated these decisions to the build team ("easy, quick, accurate, few steps, good deals for loyal members").
- [ ] **No card fee (replaces the 3% credit surcharge).** Same price cash or card (`pricing.cardFee.mode` "none"). No
  surcharge means no 30-day card-network notice and no surcharge signs. Terms §4 card-fee line updated.
- [ ] **Driver agreement: card cost.** Card fares are credited to the driver's lease less the card company's charge
  (2.9% of the meter + 30c, `pricing.cardCost`); tips in full. This changes driver pay on card rides: drivers must be told
  before it starts, and the lease agreement should say it. Is a change to an existing lease allowed mid-term?
- [ ] **Member deals (new Terms §4 paragraph).** Price Lock: card rides booked in the app with a price shown are charged
  no more than the top of that price plus waiting time (not for stops or out-of-area); the company pays the difference,
  the driver gets the full meter. Ride credit: $3 off a first card ride (once per account and phone number) and plan
  rewards ($5 Basic / $10 Premium every 10 rides of $5+), no cash value, not transferable, ends when the account closes.
  Columbus (2013 draft Sec. 21-9(b)) allows a fare at or under the meter with the meter running; confirm the current
  text and Phenix City (rides that start in Alabama). Does a promotional credit need any state gift-card/escheat wording?
- [ ] **Rider approves on the driver's phone.** At drop-off the driver types the meter; the rider sees the fare and taps a
  tip or "No tip" on the driver's phone, which charges the saved card. If the rider already left, the driver charges the
  fare with no tip (rider can tip in the app). Receipt in the app has "Something wrong with this charge?" (goes to the
  office with the meter next to the estimate). Is this approval enough evidence in a chargeback?
- [ ] **Rider agreement is now one box** (riders only; drivers unchanged): the four money rules in plain words, a link to
  the full Terms and Privacy, one required box ("I agree to the Terms and Privacy Policy, and to calls, texts and emails
  about my rides") and an optional deals box that starts unticked. Courts enforce a clearly linked checkbox (Meyer v. Uber;
  Berman). The deals box is unticked because a pre-ticked box is weak consent for marketing texts (TCPA).
- [ ] **One-tap booking with the saved card** (members): the card saved at an earlier booking is used for the new hold.
  Terms §4 now says the card is saved for later rides when the rider has an account.
- Premium no longer includes 3 Day Passes a month (it already has front of the line, map and calling); Premium gets $10 off
  every 10th ride instead. No member had paid for Premium yet (nothing live).

## Changed Nov 23, 2026, second time (legal version 2026-11-23.2; everyone agrees again)
- [ ] **Terms §4, card fee (now a credit-card surcharge).** Was a flat $2.00 ($1.80 with an account) on
  every card payment. Now: credit cards up to 3% of the amount charged, never more than our cost to
  accept the card; debit and prepaid cards: no fee (`pricing.cardFee` in `branding.config.json`,
  `functions/lib/cardFee.mjs`). Why: Visa and Mastercard do not allow a surcharge on debit or prepaid
  cards, Visa caps credit-card surcharges at 3%, and Georgia law limits a surcharge to the merchant's
  cost of accepting the card. Before turning it on with real money:
  1. Stripe must tell the card networks 30 days ahead (Stripe surcharging setup / network notice).
  2. Signs: a surcharge notice at the point of sale (the app shows it on the payment screen and
     receipt; ask if the cab needs a decal, and what Alabama/Phenix City requires for rides that
     start in Alabama).
  3. The receipt must show the fee as its own line (the app does: "Card fee (credit card)").
  To go back to a flat fee: set `pricing.cardFee.mode` to "flat" (or "none" for no fee).
- [ ] **Terms §4, who enters the meter.** Card rides: at drop-off the driver types the amount on the
  meter and the saved card is charged. A typed amount more than 2.5x the trip estimate (+$15) or over
  $250 is refused and goes to the office (`pricing.driverMeter`). The rider sees the receipt and can
  add a tip once. Is the driver's typed amount enough, or does the lawyer want a meter photo or the
  rider's tap to approve before the charge?

## Changed Nov 23, 2026 (legal version 2026-11-23.1; everyone agrees again)
- [ ] **Terms §4, Priority Day Pass.** Now: the pass moves rides "to the same place in line as Premium
  members" (owner decision Nov 18). Before: Premium went first. Code: `functions/lib/dispatchCore.mjs`,
  `functions/lib/rideTiming.mjs` (`PRIORITY_RANK`), `copy.dayPass.fine`.
- [ ] **Privacy §3, deleting an account.** New paragraph: riders can delete their account in the app or
  on the Delete your account page; profile, ID/face photos and sign-in are deleted; ride and payment
  records and any unpaid-fee note are kept. Google Play requires an in-app path and a web page.
  Code: `functions/account.js` (`deleteMyAccount`), `src/pages/DeleteAccount.jsx`.
- [ ] **Price shown before booking.** The booking screen shows "About $X" from the meter rate for the
  estimated road miles, with the range, "The meter sets the final fare" and "No surge, ever." No
  price lock yet. If the owner wants "you pay this or the meter, whichever is lower": a 2013 Columbus
  draft (Sec. 21-9(b)) allows a flat or discounted fare equal to or less than the metered fare, with
  the meter running. Confirm the current code text and Phenix City's rules first.
- [ ] **Price comparison.** Home and Compare now show Uber's own published Columbus averages
  (uber.com Columbus city page, average UberX over the past month, checked Nov 23, 2026) next to our
  meter for the same miles; out-of-town trips say "call for a quote". Uber says those are not fixed
  or guaranteed prices. Is the footnote enough? How often must it be re-checked (monthly suggested)?
- [ ] **Membership perks.** The plan pages now list only what the app does. "A free entry fee every 10
  rides" was advertised but never taken off at checkout; it is hidden (`promo.FREE_ENTRY_ACTIVE`)
  until built. Members already sold on that promise (if any) need a decision.
- [ ] **Agreement style (not changed).** Riders scroll to the end before the boxes unlock, every
  booking for guests. Courts generally enforce a checkbox next to clearly linked terms
  (Meyer v. Uber, 2d Cir. 2017; Berman v. Freedom Financial, 9th Cir. 2022: reasonably conspicuous
  notice + an unambiguous act of assent). A one-line "I agree to the Terms and Privacy Policy" box with
  links would cut booking friction. Owner and lawyer decide.

## Money
- [ ] **$2 card fee ($1.80 with a free account).** It's a flat fee on every card ride, debit cards included.
  Card networks generally allow surcharges only on credit cards, as a percentage within a cap, with
  notice to the processor and disclosure before payment. Options: a percentage credit-only
  surcharge, a cash discount, or a booking fee on all app rides.
  Change: `functions/index.js` (`CARD_APP_FEE_CENTS`, `CARD_APP_FEE_MEMBER_CENTS`), `src/config/fareCalc.js`, Terms §4.
  Research Nov 23, 2026 (not legal advice): Visa and Mastercard prohibit surcharging debit and prepaid
  cards, even when run as credit. Georgia limits a credit-card surcharge to the merchant's cost of
  acceptance. On an $8-$12 fare, Stripe's cost (about 2.9% + 30 cents) is roughly 55-65 cents, so a flat
  $2 is likely above cost. Options to decide: (a) credit-only percentage within cost, debit/prepaid free
  (Stripe reports card.funding); (b) a flat app booking fee on every app ride, any payment method
  (then drop "No booking fee"); (c) fold costs into a cash discount. The booking and payment screens now
  show the fee in the total before paying.
- [ ] **Cancel fee $5, no-show fee $10, Priority Day Pass $5, wait time after 2 minutes.** These are charges
  on a city-licensed taxi beyond the meter. Do Columbus Code Ch. 21 and Phenix City's taxi rules
  allow them? Must they be on the rate card posted in the cab?
  Change: `branding.config.json` → `rideRules`; Day Pass price `functions/index.js` `PRIORITY_PASS_FEE_CENTS` + `copy.dayPass`.
- [ ] **Unpaid fees.** Fees the card hold or saved card can't cover are recorded as owed and added to a later
  card payment in the app. Is that disclosure enough?
  Change: Terms §4, `functions/rideFees.js`.
- [ ] **Non-refundable.** Rides, memberships and add-ons are non-refundable once dispatched or completed;
  the Day Pass is non-refundable once paid. Check against Georgia and Alabama consumer law.

## Riders with disabilities (ADA)
- [ ] Riders who need extra time (marked by the office) are not charged wait time or no-show fees, and
  service animals ride free. Is that enough, and should riders be able to ask for it themselves?
  Change: Terms §5a, `rideRules`, rider record `extraTime`.

## Calls, location and records
- [ ] **Call recording.** Calls between rider and driver go through the company's number and are recorded.
  Georgia and Alabama are one-party-consent states. Both people hear "may be recorded": the caller
  before it rings, the person answering before they're connected. Both also agreed in the terms.
  Is that enough for riders from all-party states such as Florida?
  Change: `branding.config.json` → `calling.recordCalls` / `calling.greeting`; Terms; Privacy.
- [ ] **Recording retention.** Pick a period (90 days suggested), set it in Twilio, and state it in the Privacy Policy.
- [ ] **Location.** Riders share location until pickup when they choose to; drivers' locations are seen by
  the office, and by riders with the map while the driver is on their call. Is the Privacy Policy
  wording enough?

## Collections and courts
- [ ] **Theft of services.** The Terms cite Georgia law (O.C.G.A. § 16-8-5). Phenix City rides may need the
  Alabama statute too. Confirm the right citation.
- [ ] **Venue.** The Terms say suits go to Muscogee County, Georgia courts. Does that hold for Alabama riders?

## Drivers
- [ ] **Independent contractors (1099) on a daily lease.** Workers' comp and misclassification risk (for example
  the Yellow Cab v. Karwoski line of cases). Review the Driver Agreement §2 and the lease terms.
- [ ] **Liability.** The Driver Agreement puts vehicle responsibility, damage, tickets and conduct on the driver.
  Georgia carriers owe extraordinary diligence that can't be contracted away (O.C.G.A. 46-9-132), and
  Alabama doesn't let a carrier hand its liability to a contractor (Connell v. Call-A-Cab). How far do
  these clauses really go?
- [ ] **Background checks (FCRA).** The disclosure is a separate step before the check. Confirm the wording
  and the adverse-action steps. Change: `background-check` document in `documents.js`, `src/pages/Careers.jsx`.
- [ ] **Screening questions.** Eight yes/no questions on the driver application. Check them against
  Georgia/Alabama and EEOC guidance. Change: `src/config/driverScreening.js`.

## Insurance
- [ ] Confirm the company's commercial auto policy, the city-required limits, and that the Terms and
  Driver Agreement match what the policy actually covers.

## Added 2026-11-16 (Jared request, wording written by the build team, NOT reviewed)
- Booking small print (TripDetails, data-testid address-disclaimer): "Check your addresses before you book. You are responsible for the pickup and drop-off information you enter. If it is wrong, the company is not responsible, and the normal cancellation fee still applies. Anything about the trip is between you and your driver." Counsel: enforceability of the wrong-address fee and the broad no-responsibility wording; whether it belongs in Terms with acceptance.
- Compare page: "Up to X% less" wording plus an estimates footnote (T22). Counsel: substantiation of Uber and Lyft figures.
- Driver incentives (points, free lick days tied to ratings, planned): note for the worker-classification review that rewards tied to ratings and rides are a control factor.
- Default-checked text and promo boxes at sign-up (T14): counsel to review TCPA consent (pre-checked boxes are often not valid consent for marketing texts).
