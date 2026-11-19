import { Suspense } from 'react';
import { AnnouncementBar } from '@/components/layout/AnnouncementBar';
import { DemoBanner } from '@/components/layout/DemoBanner';
import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import { StickyMobileBar } from '@/components/layout/StickyMobileBar';
import { UtmCapture } from '@/components/layout/UtmCapture';

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[60] focus:rounded focus:bg-amber-500 focus:px-3 focus:py-2 focus:font-bold">
        Skip to content
      </a>
      <DemoBanner />
      <AnnouncementBar />
      <Header />
      <main id="main">{children}</main>
      <Footer />
      <StickyMobileBar />
      <Suspense fallback={null}>
        <UtmCapture />
      </Suspense>
    </>
  );
}
