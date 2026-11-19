/**
 * Photo + video slots. Set `src` to a file in /public/media (or a Supabase public URL).
 * While `src` is null the site renders a labeled placeholder showing the shot guidance,
 * so Kyle knows exactly what to photograph. Real photos only — no stock.
 */

/** Show shot guidance inside empty photo placeholders. Set false before launch if any slot is still empty. */
export const SHOW_PHOTO_GUIDANCE = true;
export type PhotoSlot = {
  id: string;
  src: string | null;
  alt: string;
  /** CSS aspect-ratio, e.g. "16 / 9". */
  aspect: string;
  guidance: string;
};

export const PHOTOS = {
  heroRig: {
    id: 'hero-rig',
    src: null,
    alt: 'Dubois Automotive Rescue truck parked in a Phenix City driveway with tools out',
    aspect: '4 / 3',
    guidance:
      '4:3, min 1600×1200. The actual mobile rig in a real customer driveway, tailgate/side boxes open, Kyle working. Shoot early morning or golden hour, phone held landscape. No stock photos, no AI images.',
  },
  shopBay: {
    id: 'shop-bay',
    src: null,
    alt: "Inside Kyle's shop bay with a vehicle on the lift",
    aspect: '16 / 9',
    guidance:
      '16:9, min 1920×1080. Real bay with a customer car on the lift, clean floor, lights on. Avoid showing the street address or house numbers.',
  },
  kylePortrait: {
    id: 'kyle-portrait',
    src: null,
    alt: 'Kyle Dubois, owner and lead technician',
    aspect: '1 / 1',
    guidance:
      '1:1, min 1200×1200. Kyle in work shirt next to the truck, natural smile, eye-level, face in shade-free light. This builds more trust than any logo.',
  },
} satisfies Record<string, PhotoSlot>;

export type BeforeAfterPair = {
  id: string;
  title: string;
  vehicle: string;
  location: string;
  before: PhotoSlot;
  after: PhotoSlot;
};

const pairGuidance = (what: string, stage: 'BEFORE' | 'AFTER') =>
  `3:2, min 1500×1000. ${stage}: ${what}. Same angle, same distance for before & after so the slider lines up. Phone landscape, flash off.`;

export const BEFORE_AFTER: readonly BeforeAfterPair[] = [
  {
    id: 'brakes',
    title: 'Front Pads & Rotors',
    vehicle: '[Year Make Model]',
    location: 'Phenix City, AL',
    before: { id: 'ba-brakes-before', src: null, alt: 'Worn brake rotor and pad before replacement', aspect: '3 / 2', guidance: pairGuidance('scored rotor + worn pad, wheel off', 'BEFORE') },
    after: { id: 'ba-brakes-after', src: null, alt: 'New brake rotor and pad installed', aspect: '3 / 2', guidance: pairGuidance('new rotor + pad installed, same angle', 'AFTER') },
  },
  {
    id: 'battery',
    title: 'Corroded Battery Terminals',
    vehicle: '[Year Make Model]',
    location: 'Columbus, GA',
    before: { id: 'ba-battery-before', src: null, alt: 'Heavily corroded battery terminals', aspect: '3 / 2', guidance: pairGuidance('corroded terminals/tray', 'BEFORE') },
    after: { id: 'ba-battery-after', src: null, alt: 'Clean new battery and terminals', aspect: '3 / 2', guidance: pairGuidance('new battery, cleaned + protected terminals', 'AFTER') },
  },
];

export type VideoSlot = {
  id: string;
  title: string;
  duration: string;
  provider: 'youtube' | 'vimeo' | 'mp4';
  /** YouTube/Vimeo video ID, or MP4 path/URL. null = placeholder. */
  source: string | null;
  poster: PhotoSlot;
};

export const VIDEOS: readonly VideoSlot[] = [
  {
    id: 'meet-kyle',
    title: 'Meet Kyle & The Mobile Rig',
    duration: '0:45',
    provider: 'youtube',
    source: null,
    poster: { id: 'poster-meet-kyle', src: null, alt: 'Kyle standing beside the mobile repair truck', aspect: '16 / 9', guidance: '16:9 poster frame from the video. Script: who you are, where you serve (Phenix City, Smiths Station, Columbus, Fort Benning), no fix no charge, how booking works. Film vertical too for Reels/Shorts.' },
  },
  {
    id: 'alternator-clip',
    title: 'Driveway Alternator Swap',
    duration: '0:30',
    provider: 'mp4',
    source: null,
    poster: { id: 'poster-alternator', src: null, alt: 'Alternator being replaced in a driveway', aspect: '16 / 9', guidance: '16:9. Time-lapse of a real job: arrival → old part out → new part in → voltage test on screen.' },
  },
  {
    id: 'diag-clip',
    title: 'How We Diagnose a Check-Engine Light',
    duration: '0:30',
    provider: 'mp4',
    source: null,
    poster: { id: 'poster-diag', src: null, alt: 'Scan tool plugged into an OBD-II port', aspect: '16 / 9', guidance: '16:9. Scan tool screen + Kyle explaining the code in plain English. Shows transparency.' },
  },
];
