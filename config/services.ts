/**
 * Service catalog. "Starting at" prices are PLACEHOLDERS — Kyle must confirm before launch.
 * `mode: 'mobile'` = can be done in a driveway/lot; `'shop'` = needs a lift/bay.
 */
export type ServiceMode = 'mobile' | 'shop';

export type ServiceIcon =
  | 'disc' | 'battery' | 'zap' | 'power' | 'droplet' | 'refresh' | 'scan' | 'clipboard'
  | 'cog' | 'engine' | 'align' | 'snow' | 'spring';

export type Service = {
  id: string;
  name: string;
  mode: ServiceMode;
  startingAtCents: number;
  /** Displayed estimate, e.g. "60–90 min". */
  duration: string;
  blurb: string;
  icon: ServiceIcon;
  /** Price excludes parts when true (shown as "+ parts"). */
  plusParts: boolean;
};

export const SERVICES: readonly Service[] = [
  // ---- Mobile-eligible
  { id: 'diagnostics', name: 'Check-Engine / Electrical Diagnostics', mode: 'mobile', startingAtCents: 8900, duration: '45–60 min', blurb: 'Pro scan tool + pinpoint testing. Fee waived when you approve the repair.', icon: 'scan', plusParts: false },
  { id: 'brakes', name: 'Brake Pads (per axle)', mode: 'mobile', startingAtCents: 14900, duration: '60–90 min', blurb: 'Quality ceramic pads, hardware, caliper service. Rotors quoted if needed.', icon: 'disc', plusParts: false },
  { id: 'battery', name: 'Battery Test & Replacement', mode: 'mobile', startingAtCents: 4900, duration: '20–40 min', blurb: 'Load test, terminal clean, install, and charging-system check.', icon: 'battery', plusParts: true },
  { id: 'starter', name: 'Starter Replacement', mode: 'mobile', startingAtCents: 24900, duration: '1–2.5 hrs', blurb: 'Most cars and trucks done right where they sit.', icon: 'power', plusParts: true },
  { id: 'alternator', name: 'Alternator Replacement', mode: 'mobile', startingAtCents: 26900, duration: '1–2.5 hrs', blurb: 'Includes belt inspection and output test after install.', icon: 'zap', plusParts: true },
  { id: 'oil-change', name: 'Synthetic Oil & Filter Service', mode: 'mobile', startingAtCents: 7900, duration: '30–45 min', blurb: 'Up to 5 qts full synthetic, filter, fluid top-off, tire pressure set.', icon: 'droplet', plusParts: false },
  { id: 'fluids', name: 'Fluid Service (coolant / brake / PS)', mode: 'mobile', startingAtCents: 9900, duration: '45–75 min', blurb: 'Drain-and-fill or flush to spec with the correct fluid.', icon: 'droplet', plusParts: false },
  { id: 'belts', name: 'Serpentine Belt / Tensioner', mode: 'mobile', startingAtCents: 12900, duration: '45–90 min', blurb: 'Squeal, chirp, or cracked belt — replaced and routed right.', icon: 'refresh', plusParts: true },
  { id: 'pre-purchase', name: 'Pre-Purchase Inspection', mode: 'mobile', startingAtCents: 12900, duration: '60–90 min', blurb: 'We meet you at the seller. Photo report before you hand over cash.', icon: 'clipboard', plusParts: false },
  // ---- Shop bay only
  { id: 'transmission', name: 'Transmission Service & Repair', mode: 'shop', startingAtCents: 18900, duration: '2 hrs – 2 days', blurb: 'Fluid/filter service through R&R. Diagnosed and quoted first.', icon: 'cog', plusParts: true },
  { id: 'engine', name: 'Heavy Engine Work', mode: 'shop', startingAtCents: 65000, duration: '1–4 days', blurb: 'Head gaskets, timing chains/belts, water pumps, major leaks.', icon: 'engine', plusParts: true },
  { id: 'alignment', name: 'Wheel Alignment', mode: 'shop', startingAtCents: 9900, duration: '60 min', blurb: 'Front or 4-wheel alignment with before/after printout.', icon: 'align', plusParts: false },
  { id: 'ac', name: 'A/C Recovery & Recharge', mode: 'shop', startingAtCents: 14900, duration: '60–90 min', blurb: 'Evacuate, vacuum test, recharge to spec, leak check.', icon: 'snow', plusParts: true },
  { id: 'suspension', name: 'Suspension Rebuild', mode: 'shop', startingAtCents: 39900, duration: '3–6 hrs', blurb: 'Struts, shocks, control arms, ball joints, tie rods.', icon: 'spring', plusParts: true },
];

export const SERVICE_BY_ID: ReadonlyMap<string, Service> = new Map(SERVICES.map((s) => [s.id, s]));
export const MOBILE_SERVICES = SERVICES.filter((s) => s.mode === 'mobile');
export const SHOP_SERVICES = SERVICES.filter((s) => s.mode === 'shop');
