import type { Request, Response, NextFunction } from "express"
import { env } from "../config/env"

export interface AppError extends Error {
  statusCode?: number
  code?: string
}

export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode ?? 500
  const message = err.message ?? "Internal Server Error"

  if (statusCode >= 500) {
    console.error("[Error]", err)
  }

  res.status(statusCode).json({
    error: {
      message,
      code: err.code ?? "INTERNAL_ERROR",
      ...(env.NODE_ENV === "development" && { stack: err.stack }),
    },
  })
}
