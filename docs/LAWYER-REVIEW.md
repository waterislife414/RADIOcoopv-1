# Items for Malcolm's lawyer

The app was built carefully, but none of this is legal advice. Each line says what the app does
today and where to change it. Text lives in `src/legal/documents.js`; numbers live in
`branding.config.json` (changing a fee there also bumps the terms version, so everyone agrees again).

## Money
- [ ] **$2 card fee ($1.80 with a free account).** It's a flat fee on every card ride, debit cards included.
  Card networks generally allow surcharges only on credit cards, as a percentage within a cap, with
  notice to the processor and disclosure before payment. Options: a percentage credit-only
  surcharge, a cash discount, or a booking fee on all app rides.
  Change: `functions/index.js` (`CARD_APP_FEE_CENTS`, `CARD_APP_FEE_MEMBER_CENTS`), `src/config/fareCalc.js`, Terms §4.
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
  Georgia and Alabama are one-party-consent states. The caller hears "may be recorded"; the person who
  answers consented in the terms. Should the person answering also hear a notice (Florida and other
  all-party states)?
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
