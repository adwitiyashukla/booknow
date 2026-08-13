import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1).default('postgresql://booknow:booknow@localhost:5432/booknow'),
  AUTH_SECRET: z.string().min(1).default('dev-only-insecure-secret-change-me'),
  STRIPE_SECRET_KEY: z.string().optional().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().optional().default(''),
  ANTHROPIC_API_KEY: z.string().optional().default(''),
  AI_MODEL: z.string().optional().default('claude-sonnet-4-5'),
  BOOKING_HOLD_MINUTES: z.coerce.number().int().min(1).max(120).default(15),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success && process.env.NODE_ENV === 'production') {
  console.error('Invalid environment configuration', parsed.error.flatten().fieldErrors);
}

export const env = parsed.success ? parsed.data : schema.parse({});

export const features = {
  stripe: Boolean(env.STRIPE_SECRET_KEY),
  llmConcierge: Boolean(env.ANTHROPIC_API_KEY),
} as const;
