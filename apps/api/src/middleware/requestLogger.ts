import morgan from "morgan"
import { env } from "../config/env"

// Use concise 'dev' format in development, structured 'combined' in production
export const requestLogger = morgan(env.NODE_ENV === "production" ? "combined" : "dev")
