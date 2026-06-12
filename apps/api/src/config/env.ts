import { z } from "zod"

const envSchema = z.object({
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid URL"),
  UPSTASH_REDIS_REST_URL: z.string().url("UPSTASH_REDIS_REST_URL must be a valid URL"),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1, "UPSTASH_REDIS_REST_TOKEN is required"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  GOOGLE_CLIENT_ID: z.string().min(1, "GOOGLE_CLIENT_ID is required"),
  GOOGLE_CLIENT_SECRET: z.string().min(1, "GOOGLE_CLIENT_SECRET is required"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),
  // Used to build the Google OAuth callback URL. In production: https://api.flowgrid.app
  API_BASE_URL: z.string().url().optional(),
  // Resend API key for transactional email (workspace invites). Optional in dev to allow skipping email.
  RESEND_API_KEY: z.string().optional(),
  // Public app URL used to build invite links. Must be set in production.
  APP_URL: z.string().url().default("http://localhost:5173"),
  // File storage: 'local' = disk (dev), 'r2' = Cloudflare R2, 'cloudinary' = Cloudinary (prod)
  STORAGE_PROVIDER: z.enum(["local", "r2", "cloudinary"]).default("local"),
  // Required when STORAGE_PROVIDER=r2
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().optional(),
  R2_PUBLIC_DOMAIN: z.string().optional(),
  // Required when STORAGE_PROVIDER=cloudinary
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.STORAGE_PROVIDER === "r2") {
    const required = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME", "R2_PUBLIC_DOMAIN"] as const
    for (const key of required) {
      if (!data[key]) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${key} is required when STORAGE_PROVIDER=r2`, path: [key] })
      }
    }
  }
  if (data.STORAGE_PROVIDER === "cloudinary") {
    const required = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"] as const
    for (const key of required) {
      if (!data[key]) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${key} is required when STORAGE_PROVIDER=cloudinary`, path: [key] })
      }
    }
  }
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error("❌ Invalid environment variables:")
  console.error(parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = parsed.data
