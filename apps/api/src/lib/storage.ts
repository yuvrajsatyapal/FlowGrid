import fs from "fs"
import path from "path"
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3"
import { env } from "../config/env"

interface StorageProvider {
  upload(key: string, buffer: Buffer, mimeType: string): Promise<string>
  delete(key: string): Promise<void>
}

// Derive the object key from a public URL — strips protocol + host (+ /uploads/ prefix for local).
// Both local and R2 produce keys of the form: "attachments/{cardId}/{uuid}.ext"
export function keyFromUrl(url: string): string {
  const pathname = new URL(url).pathname
  // Local URLs: /uploads/attachments/... → attachments/...
  return pathname.replace(/^\/uploads\//, "").replace(/^\//, "")
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

function createStorageProvider(): StorageProvider {
  if (env.STORAGE_PROVIDER === "r2") {
    return new R2StorageProvider()
  }
  return new LocalStorageProvider()
}

export const storage = createStorageProvider()
