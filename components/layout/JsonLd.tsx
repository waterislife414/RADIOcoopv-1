import { BUSINESS, SHOW_EXACT_SHOP_ADDRESS } from '@/config/business';
import { SERVICES } from '@/config/services';
import { siteUrl } from '@/lib/env';

/** AutoRepair (LocalBusiness subtype) structured data for Phenix City, AL + Columbus, GA. */
export function BusinessJsonLd() {
  const url = siteUrl();
  const data = {
    '@context': 'https://schema.org',
    '@type': 'AutoRepair',
    '@id': `${url}/#business`,
    name: BUSINESS.name,
    url,
    image: `${url}/opengraph-image`,
    telephone: BUSINESS.phone.e164,
    email: BUSINESS.email,
    priceRange: BUSINESS.priceRange,
    founder: { '@type': 'Person', name: BUSINESS.owner.name, jobTitle: BUSINESS.owner.title },
    address: {
      '@type': 'PostalAddress',
      ...(SHOW_EXACT_SHOP_ADDRESS ? { streetAddress: BUSINESS.address.street } : {}),
      addressLocality: BUSINESS.address.city,
      addressRegion: BUSINESS.address.region,
      postalCode: BUSINESS.address.postalCode,
      addressCountry: BUSINESS.address.country,
    },
    geo: { '@type': 'GeoCoordinates', latitude: BUSINESS.geo.lat, longitude: BUSINESS.geo.lng },
    areaServed: BUSINESS.areaServed.map((a) => ({
      '@type': 'City',
      name: `${a.name}, ${a.region}`,
      containedInPlace: { '@type': 'State', name: a.region === 'AL' ? 'Alabama' : 'Georgia' },
    })),
    openingHoursSpecification: [
      { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], opens: BUSINESS.hours.open, closes: BUSINESS.hours.close },
    ],
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'Auto repair services',
      itemListElement: SERVICES.map((s) => ({
        '@type': 'Offer',
        itemOffered: { '@type': 'Service', name: s.name, description: s.blurb },
        priceSpecification: { '@type': 'PriceSpecification', minPrice: s.startingAtCents / 100, priceCurrency: 'USD' },
      })),
    },
    sameAs: [BUSINESS.googleReviewUrl].filter((u) => !u.includes('YOUR_LINK')),
  };
  return (
    <script
      type="application/ld+json"
      // JSON.stringify output with "<" escaped is safe inside a script tag.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}
