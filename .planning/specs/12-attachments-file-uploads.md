# Spec: Feature #12 — Attachments & File Uploads

**Created**: 2026-06-01
**Status**: draft
**Author**: team
**Epic**: flowgrid-saas
**Depends on**: #10 (Card Details Modal)

---

## Problem

Users working inside cards have no way to attach files directly to a task. Files end up
scattered across Slack messages, external links pasted into comments, or email threads.
There is no single source of truth for the assets that belong to a piece of work —
screenshots, mockups, briefs, contracts, and documents have to be hunted down across
multiple tools every time a teammate joins a card or a review round begins.

---

## Goal

Any user with write access to a card can upload files to that card, and any member with
read access can view and download those files from within the card detail modal.
Files are stored durably (Cloudflare R2 in production, local disk in dev), linked to
the card in the database, and cleaned up automatically when the card is deleted.

Success = a user opens a card, uploads a file, and a teammate immediately sees it in
the attachment list and can download it — without leaving FlowGrid.

---

## User Stories

1. **As a designer**, I want to attach mockups and screenshots directly to a card so
   reviewers can see the latest assets without searching Slack or opening external links.

2. **As a developer**, I want to upload bug screenshots, log files, or reproduction
   videos to a task so reproduction context stays permanently attached to the work item.

3. **As a PM**, I want to attach requirement docs, briefs, or contracts so all task
   context lives in one place and is visible to anyone who opens the card.

---

## Requirements

### Must Have
- Upload one or more files to a card via file picker or drag-and-drop
- List all attachments for a card (name, size, uploader name, upload date, file type icon)
- Download any attachment directly from the card
- Delete own attachment; OWNER/ADMIN can delete any attachment
- 25 MB per-file hard limit — rejected frontend-first, enforced backend-second
- Allowed file types enforced — block `.exe`, `.sh`, `.bat`, `.cmd`, `.ps1`, `.app`,
  `.dmg`, `.pkg`, `.deb`, `.rpm`, `.msi`, `.vbs`, `.jar` (executables)
- Storage: local disk in dev (`uploads/` directory served as static); Cloudflare R2 in
  production (S3-compatible API via `@aws-sdk/client-s3`)
- Object keys use UUID + original extension — never the original filename (prevents
  collisions and path traversal)
- If R2 upload succeeds but DB insert fails → delete the uploaded object (compensating
  cleanup) before returning an error
- Attachment records and storage objects deleted when the parent card is deleted
  (handled via Prisma cascade + storage cleanup hook in the delete card route)
- Auth validation on every attachment API call — user must have access to the workspace
  and board that contains the card
- VIEWER role cannot upload or delete attachments (read/download only)

### Nice to Have
- Inline image thumbnail preview (≤200px) for `.jpg`, `.jpeg`, `.png`, `.gif`,
  `.webp` files — rendered client-side via `<img>` tag pointing at the stored URL
- Optimistic UI — show a spinner/skeleton entry during upload before the server confirms
- Copy link to clipboard button on each attachment

### Out of Scope
- Inline image embeds inside TipTap description editor
- Video playback / media streaming inside FlowGrid
- Versioned attachments (replace v1 with v2 with history)
- Folder organization or attachment categories
- Per-file granular upload progress bars (basic loading state is in scope)
- Presigned URL generation (public bucket with UUID keys is acceptable for MVP)

---

## Data Model

**No new migration needed.** The `Attachment` model already exists in the schema:

```prisma
model Attachment {
  id        String   @id @default(cuid())
  cardId    String
  userId    String
  name      String        // original filename (display only)
  url       String        // full public URL to the stored object
  mimeType  String?       // nullable — browser may not report for unusual types
  size      Int?          // bytes — nullable for safety
  createdAt DateTime @default(now()) @db.Timestamptz()
  updatedAt DateTime @updatedAt @db.Timestamptz()

  card Card @relation(fields: [cardId], references: [id], onDelete: Cascade)
  @@index([cardId])
}
```

**Object key format**: `attachments/{cardId}/{uuid}{.ext}` — stored in R2 or local disk.

**URL stored in `url` field**:
- Dev: `http://localhost:3001/uploads/attachments/{cardId}/{uuid}{.ext}`
- Prod: `https://{R2_PUBLIC_DOMAIN}/attachments/{cardId}/{uuid}{.ext}`

---

## API Changes

All endpoints are RPC-style. All mutations use POST. No path params — IDs via query string.

### New routes (`apps/api/src/routes/attachments.ts`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/attachments?cardId=` | required | List all attachments for a card |
| `POST` | `/api/attachments` | required, writer | Upload a file (multipart/form-data) |
| `POST` | `/api/attachments/delete?id=` | required, owner or admin | Delete an attachment |

### POST /api/attachments (upload)

**Request**: `multipart/form-data`
```
file: <binary>
cardId: string
```

**Response 201**:
```json
{
  "id": "clxxx",
  "cardId": "clyyy",
  "userId": "clzzz",
  "name": "mockup-v3.png",
  "url": "https://pub.r2.dev/attachments/clyyy/550e8400-e29b.png",
  "mimeType": "image/png",
  "size": 204800,
  "createdAt": "2026-06-01T10:00:00.000Z",
  "uploader": { "id": "clzzz", "name": "Jane Doe", "avatarUrl": null }
}
```

**Errors**:
- `400` — missing cardId, file too large (>25MB), blocked file type
- `403` — VIEWER role, or no access to the card's workspace/board
- `404` — card not found
- `502` — R2 unavailable (after cleanup attempt)

### GET /api/attachments?cardId=

**Response 200**:
```json
[
  {
    "id": "clxxx",
    "cardId": "clyyy",
    "name": "brief.pdf",
    "url": "https://...",
    "mimeType": "application/pdf",
    "size": 512000,
    "createdAt": "2026-06-01T10:00:00.000Z",
    "uploader": { "id": "clzzz", "name": "Jane Doe", "avatarUrl": null }
  }
]
```

### POST /api/attachments/delete?id=

**Response 200**: `{ "success": true }`

Auth rule: uploader OR workspace OWNER/ADMIN. Delete is idempotent (second call returns success).
Storage object must be deleted before DB record is removed to avoid leaks on partial failure.

---

## Frontend Changes

### Files to change
- `apps/web/src/api/attachments.ts` — new API client
- `apps/web/src/components/boards/CardDetailModal.tsx` — add attachment section
- `packages/types/src/index.ts` — add `Attachment` and `AttachmentUploader` interfaces

### New TypeScript types (`packages/types/src/index.ts`)

```typescript
export interface AttachmentUploader {
  id: string
  name: string
  avatarUrl: string | null
}

export interface Attachment {
  id: string
  cardId: string
  name: string
  url: string
  mimeType: string | null
  size: number | null
  createdAt: string
  uploader: AttachmentUploader
}
```

### New API client (`apps/web/src/api/attachments.ts`)

```typescript
list(cardId: string): Promise<Attachment[]>
upload(cardId: string, file: File, onProgress?: (pct: number) => void): Promise<Attachment>
remove(id: string): Promise<void>
```

### CardDetailModal changes

**New section below the description**, above comments:

```
─── Attachments ─────────────────── [+ Add]

  📎 brief.pdf         512 KB · Jane Doe · 2h ago   [↓] [×]
  🖼 mockup-v3.png     200 KB · Alex K   · 1d ago   [↓] [×]  <thumbnail if image>

  ┌──────────────────────────────────────────────┐
  │  Drag and drop files here, or click to browse │
  │  Max 25 MB · Images, PDFs, docs, archives    │
  └──────────────────────────────────────────────┘
```

- **Upload trigger**: click the drop zone OR the `[+ Add]` button → opens file picker
  with `multiple` attribute; also accepts drag-drop
- **During upload**: spinner skeleton entry appears in the list immediately (optimistic)
- **After upload**: skeleton replaced with real entry; error toast on failure
- **Image thumbnails**: `<img src={attachment.url}>` in a 48×48 box for image mimeTypes
- **Non-image files**: icon from file extension (PDF → 📄, zip → 🗜, video → 🎬, generic → 📎)
- **Download**: `<a href={url} download={name} target="_blank">` — no proxy needed
- **Delete**: confirmation not required for MVP; `canWrite` check hides delete button
  for VIEWERs; uploader always sees delete; OWNER/ADMIN see delete on all entries
- **VIEWER gating**: hide drop zone and `[+ Add]` button entirely

---

## Storage Implementation

### Environment variables (new)

```
# Dev (local disk)
STORAGE_PROVIDER=local

# Production (Cloudflare R2)
STORAGE_PROVIDER=r2
R2_ACCOUNT_ID=<cloudflare-account-id>
R2_ACCESS_KEY_ID=<r2-access-key>
R2_SECRET_ACCESS_KEY=<r2-secret-key>
R2_BUCKET_NAME=flowgrid-attachments
R2_PUBLIC_DOMAIN=<pub.r2.dev domain or custom domain>
```

### Storage abstraction (`apps/api/src/lib/storage.ts`)

```typescript
interface StorageProvider {
  upload(key: string, buffer: Buffer, mimeType: string): Promise<string>  // returns public URL
  delete(key: string): Promise<void>
}
```

- `LocalStorageProvider` — writes to `apps/api/uploads/`, returns `http://localhost:3001/uploads/{key}`
- `R2StorageProvider` — uses `@aws-sdk/client-s3` with `endpoint: https://{accountId}.r2.cloudflarestorage.com`

Selected at startup via `STORAGE_PROVIDER` env var. Single exported `storage` singleton.

### Dependencies (new)

```
apps/api:  @aws-sdk/client-s3   multer   @types/multer
apps/web:  (no new dependencies)
```

---

## Edge Cases

| # | Case | Handling |
|---|------|----------|
| A | File > 25 MB | Frontend rejects before upload; multer `limits.fileSize` rejects on backend |
| B | R2 upload OK, DB insert fails | Compensating delete of R2 object before returning 502 |
| C | Two simultaneous deletes of same attachment | Idempotent — `deleteMany` returns success even if already gone |
| D | Card deleted with attachments | Prisma cascade deletes `Attachment` records; card delete route also fires `storage.delete()` for each object key |
| E | Executable file type uploaded | Extension + mimeType blocklist checked pre-upload on backend; frontend also filters `accept` attribute |
| F | R2 unavailable | Upload returns 502 with user-facing error message; retry is UI-initiated |
| G | Missing / wrong mimeType | Stored as `null`; UI falls back to extension-based icon |
| H | Duplicate filename from same user | UUIDs in object key prevent collision; both files stored independently |
| I | Network drop mid-upload | Multer receives partial body; no DB record written unless full upload completes |
| J | Auth leak — accessing other workspaces' attachments | All attachment endpoints verify `cardId` → `board` → `workspace` → `WorkspaceMember` chain |
| K | R2 cost runaway | UUID keys prevent duplicates; no transformation variants; no background polling |

---

## Testing Criteria

### Happy path
- Upload a PNG to a card → appears in attachment list with thumbnail
- Upload a PDF → appears with PDF icon, correct size and uploader
- Click download → file downloaded with correct name
- Delete own attachment → removed from list; storage object gone
- OWNER deletes another member's attachment → succeeds

### Edge cases to verify
- Upload 30 MB file → rejected with clear error before API call
- Upload `.exe` → blocked with "file type not allowed" error
- Simulate R2 failure (toggle `STORAGE_PROVIDER` to a broken endpoint) → 502, no orphan record
- Delete card that has attachments → no attachment orphans in storage
- VIEWER opens card → no upload zone, no delete buttons visible
- Two browser tabs delete same attachment simultaneously → both return success (no 500)

---

## Dependencies

- Feature #10 (Card Details Modal) — ✅ done — `CardDetailModal` already exists
- `Attachment` Prisma model — ✅ already in schema, no new migration
- Cloudflare R2 bucket + access credentials (prod only)
- `@aws-sdk/client-s3` (new package, API only)
- `multer` + `@types/multer` (new packages, API only)
- Express static middleware for local dev file serving (already in Express, just needs wiring)

---

## Gate 1 Checklist

- [x] Problem clearly stated (not vague)
- [x] Goal is specific and measurable
- [x] At least one user story exists (3 stories)
- [x] Requirements split into must-have, nice-to-have, out of scope
- [x] Out of scope section exists
- [x] New Attachment model — already in schema, TIMESTAMPTZ ✅, soft delete N/A (cascade delete)
- [x] Column types correct (String/Int/DateTime)
- [x] Endpoints follow RPC naming convention (no path params, POST for mutations)
- [x] Request/response examples included
- [x] JSON field naming is camelCase (frontend) / camelCase auto-converted by axios
- [x] Edge cases listed (11 cases, A–K)
- [x] Testing criteria for happy path
- [x] Testing criteria for edge cases
- [x] Dependencies listed
