import winston from "winston"

const { combine, timestamp, errors, json, colorize, simple } = winston.format

// Production: structured JSON — easy to ingest in Datadog, Grafana Loki, CloudWatch, etc.
// Development: colorized human-readable output
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? "info",
  format: combine(
    timestamp(),
    errors({ stack: true }),
  ),
  transports: [
    process.env.NODE_ENV === "production"
      ? new winston.transports.Console({ format: combine(timestamp(), errors({ stack: true }), json()) })
      : new winston.transports.Console({ format: combine(colorize(), simple()) }),
  ],
})

export default logger
