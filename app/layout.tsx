import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/archivo/wdth.css';
import './globals.css';
import { BUSINESS } from '@/config/business';
import { siteUrl } from '@/lib/env';

const description =
  'Honest auto repair in Phenix City, AL and Columbus, GA — mobile mechanic in your driveway or a shop bay. Transparent flat-rate pricing, diagnostic fee waived with repair, and no fix means no charge.';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: `${BUSINESS.name} | Mobile Mechanic & Auto Shop — Phenix City, AL & Columbus, GA`,
    template: `%s | ${BUSINESS.name}`,
  },
  description,
  applicationName: BUSINESS.name,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: BUSINESS.name,
    url: '/',
    title: `${BUSINESS.name} — In Our Shop or In Your Driveway`,
    description,
  },
  twitter: { card: 'summary_large_image', title: BUSINESS.name, description },
  formatDetection: { telephone: true, address: false, email: false },
  other: { 'geo.region': 'US-AL', 'geo.placename': 'Phenix City' },
};

export const viewport: Viewport = {
  themeColor: '#0F172A',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-US">
      <body>{children}</body>
    </html>
  );
}
