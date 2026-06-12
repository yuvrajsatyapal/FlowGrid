import "dotenv/config"
import express from "express"
import helmet from "helmet"
import cors from "cors"
import cookieParser from "cookie-parser"
import { createServer } from "http"
import { env } from "./config/env"
import { initSocket } from "./lib/socket"
import { errorHandler } from "./middleware/errorHandler"
import { requestLogger } from "./middleware/requestLogger"
import { healthRouter } from "./routes/health"
import { authRouter } from "./routes/auth"
import { usersRouter } from "./routes/users"
import { workspacesRouter } from "./routes/workspaces"
import { boardsRouter } from "./routes/boards"
import { listsRouter } from "./routes/lists"
import { cardsRouter } from "./routes/cards"
import { labelsRouter } from "./routes/labels"
import { commentsRouter } from "./routes/comments"
import { activitiesRouter } from "./routes/activities"
import { invitesRouter } from "./routes/invites"
import { notificationsRouter } from "./routes/notifications"
import { attachmentsRouter } from "./routes/attachments"
import { searchRouter } from "./routes/search"
import { analyticsRouter } from "./routes/analytics"
import { checklistsRouter } from "./routes/checklists"
import { cardDependenciesRouter } from "./routes/card-dependencies"
import { cardWatchersRouter } from "./routes/card-watchers"
import { cardTemplatesRouter } from "./routes/card-templates"
import passport from "./lib/passport"
import logger from "./lib/logger"

const app = express()
const httpServer = createServer(app)

initSocket(httpServer)

// Security headers — Helmet must come before CORS so CSP doesn't conflict
app.use(helmet({
  // CSP disabled here; add a project-specific policy when the frontend is on the same origin
  contentSecurityPolicy: false,
  // Cross-Origin-Embedder-Policy breaks Google OAuth redirect; disable for API
  crossOriginEmbedderPolicy: false,
}))

// Middleware
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }))
app.use(express.json({ limit: "10mb" }))
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())
app.use(passport.initialize())
app.use(requestLogger)

// Routes
app.use("/api", healthRouter)
app.use("/api/auth", authRouter)
app.use("/api/users", usersRouter)
app.use("/api/workspaces", workspacesRouter)
app.use("/api/boards", boardsRouter)
app.use("/api/lists", listsRouter)
app.use("/api/cards", cardsRouter)
app.use("/api/labels", labelsRouter)
app.use("/api/comments", commentsRouter)
app.use("/api/activities", activitiesRouter)
app.use("/api/invites", invitesRouter)
app.use("/api/notifications", notificationsRouter)
app.use("/api/attachments", attachmentsRouter)
app.use("/api/search", searchRouter)
app.use("/api/analytics", analyticsRouter)
app.use("/api/checklists", checklistsRouter)
app.use("/api/card-dependencies", cardDependenciesRouter)
app.use("/api/card-watchers", cardWatchersRouter)
app.use("/api/card-templates", cardTemplatesRouter)

// Error handler — must be last
app.use(errorHandler)

httpServer.listen(env.PORT, () => {
  logger.info(`FlowGrid API started`, { port: env.PORT, env: env.NODE_ENV })
})
