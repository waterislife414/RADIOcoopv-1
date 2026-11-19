export type PlanId = 'daily_driver' | 'family' | 'fleet';
export type Interval = 'month' | 'year';

export type Plan = {
  id: PlanId;
  name: string;
  tagline: string;
  monthlyCents: number;
  /** Annual = 10× monthly (2 months free). */
  annualCents: number | null;
  vehiclesAllowed: number;
  features: string[];
  /** Env var names holding Stripe Price IDs. */
  priceEnv: { month: string; year: string | null };
  custom: boolean;
  highlight: boolean;
};

export const PLANS: readonly Plan[] = [
  {
    id: 'daily_driver',
    name: 'Daily Driver',
    tagline: 'One car, kept right.',
    monthlyCents: 2900,
    annualCents: 29000,
    vehiclesAllowed: 1,
    features: [
      '2 full-synthetic oil changes / yr',
      'Priority mobile dispatch',
      'Mobile callout fee waived 2× / yr',
      '10% off labor',
      'Free OBD-II scans anytime',
    ],
    priceEnv: { month: 'STRIPE_PRICE_DAILY_DRIVER_MONTHLY', year: 'STRIPE_PRICE_DAILY_DRIVER_ANNUAL' },
    custom: false,
    highlight: false,
  },
  {
    id: 'family',
    name: 'Family Multi-Car',
    tagline: 'Up to 3 household vehicles.',
    monthlyCents: 5900,
    annualCents: 59000,
    vehiclesAllowed: 3,
    features: [
      'Everything in Daily Driver — for up to 3 vehicles',
      'Annual pre-road-trip inspection',
      'One account, one bill',
    ],
    priceEnv: { month: 'STRIPE_PRICE_FAMILY_MONTHLY', year: 'STRIPE_PRICE_FAMILY_ANNUAL' },
    custom: false,
    highlight: true,
  },
  {
    id: 'fleet',
    name: 'Local Commercial Fleet',
    tagline: 'Work trucks & vans, Phenix City / Columbus.',
    monthlyCents: 14900,
    annualCents: null,
    vehiclesAllowed: 5,
    features: [
      'On-site maintenance at your yard or jobsite',
      'Consolidated monthly invoicing',
      'Net-15 terms option',
      'Fleet service history per unit',
      'Custom pricing above 5 units',
    ],
    priceEnv: { month: 'STRIPE_PRICE_FLEET_MONTHLY', year: null },
    custom: true,
    highlight: false,
  },
];

export const PLAN_BY_ID: ReadonlyMap<PlanId, Plan> = new Map(PLANS.map((p) => [p.id, p]));
