#!/usr/bin/env bash
# Deploys driver mode + auto-dispatch. Run from Cloud Shell in the project folder:
#   bash scripts/deploy-dispatch.sh
# Safe to re-run. Dispatch stays MANUAL after deploy until you switch it on the dashboard.
set -euo pipefail
cd "$(dirname "$0")/.."
PROJECT=$(node -p "require('./branding.config.json').infrastructure.firebase.projectId")
echo "== Project: $PROJECT"

echo "== Installing packages"
npm install --no-audit --no-fund
(cd functions && npm install --no-audit --no-fund)

echo "== Logic tests"
(cd functions/lib && node --test)

echo "== Building the site"
npm run build

echo "== Turning on Cloud Tasks + Scheduler (call timers)"
gcloud services enable cloudtasks.googleapis.com cloudscheduler.googleapis.com --project "$PROJECT"

echo "== Security rules + database indexes"
firebase deploy --only firestore:rules,firestore:indexes,storage --project "$PROJECT"

echo "== Cloud Functions (Node 22). If asked to DELETE functions, answer N."
firebase deploy --only functions --project "$PROJECT"

echo "== Letting functions queue call timers"
NUM=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:${NUM}-compute@developer.gserviceaccount.com" \
  --role=roles/cloudtasks.enqueuer --condition=None >/dev/null && echo "ok"

echo "== Website"
firebase deploy --only hosting --project "$PROJECT"

echo "== Done. New database indexes can take a few minutes to finish building."
