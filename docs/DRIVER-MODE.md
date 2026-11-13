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

## To confirm with Malcolm
1. Lease charged only on days the driver goes on the board in the app (office can waive a day).
2. Unpaid envelope money comes out of credit **before** the 50% close-out split.
3. Bonus: $5 per clean 14 days; 2 strikes forfeit; 5 worked days minimum.
4. Drop-off puts the driver at the **front** of that zone's line.
5. Zone names and boundaries (Beallwood, East vs East Wynnton, Airport).
6. 50% payout and card-credit rules written into the signed driver lease (lawyer review). 1099 handling of card fares (accountant).
7. Wallet: the old "+$10/+$20/+$50" buttons added money for free. They're removed. Check existing wallet balances before charging any.
