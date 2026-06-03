import { useRef, useState } from "react"
import { useAuth } from "../contexts/AuthContext"
import { usersApi } from "../api/users"
import { getInitials, getAvatarBg } from "../utils/avatar"

const sectionCard: React.CSSProperties = {
  border: "1px solid oklch(var(--color-border))",
  borderRadius: "var(--radius-card)",
  background: "oklch(var(--color-paper-2))",
  overflow: "hidden",
}
const sectionHeader: React.CSSProperties = {
  padding: "16px 20px",
  borderBottom: "1px solid oklch(var(--color-border))",
}
const sectionBody: React.CSSProperties = { padding: "20px" }
const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: "var(--radius-input)",
  border: "1px solid oklch(var(--color-border))",
  background: "oklch(var(--color-paper))",
  color: "oklch(var(--color-ink))",
  fontSize: "var(--text-sm)",
  outline: "none",
  boxSizing: "border-box",
}
const primaryBtn: React.CSSProperties = {
  padding: "8px 18px",
  borderRadius: "var(--radius-button)",
  border: "none",
  background: "oklch(var(--color-accent))",
  color: "#fff",
  fontSize: "var(--text-sm)",
  fontWeight: 500,
  cursor: "pointer",
}
const ghostBtn: React.CSSProperties = {
  padding: "7px 14px",
  borderRadius: "var(--radius-button)",
  border: "1px solid oklch(var(--color-border))",
  background: "transparent",
  color: "oklch(var(--color-ink-2))",
  fontSize: "var(--text-sm)",
  cursor: "pointer",
}
const dangerGhostBtn: React.CSSProperties = {
  ...ghostBtn,
  borderColor: "oklch(var(--color-error) / 0.4)",
  color: "oklch(var(--color-error))",
}

export default function ProfilePage() {
  const { user, updateUser } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [name, setName] = useState(user?.name ?? "")
  const [nameFocused, setNameFocused] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState("")
  const [saveSuccess, setSaveSuccess] = useState(false)

  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState("")

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    setSaving(true)
    setSaveError("")
    setSaveSuccess(false)
    try {
      const updated = await usersApi.updateName(trimmed)
      updateUser({ name: updated.name })
      setName(updated.name ?? "")
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2500)
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } }
      setSaveError(axiosErr?.response?.data?.error?.message ?? "Failed to save changes")
    } finally {
      setSaving(false)
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""
    setUploading(true)
    setUploadError("")
    try {
      const updated = await usersApi.uploadAvatar(file)
      updateUser({ avatarUrl: updated.avatarUrl })
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } }
      setUploadError(axiosErr?.response?.data?.error?.message ?? "Failed to upload photo")
    } finally {
      setUploading(false)
    }
  }

  const handleRemoveAvatar = async () => {
    setUploading(true)
    setUploadError("")
    try {
      const updated = await usersApi.removeAvatar()
      updateUser({ avatarUrl: updated.avatarUrl })
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } }
      setUploadError(axiosErr?.response?.data?.error?.message ?? "Failed to remove photo")
    } finally {
      setUploading(false)
    }
  }

  const initials = getInitials(user?.name ?? user?.email ?? "?")
  const avatarBg = getAvatarBg(user?.id ?? "")

  return (
    <div
      style={{
        padding: "32px 36px",
        maxWidth: "560px",
        color: "oklch(var(--color-ink))",
        fontFamily: "var(--font-body)",
      }}
    >
      <div style={{ marginBottom: "28px" }}>
        <h1
          style={{
            margin: 0,
            fontSize: "var(--text-xl)",
            fontWeight: 600,
            letterSpacing: "-0.02em",
            fontFamily: "var(--font-display)",
          }}
        >
          Profile
        </h1>
        <p style={{ margin: "6px 0 0", fontSize: "var(--text-sm)", color: "oklch(var(--color-ink-2))" }}>
          {user?.email}
        </p>
      </div>

      <div style={sectionCard}>
        <div style={sectionHeader}>
          <h2 style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: 600 }}>Your profile</h2>
        </div>
        <div style={sectionBody}>
          {/* Avatar row */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "20px" }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: user?.avatarUrl ? "transparent" : avatarBg,
                flexShrink: 0,
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: uploading ? "default" : "pointer",
                opacity: uploading ? 0.6 : 1,
                border: "2px solid oklch(var(--color-border))",
              }}
              onClick={() => !uploading && fileInputRef.current?.click()}
              title="Click to change photo"
            >
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <span style={{ fontSize: "18px", fontWeight: 700, color: "#fff" }}>{initials}</span>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  style={{ ...ghostBtn, opacity: uploading ? 0.5 : 1, cursor: uploading ? "not-allowed" : "pointer" }}
                >
                  {uploading ? "Uploading…" : "Upload photo"}
                </button>
                {user?.avatarUrl && (
                  <button
                    type="button"
                    onClick={handleRemoveAvatar}
                    disabled={uploading}
                    style={{ ...dangerGhostBtn, opacity: uploading ? 0.5 : 1, cursor: uploading ? "not-allowed" : "pointer" }}
                  >
                    Remove
                  </button>
                )}
              </div>
              <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-3))" }}>
                PNG or JPG, max 2 MB
              </p>
              {uploadError && (
                <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "oklch(var(--color-error))" }}>{uploadError}</p>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp,image/avif"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
          </div>

          {/* Name form */}
          <form onSubmit={handleSaveName} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label htmlFor="profile-name" style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "oklch(var(--color-ink-2))" }}>
                Display name
              </label>
              <input
                id="profile-name"
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value); setSaveSuccess(false) }}
                onFocus={() => setNameFocused(true)}
                onBlur={() => setNameFocused(false)}
                disabled={saving}
                maxLength={100}
                style={{
                  ...inputStyle,
                  maxWidth: "320px",
                  borderColor: nameFocused ? "oklch(var(--color-accent))" : "oklch(var(--color-border))",
                  boxShadow: nameFocused ? "0 0 0 3px oklch(var(--color-accent-muted))" : "none",
                }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "oklch(var(--color-ink-2))" }}>
                Email <span style={{ fontWeight: 400, fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-3))" }}>(read-only)</span>
              </label>
              <input
                type="email"
                value={user?.email ?? ""}
                disabled
                style={{ ...inputStyle, maxWidth: "320px", opacity: 0.5, cursor: "not-allowed" }}
              />
              <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-3))" }}>
                Signed in with Google — email can't be changed here.
              </p>
            </div>

            {saveError && (
              <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "oklch(var(--color-error))" }}>{saveError}</p>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <button
                type="submit"
                disabled={saving || name.trim().length === 0}
                style={{
                  ...primaryBtn,
                  opacity: saving || name.trim().length === 0 ? 0.5 : 1,
                  cursor: saving || name.trim().length === 0 ? "not-allowed" : "pointer",
                }}
                onMouseEnter={(e) => { if (!saving) e.currentTarget.style.background = "oklch(var(--color-accent-hover))" }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "oklch(var(--color-accent))" }}
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
              {saveSuccess && (
                <span style={{ fontSize: "var(--text-xs)", color: "oklch(var(--color-success))" }}>Saved</span>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
