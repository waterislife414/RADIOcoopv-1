import { ImageResponse } from 'next/og';
import { BUSINESS } from '@/config/business';

export const alt = `${BUSINESS.name} — Phenix City, AL & Columbus, GA`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OgImage() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#0F172A', color: '#fff', padding: 64, justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', fontSize: 30, color: '#F59E0B', fontWeight: 800 }}>{BUSINESS.name}</div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 76, fontWeight: 900, lineHeight: 1.02 }}>Honest auto repair.</div>
          <div style={{ fontSize: 76, fontWeight: 900, lineHeight: 1.02, color: '#F59E0B' }}>In our shop or your driveway.</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 28, color: '#CBD5E1' }}>
          <span>Phenix City, AL · Columbus, GA</span>
          <span>{BUSINESS.phone.display}</span>
        </div>
        <div style={{ position: 'absolute', left: 0, bottom: 0, width: '100%', height: 16, display: 'flex', background: 'repeating-linear-gradient(-45deg,#F59E0B 0 16px,#0F172A 16px 32px)' }} />
      </div>
    ),
    size,
  );
}
