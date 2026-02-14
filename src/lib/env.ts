import { z } from 'zod';

const serverSchema = z.object({
  DATABASE_URL: z.string().min(1),
  NEXTAUTH_URL: z.string().min(1),
  NEXTAUTH_SECRET: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
});

const clientSchema = z.object({});

let cachedServerEnv: z.infer<typeof serverSchema> | undefined;

export const getServerEnv = () => {
  if (!cachedServerEnv) {
    cachedServerEnv = serverSchema.parse(process.env);
  }
  return cachedServerEnv;
};

export const clientEnv = clientSchema.parse({});
