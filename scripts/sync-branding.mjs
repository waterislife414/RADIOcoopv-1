// Regenerates every file that must mirror branding.config.json:
//   - public/manifest.webmanifest  (PWA install name/colors)
//   - functions/branding.json      (backend: product names + tier prices)
// Runs automatically via the "prebuild" npm hook — never edit those two by hand.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const branding = JSON.parse(readFileSync(join(root, "branding.config.json"), "utf8"));

const manifest = {
  name: `${branding.company.name} ${branding.company.tagline}`,
  short_name: branding.company.name,
  description: branding.copy.metaDescription,
  start_url: "/",
  display: "standalone",
  background_color: branding.colors.themeColor,
  theme_color: branding.colors.themeColor,
  icons: [
    { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
  ],
};
writeFileSync(join(root, "public/manifest.webmanifest"), JSON.stringify(manifest, null, 2) + "\n");

const backend = {
  companyName: branding.company.name,
  tierMonthlyCents: Object.fromEntries(
    Object.entries(branding.pricing.tiers).map(([k, t]) => [k, Math.round(t.monthlyPrice * 100)])
  ),
  outOfAreaMinimumFareCents: Math.round(branding.pricing.outOfAreaMinimumFare * 100),
  cardAppFeeCents: Math.round(branding.pricing.fare.CARD_APP_FEE * 100),
  cardAppFeeMemberCents: Math.round(branding.pricing.fare.CARD_APP_FEE_MEMBER * 100),
  subscriptionTrialDays: branding.pricing.subscriptionTrialDays,
  dataRetentionDays: branding.policies.dataRetentionDays,
};
writeFileSync(join(root, "functions/branding.json"), JSON.stringify(backend, null, 2) + "\n");

console.log("Branding synced -> public/manifest.webmanifest, functions/branding.json");
