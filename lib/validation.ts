import { z } from 'zod';
import { SERVICE_BY_ID } from '@/config/services';

const text = (min: number, max: number) => z.string().trim().min(min).max(max);

export const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;
export const PHONE_RE = /^[0-9()+\-.\s]{10,20}$/;

const optionalVin = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase())
  .refine((s) => s === '' || VIN_RE.test(s), 'VIN must be 17 characters (letters I, O, Q are never used).')
  .default('');

const utmField = z.string().trim().max(80).optional();

export const bookingSchema = z
  .object({
    mode: z.enum(['mobile', 'shop']),
    contact: z.object({
      name: text(2, 120),
      phone: z.string().trim().regex(PHONE_RE, 'Enter a valid phone number.'),
      email: z.email('Enter a valid email.').max(200).transform((s) => s.toLowerCase()),
    }),
    address: z
      .object({
        street: text(3, 200),
        city: text(2, 80),
        state: z.enum(['AL', 'GA']),
        zip: z.string().regex(/^\d{5}$/, 'ZIP must be 5 digits.'),
        parkingNotes: z.string().trim().max(500).default(''),
      })
      .optional(),
    afterHoursKeyDrop: z.boolean().default(false),
    vehicle: z.object({
      year: z.coerce.number().int().min(1950).max(new Date().getFullYear() + 2),
      make: text(1, 40),
      model: text(1, 60),
      engine: z.string().trim().max(60).default(''),
      vin: optionalVin,
      mileage: z.coerce.number().int().min(0).max(2_000_000),
    }),
    serviceIds: z
      .array(z.string())
      .max(10)
      .default([])
      .refine((ids) => ids.every((id) => SERVICE_BY_ID.has(id)), 'Unknown service selected.'),
    symptoms: z.string().trim().max(2000).default(''),
    mediaPaths: z
      .array(z.string().regex(/^pending\/[\w\-./]+$/).refine((p) => !p.includes('..')))
      .max(6)
      .default([]),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    windowId: z.string().min(1),
    promoCode: z.string().trim().max(24).default(''),
    paymentChoice: z.enum(['deposit', 'estimate']),
    utm: z.object({ source: utmField, medium: utmField, campaign: utmField }).default({}),
    /** Honeypot — real users never fill this. */
    website: z.string().max(0, 'Spam check failed.').optional(),
  })
  .superRefine((v, ctx) => {
    if (v.mode === 'mobile' && !v.address) {
      ctx.addIssue({ code: 'custom', path: ['address'], message: 'Service address is required for mobile repair.' });
    }
    if (v.serviceIds.length === 0 && v.symptoms.length < 5) {
      ctx.addIssue({ code: 'custom', path: ['symptoms'], message: 'Pick a service or describe what’s going on.' });
    }
    const shopOnly = v.serviceIds.filter((id) => SERVICE_BY_ID.get(id)?.mode === 'shop');
    if (v.mode === 'mobile' && shopOnly.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['serviceIds'],
        message: `${shopOnly.map((id) => SERVICE_BY_ID.get(id)?.name).join(', ')} need${shopOnly.length === 1 ? 's' : ''} the shop bay. Switch to Shop Drop-Off.`,
      });
    }
  });

export type BookingInput = z.infer<typeof bookingSchema>;

export const uploadRequestSchema = z.object({
  filename: z.string().min(1).max(200),
  contentType: z.enum([
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
    'video/mp4', 'video/quicktime', 'video/webm',
  ]),
  size: z.number().int().positive().max(50 * 1024 * 1024, 'Max 50 MB per file.'),
});

export const signatureSchema = z.object({
  signature: text(2, 80),
  consent: z.literal('on', { message: 'Please confirm you authorize the work.' }),
});

export function firstIssue(err: z.ZodError): { field: string; message: string } {
  const i = err.issues[0];
  return { field: i?.path.join('.') ?? '', message: i?.message ?? 'Invalid input.' };
}
