import "dotenv/config"
import express from "express"
import cors from "cors"
import cookieParser from "cookie-parser"
import { createServer } from "http"
import { Server } from "socket.io"
import { env } from "./config/env"
import { errorHandler } from "./middleware/errorHandler"
import { requestLogger } from "./middleware/requestLogger"
import { healthRouter } from "./routes/health"
import { authRouter } from "./routes/auth"
import "./lib/passport"

const app = express()
const httpServer = createServer(app)

const io = new Server(httpServer, {
  cors: {
    origin: env.CORS_ORIGIN,
    credentials: true,
  },
})

// Middleware
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }))
app.use(express.json({ limit: "10mb" }))
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())
app.use(requestLogger)

// Routes
app.use("/api", healthRouter)
app.use("/api/auth", authRouter)

// Error handler — must be last
app.use(errorHandler)

// Socket.IO — room and event logic added in Feature #13
io.on("connection", (socket) => {
  socket.on("disconnect", () => {})
})

httpServer.listen(env.PORT, () => {
  console.warn(`[FlowGrid] API running at http://localhost:${env.PORT} (${env.NODE_ENV})`)
})
