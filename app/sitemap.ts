import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/env';
import { SERVICES } from '@/config/services';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  return [
    { url: `${base}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/book`, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${base}/memberships`, changeFrequency: 'monthly', priority: 0.7 },
    ...SERVICES.map((s) => ({
      url: `${base}/services/${s.id}`,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
  ];
}
