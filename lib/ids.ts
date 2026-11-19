const REF_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L

function randomIndexes(n: number, max: number): number[] {
  const out: number[] = [];
  const buf = new Uint32Array(n * 2);
  while (out.length < n) {
    globalThis.crypto.getRandomValues(buf);
    for (const v of buf) {
      // rejection sampling → unbiased
      const limit = Math.floor(0x1_0000_0000 / max) * max;
      if (v < limit) out.push(v % max);
      if (out.length === n) break;
    }
  }
  return out;
}

/** Human-friendly booking reference, e.g. KA-7QX4M9 (~2.9e10 space with 7 chars). */
export function bookingRef(): string {
  return `KA-${randomIndexes(7, REF_ALPHABET.length).map((i) => REF_ALPHABET[i]).join('')}`;
}

/** Unguessable invoice token: 192 bits, base64url (32 chars). */
export function invoiceToken(): string {
  const bytes = new Uint8Array(24);
  globalThis.crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString('base64url');
}

export function safeFileName(name: string): string {
  const base = name.normalize('NFKD').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').slice(-80);
  return base.replace(/^[-.]+/, '') || 'file';
}
