import type { PresenceUser } from "@flowgrid/types"
import { getAvatarBg, getInitials } from "../../utils/avatar"

interface BoardPresenceProps {
  users: PresenceUser[]
}

const MAX_VISIBLE = 2

export default function BoardPresence({ users }: BoardPresenceProps) {
  if (users.length === 0) return null

  const sorted = [...users].sort((a, b) => {
    if (!a.memberSince && !b.memberSince) return 0
    if (!a.memberSince) return 1
    if (!b.memberSince) return -1
    return new Date(a.memberSince).getTime() - new Date(b.memberSince).getTime()
  })
  const visible = sorted.slice(0, MAX_VISIBLE)
  const overflow = users.length - MAX_VISIBLE

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
      {visible.map((user, i) => (
        <div
          key={user.userId}
          title={user.name ?? user.userId}
          style={{
            width: "28px",
            height: "28px",
            borderRadius: "50%",
            background: user.avatarUrl ? "transparent" : getAvatarBg(user.userId),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "11px",
            fontWeight: 600,
            color: "#fff",
            overflow: "hidden",
            flexShrink: 0,
            marginLeft: i > 0 ? "-6px" : 0,
            border: "2px solid var(--color-surface, #fff)",
            boxSizing: "border-box",
          }}
        >
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.name ?? "User"}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            getInitials(user.name)
          )}
        </div>
      ))}
      {overflow > 0 && (
        <div
          style={{
            marginLeft: "-6px",
            width: "28px",
            height: "28px",
            borderRadius: "50%",
            background: "var(--color-surface-raised, #e2e8f0)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "10px",
            fontWeight: 600,
            color: "var(--color-text-secondary, #64748b)",
            flexShrink: 0,
            border: "2px solid var(--color-surface, #fff)",
            boxSizing: "border-box",
          }}
        >
          +{overflow}
        </div>
      )}
    </div>
  )
}
