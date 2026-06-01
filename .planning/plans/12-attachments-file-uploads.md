# Plan: Feature #12 — Attachments & File Uploads

**Spec**: .planning/specs/12-attachments-file-uploads.md
**Epic**: flowgrid-saas
**Created**: 2026-06-01
**Status**: draft

---

## Architecture

### Stack detected: Full-stack (Node.js/Express API + React/Vite web)

### Component Table

| Component | Type | Purpose |
|-----------|------|---------|
| `storage.ts` | Lib | StorageProvider interface + LocalStorageProvider (disk) + R2StorageProvider (Cloudflare); `upload()`, `delete()`, `keyFromUrl()` |
| `attachments.ts` (route) | API Route | `GET /api/attachments?cardId=`, `POST /api/attachments`, `POST /api/attachments/delete?id=` |
| `env.ts` | Config | Adds `STORAGE_PROVIDER`, `R2_*` env vars with zod validation |
| `AttachmentSection.tsx` | React Component | Drop zone, attachment list with icons/thumbnails, upload + delete actions |
| `attachments.ts` (api client) | Frontend API | `list`, `upload`, `remove` — follows `commentsApi` pattern |
| `packages/types` | Shared Types | Adds `AttachmentUploader` + `AttachmentResponse` interfaces |

### File Locations

| File | Location | Purpose |
|------|----------|---------|
| `storage.ts` | `apps/api/src/lib/storage.ts` | Storage abstraction, new |
| `attachments.ts` | `apps/api/src/routes/attachments.ts` | API route, new |
| `env.ts` | `apps/api/src/config/env.ts` | Extended with R2 vars |
| `index.ts` | `apps/api/src/index.ts` | Register router + static middleware |
| `cards.ts` | `apps/api/src/routes/cards.ts` | Delete hook: cleanup attachments before soft-delete |
| `index.ts` | `packages/types/src/index.ts` | Add `AttachmentUploader` + `AttachmentResponse` |
| `attachments.ts` | `apps/web/src/api/attachments.ts` | Frontend API client, new |
| `AttachmentSection.tsx` | `apps/web/src/components/boards/AttachmentSection.tsx` | UI component, new |
| `CardDetailModal.tsx` | `apps/web/src/components/boards/CardDetailModal.tsx` | Wire in AttachmentSection |
| `.gitignore` | repo root | Add `apps/api/uploads/` to prevent committing uploaded files |

### Files to Change (existing)

| File | What Changes | Why |
|------|-------------|-----|
| `apps/api/src/config/env.ts` | Add `STORAGE_PROVIDER`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_DOMAIN` to zod schema | New env vars must be validated at startup |
| `apps/api/src/index.ts` | Import + register `attachmentsRouter`; add `express.static('uploads')` in dev | New route + local file serving |
| `apps/api/src/routes/cards.ts` | Before `card.deletedAt = new Date()`: fetch attachment records, delete storage objects, hard-delete attachment DB records | Prevent orphaned R2 objects on card delete |
| `packages/types/src/index.ts` | Add `AttachmentUploader` + `AttachmentResponse` interfaces below existing `Attachment` interface | Enriched API response shape (mirrors `CommentAuthor` / `CommentResponse` pattern) |
| `apps/web/src/components/boards/CardDetailModal.tsx` | Import + render `<AttachmentSection>` between description and comments | Surface attachments in card detail |

---

## Implementation Notes

### URL → Object Key Derivation

The `Attachment.url` field stores the public URL. The storage key is derived deterministically for delete operations:

```
Local:  http://localhost:3001/uploads/attachments/{cardId}/{uuid}.ext
        → key = new URL(url).pathname.replace(/^\/uploads\//, '').slice(1)
        → "attachments/{cardId}/{uuid}.ext"

R2:     https://{R2_PUBLIC_DOMAIN}/attachments/{cardId}/{uuid}.ext
        → key = new URL(url).pathname.slice(1)
        → "attachments/{cardId}/{uuid}.ext"
```

Both produce the same key format: `attachments/{cardId}/{uuid}.ext`.
The `storage.ts` lib exports `keyFromUrl(url: string): string` using the above logic (strips `/uploads/` prefix for local, just `pathname.slice(1)` for R2).

### Multer Configuration

Use `multer({ storage: multer.memoryStorage() })` — buffers the file, then streams to the active StorageProvider. This works identically for both local and R2 without separate multer-s3 plumbing.

### Blocked File Extensions

```typescript
const BLOCKED_EXTENSIONS = new Set(['.exe','.sh','.bat','.cmd','.ps1','.app','.dmg','.pkg','.deb','.rpm','.msi','.vbs','.jar'])
```

### resolveCardAccess in attachments.ts

Copy verbatim from `comments.ts` — it's the same authorization chain (`card → list → board → workspace → WorkspaceMember → PRIVATE board check`). No shared util needed for MVP; duplication is acceptable per existing project pattern.

### Compensating Delete (Edge Case B)

```typescript
const key = generateKey(cardId, file)
try {
  const url = await storage.upload(key, buffer, mimeType)
  await prisma.attachment.create({ data: { ... } })
  res.status(201).json(...)
} catch (err) {
  // DB insert failed — clean up the orphaned object
  await storage.delete(key).catch(() => {}) // best-effort, don't mask original error
  res.status(500).json(...)
}
```

### Card Delete Cleanup (Edge Case D)

In `POST /api/cards/delete?id=` (cards.ts line ~503), before `prisma.card.update({ deletedAt })`:

```typescript
const attachments = await prisma.attachment.findMany({ where: { cardId } })
await Promise.allSettled(attachments.map(a => storage.delete(keyFromUrl(a.url))))
await prisma.attachment.deleteMany({ where: { cardId } })
// then: prisma.card.update({ deletedAt: new Date() })
```

`Promise.allSettled` — don't let one storage failure block the card delete.

### AttachmentSection Props

```typescript
interface Props {
  cardId: string
  canEdit: boolean  // false = VIEWER, hides drop zone + delete buttons
}
```

Uses React Query `useQuery` + `useMutation` — same pattern as `CommentThread`. No new socket events.

### Image Thumbnail

For `mimeType?.startsWith('image/')`, render `<img src={url} style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 4 }}>`.
For all other types, use an icon map keyed on extension: pdf → 📄, zip/rar/tar → 🗜, mp4/mov/avi → 🎬, doc/docx → 📝, xls/xlsx → 📊, default → 📎.

---

## Task Breakdown

### Phase 1: Backend foundation (parallel start)

| # | Task | Files | What to test |
|---|------|-------|-------------|
| 1 | Install deps: `multer`, `@types/multer`, `@aws-sdk/client-s3`. Add `apps/api/uploads/` to root `.gitignore` | `apps/api/package.json`, `.gitignore` | `pnpm install` succeeds; `tsc --noEmit` clean |
| 2 | Extend `env.ts` zod schema: add `STORAGE_PROVIDER` (enum `local`/`r2`, default `local`), `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_DOMAIN` — all optional when `STORAGE_PROVIDER=local` (validated conditionally) | `apps/api/src/config/env.ts` | API starts without crashing with existing `.env` |

Tasks 1 and 2 are **parallel** — independent files.

### Phase 2: Storage abstraction

| # | Task | Files | What to test |
|---|------|-------|-------------|
| 3 | Create `storage.ts`: `StorageProvider` interface, `LocalStorageProvider` (writes to `apps/api/uploads/{key}`, creates dirs), `R2StorageProvider` (`@aws-sdk/client-s3` with R2 endpoint), exported `storage` singleton selected by `env.STORAGE_PROVIDER`, exported `keyFromUrl(url)` helper | `apps/api/src/lib/storage.ts` | Manual: `ts-node` snippet uploads a test file locally; `keyFromUrl` unit logic |

Task 3 depends on Task 2 (uses `env`).

### Phase 3: Backend API + card cleanup

| # | Task | Files | What to test |
|---|------|-------|-------------|
| 4 | Create `apps/api/src/routes/attachments.ts`: `GET /api/attachments?cardId=` (list with uploader join), `POST /api/attachments` (multer + validate ext + size + resolveCardAccess + compensating delete), `POST /api/attachments/delete?id=` (idempotent, owner or OWNER/ADMIN). Register in `index.ts` + add `express.static(path.join(__dirname,'../uploads'))` for dev | `apps/api/src/routes/attachments.ts`, `apps/api/src/index.ts` | `GET /api/attachments?cardId=xxx` returns `[]`; `POST` with valid file returns 201 |
| 5 | Update card delete route to cleanup before soft-delete: fetch attachments, `Promise.allSettled` delete from storage, `deleteMany` from DB, then set `card.deletedAt` | `apps/api/src/routes/cards.ts` | Delete a card with attachments → no orphan records in DB, storage objects removed |

Task 4 depends on Task 3. Task 5 depends on Task 4 (needs `storage` import).

### Phase 4: Shared types + frontend (parallel with Phase 3)

| # | Task | Files | What to test |
|---|------|-------|-------------|
| 6 | Add to `packages/types/src/index.ts`: `AttachmentUploader { id, name, avatarUrl }` and `AttachmentResponse { id, cardId, name, url, mimeType, size, createdAt, uploader }` interfaces below existing `Attachment` | `packages/types/src/index.ts` | `tsc --noEmit` passes in both `apps/api` and `apps/web` |
| 7 | Create `apps/web/src/api/attachments.ts`: `list(cardId)`, `upload(cardId, file, onProgress?)`, `remove(id)` — follows `commentsApi` pattern, uses `axios` with `multipart/form-data` and `onUploadProgress` | `apps/web/src/api/attachments.ts` | TypeScript compiles clean |

Task 6 is **parallel** with Phase 3 (independent package). Task 7 depends on Task 6.

### Phase 5: Frontend component + integration

| # | Task | Files | What to test |
|---|------|-------|-------------|
| 8 | Create `AttachmentSection.tsx`: drop zone (click + drag-drop), attachment list (icon/thumbnail, name, size, uploader, date, download, delete), upload loading state, error toast, `canEdit` gating | `apps/web/src/components/boards/AttachmentSection.tsx` | Renders list; clicking upload zone opens file picker; VIEWER sees no upload/delete |
| 9 | Wire into `CardDetailModal.tsx`: import + render `<AttachmentSection cardId={localCard.id} canEdit={canEdit}>` between description and comments section | `apps/web/src/components/boards/CardDetailModal.tsx` | Full flow: open card → upload file → appears in list → download works → delete removes it |

Task 8 depends on Task 7. Task 9 depends on Tasks 5 and 8 (backend must be running + component must exist).

---

## Parallel vs Sequential

| Parallel Group | Tasks | Why |
|---------------|-------|-----|
| Group A | 1, 2 | Independent: package.json vs env.ts |
| Group B | 3, 6 | Decoupled: lib vs types package (can start 6 any time) |

| Sequential Chain | Order | Why |
|-----------------|-------|-----|
| Backend chain | 2 → 3 → 4 → 5 | Each needs output of prior step |
| Frontend chain | 6 → 7 → 8 → 9 | Types before client before component |
| Integration | 5 + 8 → 9 | CardDetailModal needs both backend (card delete) and component |

---

## Testing Plan

Mapped to spec edge cases:

| Test | Spec Case | How |
|------|-----------|-----|
| Upload PNG → appears with thumbnail | Happy path | Manual + visual |
| Upload PDF → correct icon + size | Happy path | Manual |
| Download attachment → browser saves file | Happy path | Manual |
| Delete own attachment → gone from list + storage | Happy path | Manual + DB check |
| OWNER deletes other's attachment → succeeds | Happy path | Manual (switch user role) |
| Upload 30 MB file → rejected pre-request (frontend) | A | Check `file.size > 25 * 1024 * 1024` fires before `api.upload()` |
| Upload 26 MB file → multer rejects 413 | A | Bypass frontend check, hit API directly |
| Upload `.exe` → blocked "file type not allowed" | E | Frontend + API both reject |
| Simulate DB fail after R2 upload → 500, no orphan in R2 | B | Manual (mock prisma.create to throw) |
| Delete card with 2 attachments → no DB records, no storage orphans | D | Manual: upload files, delete card, query DB + check storage |
| Double-delete same attachment → both return success | C | Two simultaneous `POST /delete` requests |
| VIEWER opens card → no upload zone, no delete buttons | J | Set role to VIEWER, open card |
| Card from other workspace → 404 on attachment endpoints | J | Pass cardId from different workspace |
| Missing mimeType → `null` stored, extension icon shown | G | Upload a `.xyz` file with no known mimeType |
| Duplicate upload of same filename → both stored under different keys | H | Upload same file twice, verify 2 entries |

---

## Gate 2 Checklist

- [x] Follows existing architecture (Router → lib helpers, no manager layer — single-service pattern same as comments)
- [x] Each layer only calls the layer below (route → storage lib → S3/disk)
- [x] Components are in correct directories
- [x] All files to change are listed
- [x] All new files are listed with locations
- [x] Each task touches max 3 files
- [x] Dependencies between tasks are explicit
- [x] Parallel vs sequential tasks are marked
- [x] Data layer tests planned (attachment DB queries)
- [x] Business logic tests planned (compensating delete, idempotent delete)
- [x] API/integration tests planned (auth, VIEWER, file type validation)
- [x] UI tests planned (VIEWER gating, upload flow, thumbnails)
- [x] All 11 spec edge cases (A–K) covered in test plan
