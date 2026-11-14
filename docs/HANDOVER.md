# Moving the app to the owner's accounts

The program does not change. Only the settings and keys below do.

## What the owner provides
1. **A Firebase project** on the pay-as-you-go (Blaze) plan, with his card on it.
2. **A Stripe account** (for card payments).

## What gets typed in (one file + two secrets)
| Where | What | Comes from |
|---|---|---|
| `branding.config.json` → `infrastructure.firebase` | apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId | Firebase console → Project settings → Your apps → Web app |
| `branding.config.json` → `infrastructure.stripePublishableKey` | Publishable key (`pk_live_…`) | Stripe → Developers → API keys |
| `branding.config.json` → `dispatch.pushVapidKey` (optional) | Web Push key, for call alerts with the screen off | Firebase console → Project settings → Cloud Messaging → Web Push certificates |
| Secret `STRIPE_SECRET_KEY` | Secret key (`sk_live_…`) | Stripe → Developers → API keys |
| Secret `STRIPE_WEBHOOK_SECRET` | Signing secret (`whsec_…`) | Stripe → Developers → Webhooks, endpoint = the `stripeWebhook` function URL |

The two secrets are typed into Cloud Shell, never into a file:

    firebase functions:secrets:set STRIPE_SECRET_KEY
    firebase functions:secrets:set STRIPE_WEBHOOK_SECRET

## Go live
    bash scripts/deploy-dispatch.sh
    node scripts/make-dispatcher.mjs owner@his-email.com     # once: gives him the dispatcher/owner login

Then in the app: draw the zones, add the cars, approve the drivers (see DRIVER-MODE.md).

## The demo
`npm run build:demo` builds the same program with the cloud services replaced by in-browser
stand-ins and example data (`src/demo/`). It needs no billing, no Stripe and no keys, and it
runs the same dispatch, lease and close-out code the real build deploys. The real build never
includes `src/demo/`.

Publish it to a free preview link (live site untouched):

    npm run build:demo
    firebase hosting:channel:deploy demo --config firebase.demo.json --expires 30d --project <project id>
