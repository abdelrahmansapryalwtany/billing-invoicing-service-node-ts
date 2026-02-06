import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  BOSS_SCHEMA: z.string().min(1).default("pgboss"),
  INVOICE_TAX_RATE: z.coerce.number().min(0).max(1).default(0.15),
  APP_BASE_URL: z.string().url().default("http://localhost:3000")
});

export type Env = z.infer<typeof EnvSchema>;

export const env: Env = EnvSchema.parse(process.env);

