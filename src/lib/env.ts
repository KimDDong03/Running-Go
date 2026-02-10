import { z } from 'zod';

const serverSchema = z.object({
  DATABASE_URL: z.string().min(1),
  NEXTAUTH_URL: z.string().min(1),
  NEXTAUTH_SECRET: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  TOSS_SECRET_KEY: z.string().min(1).optional(),
  BILLING_WEBHOOK_SECRET: z.string().min(1).optional(),
});

const clientSchema = z.object({
  NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN: z.string().min(1),
  NEXT_PUBLIC_TOSS_CLIENT_KEY: z.string().min(1).optional(),
});

let cachedServerEnv: z.infer<typeof serverSchema> | undefined;

export const getServerEnv = () => {
  if (!cachedServerEnv) {
    cachedServerEnv = serverSchema.parse(process.env);
  }
  return cachedServerEnv;
};

export const clientEnv = clientSchema.parse({
  NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN: process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN,
  NEXT_PUBLIC_TOSS_CLIENT_KEY: process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY,
});
