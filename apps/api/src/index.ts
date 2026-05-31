import "dotenv/config"
import express from "express"
import cors from "cors"
import { createServer } from "http"
import { Server } from "socket.io"
import { env } from "./config/env"
import { errorHandler } from "./middleware/errorHandler"
import { requestLogger } from "./middleware/requestLogger"
import { healthRouter } from "./routes/health"

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
app.use(requestLogger)

// Routes
app.use("/api", healthRouter)
// Additional routes mounted here in future features

// Error handler — must be last
app.use(errorHandler)

// Socket.IO — room and event logic added in Feature #13
io.on("connection", (socket) => {
  socket.on("disconnect", () => {})
})

httpServer.listen(env.PORT, () => {
  console.log(`🚀 FlowGrid API running at http://localhost:${env.PORT}`)
  console.log(`   Environment: ${env.NODE_ENV}`)
})
