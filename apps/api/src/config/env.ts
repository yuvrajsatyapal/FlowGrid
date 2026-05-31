import { z } from "zod"

const envSchema = z.object({
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid URL"),
  UPSTASH_REDIS_REST_URL: z.string().url("UPSTASH_REDIS_REST_URL must be a valid URL"),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1, "UPSTASH_REDIS_REST_TOKEN is required"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  // Populated in Feature #3
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  JWT_SECRET: z.string().optional(),
  JWT_REFRESH_SECRET: z.string().optional(),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error("❌ Invalid environment variables:")
  console.error(parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = parsed.data
