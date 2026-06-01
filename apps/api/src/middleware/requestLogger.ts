import morgan from "morgan"
import { env } from "../config/env"
import logger from "../lib/logger"

// Route morgan through Winston so production log streams are pure NDJSON
const stream = { write: (msg: string) => logger.http(msg.trim()) }

export const requestLogger = morgan(env.NODE_ENV === "production" ? "combined" : "dev", {
  stream,
})
