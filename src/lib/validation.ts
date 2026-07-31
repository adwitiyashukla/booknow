import { z } from 'zod';

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected an ISO date (YYYY-MM-DD)');

export const searchParamsSchema = z
  .object({
    checkIn: dateString.optional(),
    checkOut: dateString.optional(),
    adults: z.coerce.number().int().min(1).max(8).default(2),
    children: z.coerce.number().int().min(0).max(6).default(0),
    minPrice: z.coerce.number().int().min(0).optional(),
    maxPrice: z.coerce.number().int().min(0).optional(),
    oceanView: z.coerce.boolean().optional(),
    balcony: z.coerce.boolean().optional(),
    accessible: z.coerce.boolean().optional(),
    amenities: z.array(z.string()).optional(),
    sort: z.enum(['recommended', 'price-asc', 'price-desc', 'size-desc', 'rating-desc']).default('recommended'),
    q: z.string().max(280).optional(),
  })
  .refine((v) => !v.checkIn || !v.checkOut || v.checkOut > v.checkIn, {
    message: 'Check-out must be after check-in',
    path: ['checkOut'],
  });

export type SearchParams = z.infer<typeof searchParamsSchema>;

export const quoteRequestSchema = z.object({
  roomTypeId: z.string().min(1),
  ratePlanId: z.string().min(1).optional(),
  checkIn: dateString,
  checkOut: dateString,
  adults: z.coerce.number().int().min(1).max(8),
  children: z.coerce.number().int().min(0).max(6),
});

export const createBookingSchema = quoteRequestSchema.extend({
  guestName: z.string().min(2).max(120),
  guestEmail: z.email(),
  guestPhone: z.string().max(32).optional(),
  specialRequests: z.string().max(1000).optional(),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const cancelBookingSchema = z.object({
  reference: z.string().min(3),
  reason: z.string().max(500).optional(),
});

export const conciergeSchema = z.object({
  message: z.string().min(1).max(1000),
  sessionId: z.string().optional(),
});

export const registerSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.email(),
  password: z
    .string()
    .min(8, 'Use at least 8 characters')
    .max(128)
    .regex(/[a-z]/, 'Include a lowercase letter')
    .regex(/[A-Z]/, 'Include an uppercase letter')
    .regex(/[0-9]/, 'Include a number'),
});

export const reviewSchema = z.object({
  bookingReference: z.string().min(3),
  rating: z.coerce.number().int().min(1).max(5),
  title: z.string().min(3).max(120),
  body: z.string().min(10).max(2000),
});
