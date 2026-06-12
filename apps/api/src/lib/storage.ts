import path from "path"
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

// Derives the storage key from a Cloudinary public URL.
// Cloudinary: https://res.cloudinary.com/{cloud}/{type}/upload/[{transforms}/]v{version}/{path}.ext
//   → extracts everything after v{version}/, ignoring any transform segments before it
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

  return parsed.pathname.replace(/^\//, "")
}

class CloudinaryStorageProvider implements StorageProvider {
  constructor() {
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
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
    // invalidate: true also purges the CDN edge cache, not just the origin.
    const result = await cloudinary.uploader.destroy(publicId, { resource_type: resourceType, invalidate: true })
    if (result.result !== "ok") {
      throw new Error(`Cloudinary delete failed: ${result.result} (public_id: ${publicId}, resource_type: ${resourceType})`)
    }
  }
}

export const storage: StorageProvider = new CloudinaryStorageProvider()
