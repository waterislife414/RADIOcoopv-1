# Driver mode + auto-dispatch: setup and operations

## Deploy (Cloud Shell)
1. Back up: `tar czf ~/radio-coop-backup-$(date +%F).tgz --exclude=node_modules -C ~/radio-coop-v12 radio-coop`
2. Upload `rc-dispatch.tgz` to Cloud Shell, then:
   `cd ~/radio-coop-v12/radio-coop && tar xzf ~/rc-dispatch.tgz && bash scripts/deploy-dispatch.sh`
3. If the functions deploy asks to delete functions, answer **N**.

Rollback: Firebase console → Hosting → Release history → Roll back; re-extract the backup and redeploy functions.

## First-time setup (dispatcher login)
1. **Zones** (`/admin/zones`): Load starter zones, then trace each zone by tapping its corners. Rides and drivers can't be placed until zones have shapes.
2. **Drivers** (dashboard → applications): approve each driver and give him his car #. Existing drivers sign up at *Become a Driver* with "I already drive here".
3. **Fleet** (`/admin/drivers` → Fleet): add every car; mark vans.
4. **Certifications**: approve Base / Wheelchair requests (with expiry dates).
5. Keep **Dispatch: Manual** while drivers learn the app. Then try **Scheduled** for nights, then **Auto**.
6. Optional phone alerts with screen off: Firebase console → Project settings → Cloud Messaging → Web Push certificates → Generate key pair → paste the key into `branding.config.json` → `dispatch.pushVapidKey`, rebuild, and deploy hosting.

## How it runs
- Driver: Go Online → Moving → Check Ready (in the zone his phone is in). Board shows 🟢 on call, 🔴 waiting, blue = him.
- Call: offered to the first eligible car in the pickup zone. It pings 3 times, 15 s apart. No answer or a decline = off the board + warning (3 warnings = suspended). Requested calls carry no penalty.
- Nobody in the zone → "Need a car in [zone]" goes to every free eligible car, and the first tap wins. Nobody in 90 s → flagged for the dispatcher.
- Drop Off → next up in the zone he dropped in.
- Phone silent 3 min → off the board. Outside his zone 3 min → Moving.
- Lease: $75 per day on the board, settled at 2 PM. Card fares + tips count toward it, and extra rolls forward as credit. If he's short, he drops an envelope and logs it. Not logged by 4 PM = locked off the board. Office counts envelopes at `/admin/lease`.
- Close out (`/admin/drivers` → Close out): final day's $75 comes out, then a 50% check. Print the statement and record check # and date.
- Clean 14 days (5+ days worked, under 2 strikes) → $5 lease credit.
- All numbers are in `branding.config.json` → `dispatch`.

## Menus, legal and profiles
- Three-line menu (top right): visitors, signed-in riders and drivers each get their own list.
- Terms of Service, Privacy Policy and Driver Agreement live in `src/legal/documents.js`. Changing `LEGAL_VERSION` makes everyone accept again.
- The agree box only unlocks after the document has been opened and scrolled to the end. Guests agree on every booking; riders once per version; drivers before the driver screen. Promotions are a separate optional box.
- Driver profile (`/driver/profile`): score, warnings, record, lease credit (use/hold), card money by day, contact info.
- Record rules: a missed or declined call = warning + 10 points, on the record 60 days. 3 active warnings = write-up, off the board until the office reinstates. Office can add accident (30), no-show (15), complaint (10), write-up (20). Under 70 = no app calls for 12 hours. Numbers are in `branding.config.json` → `dispatch.incentives`.
- Hold credit: after 60 clean days a driver may hold his banked credit for one lease day; that day's lease comes from the day's card fares and his envelope.

## To confirm with Malcolm
1. Lease charged only on days the driver goes on the board in the app (office can waive a day).
2. Unpaid envelope money comes out of credit **before** the 50% close-out split.
3. Bonus: $5 per clean 14 days; 2 strikes forfeit; 5 worked days minimum.
4. Drop-off puts the driver at the **front** of that zone's line.
5. Zone names and boundaries (Beallwood, East vs East Wynnton, Airport).
6. Score rules above: points per incident, the 70 line, the 12-hour hold, 60 days on the record.
7. "Hold credit for a day" rule (60 clean days; one day at a time).
8. **Lawyer:** the Terms, Privacy Policy and Driver Agreement are drafts written to the owner's instructions. They need an attorney's review before real customers rely on them, along with the signed lease (50% payout, tickets, at-will) and 1099 handling.
9. Wallet: the old "+$10/+$20/+$50" buttons added money for free. They're removed. Check existing wallet balances before charging any.
