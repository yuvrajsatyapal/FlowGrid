import fs from "fs"
import path from "path"
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3"
import { v2 as cloudinary } from "cloudinary"
import { env } from "../config/env"

interface StorageProvider {
  upload(key: string, buffer: Buffer, mimeType: string): Promise<string>
  delete(key: string): Promise<void>
}

// Extensions Cloudinary treats as image resources.
// Kept in sync with the mimeType.startsWith("image/") check in CloudinaryStorageProvider.upload().
const IMAGE_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg",
  ".bmp", ".tiff", ".tif", ".ico", ".heic", ".heif", ".avif",
])

// Derives the storage key from a stored public URL.
// Returns a provider-agnostic path of the form: "folder/subdir/filename.ext"
//
// Cloudinary: https://res.cloudinary.com/{cloud}/{type}/upload/[{transforms}/]v{version}/{path}.ext
//   → extracts everything after v{version}/, ignoring any transform segments before it
// Local:      http://localhost:PORT/uploads/{path}
//   → strips the leading /uploads/ prefix
// R2 / other: strips the leading slash from the URL pathname
export function keyFromUrl(url: string): string {
  const parsed = new URL(url)

  if (parsed.hostname === "res.cloudinary.com") {
    const uploadMarker = "/upload/"
    const uploadIdx = parsed.pathname.indexOf(uploadMarker)
    if (uploadIdx === -1) {
      return parsed.pathname.replace(/^\//, "")
    }
    const afterUpload = parsed.pathname.substring(uploadIdx + uploadMarker.length)
    // Version segment: v followed only by digits (e.g. v1234567890).
    // Any transform segments before it (e.g. f_auto,q_auto) are skipped.
    // The regex backtracks so it always anchors to the first v{digits}/ occurrence.
    const versionMatch = afterUpload.match(/(?:^|.*\/)v\d+\/(.+)$/)
    return versionMatch ? versionMatch[1] : afterUpload
  }

  return parsed.pathname.replace(/^\/uploads\//, "").replace(/^\//, "")
}

class LocalStorageProvider implements StorageProvider {
  private readonly uploadsDir: string

  constructor() {
    this.uploadsDir = path.join(__dirname, "../../uploads")
  }

  async upload(key: string, buffer: Buffer, _mimeType: string): Promise<string> {
    const filePath = path.join(this.uploadsDir, key)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, buffer)
    const baseUrl = env.API_BASE_URL ?? `http://localhost:${env.PORT}`
    return `${baseUrl}/uploads/${key}`
  }

  async delete(key: string): Promise<void> {
    const filePath = path.join(this.uploadsDir, key)
    try {
      fs.unlinkSync(filePath)
    } catch (err: unknown) {
      // Ignore "file not found" — idempotent delete
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err
    }
  }
}

class R2StorageProvider implements StorageProvider {
  private readonly client: S3Client
  private readonly bucket: string
  private readonly publicDomain: string

  constructor() {
    const accountId = env.R2_ACCOUNT_ID!
    this.bucket = env.R2_BUCKET_NAME!
    this.publicDomain = env.R2_PUBLIC_DOMAIN!

    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID!,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
      },
    })
  }

  async upload(key: string, buffer: Buffer, mimeType: string): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      }),
    )
    const domain = this.publicDomain.startsWith("http") ? this.publicDomain : `https://${this.publicDomain}`
    return `${domain}/${key}`
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
  }
}

class CloudinaryStorageProvider implements StorageProvider {
  constructor() {
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME!,
      api_key: env.CLOUDINARY_API_KEY!,
      api_secret: env.CLOUDINARY_API_SECRET!,
      secure: true,
    })
  }

  async upload(key: string, buffer: Buffer, mimeType: string): Promise<string> {
    const isImage = mimeType.startsWith("image/")
    const resourceType = isImage ? "image" : "raw"
    // Cloudinary image public_ids exclude the file extension; raw public_ids include it.
    const publicId = isImage ? key.replace(/\.[^.]+$/, "") : key

    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { public_id: publicId, resource_type: resourceType },
        (error, result) => {
          if (error || !result) {
            reject(error ?? new Error("Cloudinary upload returned no result"))
          } else {
            resolve(result.secure_url)
          }
        },
      )
      stream.end(buffer)
    })
  }

  async delete(key: string): Promise<void> {
    const ext = path.extname(key).toLowerCase()
    const isImage = IMAGE_EXTENSIONS.has(ext)
    const resourceType = isImage ? "image" : "raw"
    // Image public_id = key without extension; raw public_id = key with extension.
    const publicId = isImage ? key.replace(/\.[^.]+$/, "") : key
    // destroy() returns { result: "not found" } for missing assets — it never throws —
    // so this is safe to call for keys that pre-date the Cloudinary migration.
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType })
  }
}

function createStorageProvider(): StorageProvider {
  if (env.STORAGE_PROVIDER === "cloudinary") {
    return new CloudinaryStorageProvider()
  }
  if (env.STORAGE_PROVIDER === "r2") {
    return new R2StorageProvider()
  }
  return new LocalStorageProvider()
}

export const storage = createStorageProvider()
