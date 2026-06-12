import path from "path"
import crypto from "crypto"
import { Router } from "express"
import multer from "multer"
import { prisma } from "../lib/prisma"
import { validateJWT } from "../middleware/auth"
import { canWrite } from "../lib/roles"
import { storage, keyFromUrl } from "../lib/storage"
import logger from "../lib/logger"

const router = Router()

const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25 MB

const BLOCKED_EXTENSIONS = new Set([
  ".exe", ".sh", ".bat", ".cmd", ".ps1", ".app", ".dmg",
  ".pkg", ".deb", ".rpm", ".msi", ".vbs", ".jar",
])

// Second layer: mimeType blocklist (catches obvious browser-reported types)
const BLOCKED_MIMETYPES = new Set([
  "application/x-msdownload",
  "application/x-msdos-program",
  "application/vnd.microsoft.portable-executable",
  "application/x-sh",
  "text/x-sh",
  "application/x-bat",
  "application/x-powershell",
  "application/java-archive",
  "application/x-debian-package",
  "application/x-rpm",
  "application/x-msi",
  "application/vbs",
  "text/vbscript",
  "application/x-apple-diskimage",
])

// Third layer: magic byte check — catches executables renamed to safe extensions.
// Browser-reported MIME is untrustworthy; file contents are authoritative.
function hasExecutableMagicBytes(buf: Buffer): boolean {
  if (buf.length < 4) return false
  // Windows PE (EXE/DLL/SYS/SCR): "MZ" header
  if (buf[0] === 0x4d && buf[1] === 0x5a) return true
  // ELF (Linux/Unix executables): \x7fELF
  if (buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46) return true
  // Java class file: 0xCAFEBABE
  if (buf[0] === 0xca && buf[1] === 0xfe && buf[2] === 0xba && buf[3] === 0xbe) return true
  return false
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
})

// Resolve card → list → board → workspace access.
// Mirrors resolveCardAccess in comments.ts.
async function resolveCardAccess(
  res: Parameters<Parameters<typeof router.get>[1]>[1],
  cardId: string,
  userId: string,
  requireWriteRole = false,
) {
  const card = await prisma.card.findUnique({
    where: { id: cardId },
    select: { id: true, listId: true, deletedAt: true },
  })
  if (!card || card.deletedAt !== null) {
    res.status(404).json({ error: { message: "Card not found", status: 404 } })
    return null
  }

  const list = await prisma.list.findUnique({
    where: { id: card.listId },
    select: { id: true, boardId: true, deletedAt: true },
  })
  if (!list || list.deletedAt !== null) {
    res.status(404).json({ error: { message: "Card not found", status: 404 } })
    return null
  }

  const board = await prisma.board.findUnique({
    where: { id: list.boardId },
    select: { id: true, workspaceId: true, visibility: true, deletedAt: true },
  })
  if (!board || board.deletedAt !== null) {
    res.status(404).json({ error: { message: "Card not found", status: 404 } })
    return null
  }

  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: board.workspaceId, userId } },
  })
  if (!membership) {
    res.status(404).json({ error: { message: "Card not found", status: 404 } })
    return null
  }

  if (board.visibility === "PRIVATE") {
    const boardMember = await prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId: board.id, userId } },
    })
    if (!boardMember) {
      res.status(404).json({ error: { message: "Card not found", status: 404 } })
      return null
    }
  }

  if (requireWriteRole && !canWrite(membership.role)) {
    res.status(403).json({ error: { message: "Viewers cannot perform this action", status: 403 } })
    return null
  }

  return { card, board, membership }
}

type UploaderInfo = { id: string; name: string | null; avatarUrl: string | null } | null

function formatAttachment(
  attachment: {
    id: string; cardId: string; name: string; url: string
    mimeType: string | null; size: number | null; createdAt: Date
  },
  uploader: UploaderInfo,
) {
  return {
    id: attachment.id,
    cardId: attachment.cardId,
    name: attachment.name,
    url: attachment.url,
    mimeType: attachment.mimeType,
    size: attachment.size,
    createdAt: attachment.createdAt,
    uploader,
  }
}

async function enrichWithUploaders<T extends { userId: string }>(
  items: T[],
): Promise<Map<string, UploaderInfo>> {
  const userIds = [...new Set(items.map((i) => i.userId))]
  if (userIds.length === 0) return new Map()
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, avatarUrl: true },
  })
  return new Map(users.map((u) => [u.id, u]))
}

// GET /api/attachments?cardId= — list attachments for a card
router.get("/", validateJWT, async (req, res) => {
  const cardId = req.query.cardId as string | undefined
  if (!cardId) {
    res.status(400).json({ error: { message: "cardId is required", status: 400 } })
    return
  }

  try {
    const access = await resolveCardAccess(res, cardId, req.user!.id)
    if (!access) return

    const items = await prisma.attachment.findMany({
      where: { cardId },
      orderBy: { createdAt: "asc" },
    })

    const uploaderMap = await enrichWithUploaders(items)
    res.json(items.map((a) => formatAttachment(a, uploaderMap.get(a.userId) ?? null)))
  } catch {
    res.status(500).json({ error: { message: "Failed to fetch attachments", status: 500 } })
  }
})

// POST /api/attachments — upload a file
router.post(
  "/",
  validateJWT,
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        res.status(400).json({ error: { message: `File must be 25 MB or smaller`, status: 400 } })
        return
      }
      if (err) {
        res.status(400).json({ error: { message: "File upload failed", status: 400 } })
        return
      }
      next()
    })
  },
  async (req, res) => {
    const cardId = req.body.cardId as string | undefined
    if (!cardId) {
      res.status(400).json({ error: { message: "cardId is required", status: 400 } })
      return
    }

    if (!req.file) {
      res.status(400).json({ error: { message: "file is required", status: 400 } })
      return
    }

    const originalName = req.file.originalname
    const ext = path.extname(originalName).toLowerCase()

    if (BLOCKED_EXTENSIONS.has(ext)) {
      res.status(400).json({ error: { message: "File type not allowed", status: 400 } })
      return
    }

    const reportedMime = req.file.mimetype?.toLowerCase() ?? ""
    if (reportedMime && BLOCKED_MIMETYPES.has(reportedMime)) {
      res.status(400).json({ error: { message: "File type not allowed", status: 400 } })
      return
    }

    if (hasExecutableMagicBytes(req.file.buffer)) {
      res.status(400).json({ error: { message: "File type not allowed", status: 400 } })
      return
    }

    try {
      const access = await resolveCardAccess(res, cardId, req.user!.id, true)
      if (!access) return

      const uuid = crypto.randomUUID()
      const key = `attachments/${cardId}/${uuid}${ext}`
      const mimeType = req.file.mimetype || null

      let url: string
      try {
        url = await storage.upload(key, req.file.buffer, mimeType ?? "application/octet-stream")
      } catch {
        res.status(502).json({ error: { message: "Storage unavailable, please try again", status: 502 } })
        return
      }

      let attachment
      try {
        attachment = await prisma.attachment.create({
          data: {
            cardId,
            userId: req.user!.id,
            name: originalName,
            url,
            mimeType,
            size: req.file.size,
          },
        })
      } catch {
        // Compensating delete — DB insert failed, clean up the orphaned storage object
        await storage.delete(key).catch(() => {})
        res.status(502).json({ error: { message: "Failed to save attachment record; uploaded file has been cleaned up", status: 502 } })
        return
      }

      const uploader = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: { id: true, name: true, avatarUrl: true },
      }).catch(() => null)

      res.status(201).json(formatAttachment(attachment, uploader))
    } catch {
      res.status(500).json({ error: { message: "Failed to upload attachment", status: 500 } })
    }
  },
)

// POST /api/attachments/delete?id= — delete an attachment (uploader or OWNER/ADMIN)
router.post("/delete", validateJWT, async (req, res) => {
  const attachmentId = req.query.id as string | undefined
  if (!attachmentId) {
    res.status(400).json({ error: { message: "id is required", status: 400 } })
    return
  }

  try {
    const attachment = await prisma.attachment.findUnique({ where: { id: attachmentId } })
    if (!attachment) {
      // Already deleted — return 404 (access check cannot be performed without cardId)
      res.status(404).json({ error: { message: "Attachment not found", status: 404 } })
      return
    }

    const access = await resolveCardAccess(res, attachment.cardId, req.user!.id)
    if (!access) return

    if (!canWrite(access.membership.role)) {
      res.status(403).json({ error: { message: "Viewers cannot delete attachments", status: 403 } })
      return
    }

    const isOwnerOrAdmin = access.membership.role === "OWNER" || access.membership.role === "ADMIN"
    if (attachment.userId !== req.user!.id && !isOwnerOrAdmin) {
      res.status(403).json({ error: { message: "You can only delete your own attachments", status: 403 } })
      return
    }

    // Delete from Cloudinary first, then DB record
    const key = keyFromUrl(attachment.url)
    try {
      await storage.delete(key)
    } catch (err) {
      // Log but continue — DB record is still removed so the UI stays consistent.
      // Check server logs if Cloudinary files appear to linger.
      logger.warn("Failed to delete attachment from Cloudinary storage", {
        attachmentId,
        key,
        error: err instanceof Error ? err.message : String(err),
      })
    }
    await prisma.attachment.deleteMany({ where: { id: attachmentId } })

    res.json({ success: true })
  } catch {
    res.status(500).json({ error: { message: "Failed to delete attachment", status: 500 } })
  }
})

export { router as attachmentsRouter }
