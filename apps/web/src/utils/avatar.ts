export function hashCode(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0
  }
  return h
}

export function getInitials(name: string | null): string {
  if (!name) return "?"
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return (parts[0].slice(0, 2) || "?").toUpperCase()
  return ((parts[0][0] ?? "") + (parts[parts.length - 1][0] ?? "")).toUpperCase() || "?"
}

export function getAvatarBg(id: string): string {
  const hue = Math.abs(hashCode(id)) % 360
  return `hsl(${hue}, 55%, 48%)`
}
