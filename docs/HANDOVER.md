# Moving the app to the owner's accounts

The program does not change. Only the settings and keys below do.

## The fast way: fill in the blanks
1. Fill in `docs/KEYS-FILL-IN.txt` (every blank says exactly where in each website to find it).
2. Send the filled sheet back. It holds no secrets; the sheet says which ones never go in it.
3. `node scripts/apply-keys.mjs filled-sheet.txt` plugs everything in and prints the
   Cloud Shell commands for the secrets and the deploy.

## What the owner provides
1. **A Firebase project** on the pay-as-you-go (Blaze) plan, with his card on it.
2. **A Stripe account** (for card payments).
3. **A Twilio account with one local phone number** (optional: private, recorded rider/driver calls).
   About $1.15 a month for the number plus about 3 cents a minute for recorded calls.
   Without it, riders see the office number and drivers call riders directly.

## What gets typed in (one file + three secrets)
| Where | What | Comes from |
|---|---|---|
| `branding.config.json` → `infrastructure.firebase` | apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId | Firebase console → Project settings → Your apps → Web app |
| `branding.config.json` → `infrastructure.stripePublishableKey` | Publishable key (`pk_live_…`) | Stripe → Developers → API keys |
| `branding.config.json` → `dispatch.pushVapidKey` (optional) | Web Push key, for call alerts with the screen off | Firebase console → Project settings → Cloud Messaging → Web Push certificates |
| Secret `STRIPE_SECRET_KEY` | Secret key (`sk_live_…`) | Stripe → Developers → API keys |
| Secret `STRIPE_WEBHOOK_SECRET` | Signing secret (`whsec_…`) | Stripe → Developers → Webhooks, endpoint = the `stripeWebhook` function URL. Choose these events: `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`, `invoice.payment_succeeded` (memberships stay in sync only with all four) |
| `branding.config.json` → `company.email`, `company.googleReviewLink` | Office email and Google review link | Sheet lines OFFICE_EMAIL and GOOGLE_REVIEW_LINK. While they're `[INSERT…]` the app hides them |
| `functions/.env` → `TWILIO_ACCOUNT_SID`, `TWILIO_PHONE_NUMBER` | Account SID (`AC…`) and the number you bought | Twilio console home page; Phone Numbers → Active numbers |
| Secret `TWILIO_AUTH_TOKEN` | Auth token (type `none` until calls are set up) | Twilio console home page → Account Info |
| `branding.config.json` → `infrastructure.mapTiles` (optional) | A map tile URL with your key | Any raster tile service; blank = free OpenStreetMap tiles for testing |

The secrets are typed into Cloud Shell, never into a file:

    firebase functions:secrets:set STRIPE_SECRET_KEY
    firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
    firebase functions:secrets:set TWILIO_AUTH_TOKEN      # type none if calls aren't set up yet

`deploy-dispatch.sh` sets `TWILIO_AUTH_TOKEN` to `none` by itself if it was never set, so a deploy
never stops to ask for it.

## Twilio settings (if private calls are used)
- **Calls back to the number:** riders and drivers will call the Twilio number back. In Twilio →
  Phone Numbers → Active numbers → the number → Voice → "A call comes in", forward it to the office
  ((706) 322-0700) so those calls reach a person.
- **Recording retention:** calls are recorded. Pick how long to keep them (90 days suggested) and set
  it in Twilio (Voice → Settings / recording retention or a scheduled delete). The privacy policy
  should state the same period; see `docs/LAWYER-REVIEW.md`.

## Go live
    bash scripts/deploy-dispatch.sh
    # Malcolm signs up in the app once with his owner email, then:
    node scripts/make-dispatcher.mjs owner@his-email.com     # once: gives him the dispatcher/owner login

Mechanics: the owner gives them access on the Shop board ("Give a mechanic access"); they sign out
and back in to see it.

Before launch, Malcolm's lawyer should go through `docs/LAWYER-REVIEW.md`.

Then in the app: draw the zones, add the cars, approve the drivers (see DRIVER-MODE.md).

## The demo
`npm run build:demo` builds the same program with the cloud services replaced by in-browser
stand-ins and example data (`src/demo/`). It needs no billing, no Stripe and no keys, and it
runs the same dispatch, lease and close-out code the real build deploys. The real build never
includes `src/demo/`.

Publish it to a free preview link (live site untouched):

    npm run build:demo
    firebase hosting:channel:deploy demo --config firebase.demo.json --expires 30d --project <project id>

## Wording to confirm with the owner (all in `branding.config.json`)
| Setting | Now says | Why it needs a check |
|---|---|---|
| `about.established` | 1980 | From Yelp ("Established in 1980") and YellowPages ("46 years in business"). BBB lists the LLC as 2018. |
| `about.owners` | Malcolm and LaToya McMiller | Given by Jared; not found online. Check spelling. |
| `about.community` | (empty, hidden) | Fill in only if true, e.g. "Proud supporters of our EMS, firefighters and police." |
| `company.email` | [INSERT_EMAIL] | Shows in the legal pages. |
| `copy.memberPerks` | Matches what the app does today | Update if prices or perks change. |

Rate comparison (`src/config/fareCalc.js` → `RIDESHARE_SOURCES`): Uber/Lyft "central average" is the
median of each fare part across the listed sources (checked Nov 2026). Re-check a few times a year.
At normal (no-surge) prices our cash meter is lower up to about 4.5 miles and higher on longer trips;
the page shows that honestly and adds a 1.5x busy-time column.

Driver screening questions (`src/config/driverScreening.js`) and the legal pages are drafts: have the
owner's lawyer review them before going live.

## Pickup rules, fees and perks (all in `branding.config.json`)
| Setting | Now | What it does |
|---|---|---|
| `rideRules.headsUpMinutes` | 4 | "Your driver is about 4 minutes away" alert; free cancelling ends here |
| `rideRules.minFreeCancelMinutes` | 1 | Riders always get this long after a driver takes the call to cancel free |
| `rideRules.lateCancelFee` | $5 | Cancelling after the alert. Goes to the driver's lease credit |
| `rideRules.waitGraceMinutes` | 2 | Free wait after "I'm here"; then the driver starts his meter |
| `rideRules.noShowAfterMinutes` | 7 | When the driver can mark a no-show |
| `rideRules.noShowFee` | $10 | Only if the driver's phone was within `nearPickupMeters` (250 m) of the pickup or rider |
| `ridePerks.liveMap` | Day Pass, Basic, Premium | Who watches the car come on a map |
| `ridePerks.callDriver` | Day Pass, Premium | Who can call their driver (drivers can always call riders) |
| `calling.recordCalls` | on | Calls through the company number are recorded |
| `policies.legalVersion` | 2026-11-15.1 | Change it and every driver re-agrees before the next shift |

Riders agree to the terms on every booking. Drivers agree when they sign up and again whenever
`policies.legalVersion` changes. On phone calls the dispatcher reads one line and ticks a box.
Call-in rides (phone, or booked with location off) and guests pay no cancel or no-show fees.
Card fees, memberships and the Day Pass are the company's; drivers get the meter fare, tips,
and cancel/no-show fees on their calls.
