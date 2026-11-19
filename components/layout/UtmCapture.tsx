'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export const UTM_STORAGE_KEY = 'ka-utm-v1';
export type StoredUtm = { source?: string; medium?: string; campaign?: string };

/** First-touch UTM capture so a QR scan on "/" is still attributed when the visitor books later. */
export function UtmCapture() {
  const params = useSearchParams();
  useEffect(() => {
    const source = params.get('utm_source');
    if (!source) return;
    try {
      if (sessionStorage.getItem(UTM_STORAGE_KEY)) return;
      const utm: StoredUtm = {
        source,
        medium: params.get('utm_medium') ?? undefined,
        campaign: params.get('utm_campaign') ?? undefined,
      };
      sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(utm));
    } catch {
      /* storage blocked — ignore */
    }
  }, [params]);
  return null;
}

export function readStoredUtm(): StoredUtm {
  try {
    const raw = sessionStorage.getItem(UTM_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredUtm) : {};
  } catch {
    return {};
  }
}
