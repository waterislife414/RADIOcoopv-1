# App audit: ease of use, bugs, legal (Nov 14, 2026)

## 1. Compared with the apps people find easiest
| What the best apps do | Uber Simple mode / Lyft Silver / GoGoGrandparent | Radio Co-op now |
|---|---|---|
| Bigger text, fewer buttons | Uber Simple mode: larger text and icons, fewer buttons and ride options | **Larger text** switch in the ☰ menu (whole app grows ~19%); main buttons 48–60 px tall |
| Saved places | Uber shows frequent destinations to tap | **Recent places**: tap a past pickup/drop-off instead of typing (kept on the phone only) |
| Book by phone | Uber 13-UBER line; GoGoGrandparent is phone-based | Real dispatcher 24/7; call buttons in header, menu, help page, footer, ride card |
| Cancel easily | Cancel button in app | **Cancel this ride** (no charge) before a driver is assigned; "Call to change or cancel" after |
| Plain help | Help center | New **Help & Questions** page: cost, paying, booking ahead, cancelling, service animals, lost items, Fast Pass, small text |
| One task per screen, big tap targets (44×44 px min, 16 px+ text) | Guidelines from NN/g-backed research, Apple HIG | Booking toggles, header, footer, menu enlarged and labeled; gray text darkened for contrast |

## 2. Bugs and security found and fixed
- **declineRide had no permission check**: anyone could release a rider's card hold. Now dispatchers only.
- **setAdminClaim** (not deployed) would accept a missing secret if the server secret was unset. Hardened.
- Riders had no way to cancel. Added server-checked self-cancel (keeps a copy in `cancelled_rides`, frees the driver).
- Booking toggles, dropdowns, date of birth and the QR code had no labels for screen readers; fixed.
- Gray text on white failed contrast on 22 pages; shade darkened app-wide.
- Referral code was created but never shown; now on the rider profile.
- `WELCOME2` promo code is accepted but never discounts anything (still open: needs an amount).
- Full crawl of every page as guest, rider, driver, mechanic and office: **0 JavaScript errors**. Automated accessibility issues cut from 32 to 16 (the rest are mostly office screens).

## 3. Vehicle inspections and the shop board (new)
- **First 360° inspection** when a driver gets a car: 12 photo spots (10 required, trunk optional), optional ~1-minute walk-around video, damage marked "already there" or "new", each with a photo.
- **Weekly inspection**: 5 photos, the five fluids + washer (OK / topped off / needs shop), 14 safety checks (tires, brakes, lights, belts, glass, warning lights, heat/A-C, inside clean…), mileage, problems (brakes, rattles, leaks…) with description and urgency.
- **Start-of-shift check**: one tap "No new damage — Go Online", or report damage / a problem.
- Drivers **cannot go on the board** until the first, weekly and shift checks are done (enforced on the server).
- Each check ends with the driver typing their name under a responsibility statement.
- Photos are shrunk on the phone (~200–400 KB each) before upload; video is optional because it uses 40–100 MB.
- **Shop Board** (`/shop`): every reported problem becomes a work order (car #, item, description, photo, urgency, open → parts ordered → scheduled → done, shop notes, history). Mechanics get their own login (office gives access by email). Inspection history with photos per car.
- **Lease desk** shows "🔧 2 repairs" next to the car when the driver comes in to pay.

## 4. Legal: what the documents can and cannot do
**No document can make Radio Co-op "not liable for anything."**
- Georgia: a passenger carrier must use *extraordinary diligence* and **cannot contract out of it, even by express contract** (O.C.G.A. §§ 46-9-132, 46-9-2).
- Alabama: taxis owe the highest degree of care. *Connell v. Call-A-Cab* (2006) held a cab company liable for its driver's misconduct toward a passenger, and said a carrier can't escape that by calling the driver an independent contractor.
- So the rider terms now limit everything the law allows (late/missed pickups, lost items, indirect losses, driver conduct "to the fullest extent the law allows") and say plainly that passenger rights the law protects are not taken away.

**What protects the company in practice**
1. **Driver agreement** (enforceable between company and driver): full responsibility for the car while leased, inspections, maintenance, paying for damage they cause, accidents they cause, tickets/tolls, conduct toward passengers, service animals, no impairment, and a duty to defend and repay the company.
2. **Inspection and repair records.** The federal Graves Amendment (49 U.S.C. § 30106) shields a vehicle leasing business from liability for a lessee's driving only if the owner was not negligent. Negligent maintenance is the main exception. Dated photos, fluid and brake checks, and closed work orders are the evidence.
3. **Insurance.** Columbus Code Chapter 21 requires taxi insurance, licensed-garage safety inspections and driver permits. Confirm the commercial auto policy and limits.

**Risks for Malcolm and his lawyer**
- **Workers' comp / 1099 status.** Georgia courts have treated lease drivers as employees for workers' comp when the city ordinance requires a taxicab business license the driver doesn't hold (*Yellow Cab v. Karwoski*). Scores, warnings and penalties also point toward control. Ask about occupational-accident or workers' comp coverage.
- **$2 card fee.** Visa and Mastercard allow surcharges only on credit cards (never debit), capped at 3% and the merchant's actual cost. A flat $2 on every card, debit included, likely breaks card rules. Options: a 3% credit-only surcharge with debit detection, a cash discount, or a booking fee on all app rides.
- **Background checks (FCRA).** Now a separate, standalone disclosure and authorization step in the application. The background-check company must also give the "Summary of Your Rights" and handle adverse-action notices.
- **ADA.** Taxis can't refuse service animals or charge extra for them or for disability. This is now in the terms, the driver agreement and the Help page.
- **Venue clause** (Muscogee County) and any arbitration or class-action waiver: lawyer's call.
- **Screening questions** (drug test, DUI, charges, probation): lawyer review.

## 5. Sources
- Uber Simple mode / senior accounts: uber.com/us/en/ride/seniors; Uber press release Jun 4, 2025
- Older-adult design: JMIR mHealth 2023 systematic review (Gomez-Hernandez et al.); Bentley UX Center; Apple HIG 44×44 pt
- O.C.G.A. §§ 46-9-1, 46-9-2, 46-9-132 (Justia)
- Connell v. Call-A-Cab, Inc. (Ala. 2006); Mobile Cab & Baggage Co. v. Busby (Ala. 1964)
- Graves Amendment 49 U.S.C. § 30106; Lewis Brisbois primer; Transportation Alliance
- Yellow Cab of Chatham County v. Karwoski (Ga. App. 1997)
- Columbus, GA Code Chapter 21 (taxicab ordinances, ecap.apps.columbusga.gov)
- Visa/Mastercard surcharge rules 2026 (Digital Transactions; Nav)
- FCRA standalone disclosure (Checkr; GoodHire; FTC guidance)
- ADA 49 CFR 37.29, 37.5 (ADA National Network)
