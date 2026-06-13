import { useState } from "react"
import { getInitials, getAvatarBg } from "../../utils/avatar"
import { useBoardMembers } from "../../features/board/queries/useBoardMembers"
import { useAddBoardMember } from "../../features/board/mutations/useAddBoardMember"
import { useRemoveBoardMember } from "../../features/board/mutations/useRemoveBoardMember"
import type { WsMemberLite } from "../../features/board/presence/useBoardPresence"

interface Props {
  boardId: string
  boardCreatorId: string | null
  allWsMembers: WsMemberLite[]
  onClose: () => void
}

/** The Board Access dropdown (PRIVATE boards): current members + add members.
 *  Owns its own search/in-flight/error state and the board-member query +
 *  add/remove mutations. Extracted verbatim from BoardPage (Phase 3e). */
export default function BoardAccessPanel({ boardId, boardCreatorId, allWsMembers, onClose }: Props) {
  const boardMembersQuery = useBoardMembers(boardId)
  const boardMembers = boardMembersQuery.data ?? []
  const loadingBoardMembers = boardMembersQuery.isLoading
  const addBoardMember = useAddBoardMember(boardId)
  const removeBoardMember = useRemoveBoardMember(boardId)

  const [addMemberSearch, setAddMemberSearch] = useState("")
  const [addingMember, setAddingMember] = useState<string | null>(null)
  const [removingMember, setRemovingMember] = useState<string | null>(null)
  const [accessError, setAccessError] = useState("")

  async function handleAddMember(userId: string) {
    setAddingMember(userId)
    setAccessError("")
    try {
      await addBoardMember.mutateAsync({ userId })
    } catch (err) {
      setAccessError((err as Error).message || "Failed to add member")
    } finally {
      setAddingMember(null)
    }
  }

  async function handleRemoveMember(userId: string) {
    setRemovingMember(userId)
    setAccessError("")
    try {
      await removeBoardMember.mutateAsync({ userId })
    } catch (err) {
      setAccessError((err as Error).message || "Failed to remove member")
    } finally {
      setRemovingMember(null)
    }
  }

  const boardMemberIds = new Set(boardMembers.map((m) => m.userId))
  const filteredAddCandidates = allWsMembers.filter((m) => {
    if (boardMemberIds.has(m.userId)) return false
    const q = addMemberSearch.toLowerCase()
    return (m.name ?? "").toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
  })

  return (
    <>
      {/* Click-outside backdrop */}
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 49 }} />
      {/* Dropdown panel */}
      <div
        style={{
          position: "absolute",
          top: "calc(100% + 8px)",
          right: 0,
          zIndex: 50,
          width: 480,
          maxWidth: "calc(100vw - 32px)",
          background: "oklch(var(--color-paper))",
          border: "1px solid oklch(var(--color-border))",
          borderRadius: "var(--radius-card)",
          boxShadow: "0 8px 32px oklch(0% 0 0 / 0.16)",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: 600, color: "oklch(var(--color-ink))" }}>
            Board Access
          </h3>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "oklch(var(--color-ink-3))", fontSize: 18, lineHeight: 1, padding: "2px 4px" }}
            aria-label="Close board access panel"
          >
            ×
          </button>
        </div>

        {accessError && (
          <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "oklch(var(--color-error))" }}>{accessError}</p>
        )}

        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          {/* Current members */}
          <div style={{ flex: "1 1 180px", display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "oklch(var(--color-ink-2))", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Current members
            </span>
            {loadingBoardMembers ? (
              <span style={{ fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-3))" }}>Loading…</span>
            ) : boardMembers.length === 0 ? (
              <span style={{ fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-3))" }}>No members yet</span>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {boardMembers.map((m) => (
                  <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div
                      style={{
                        width: 26, height: 26, borderRadius: "50%",
                        background: m.avatarUrl ? "transparent" : getAvatarBg(m.userId),
                        display: "flex", alignItems: "center", justifyContent: "center",
                        overflow: "hidden", flexShrink: 0,
                      }}
                    >
                      {m.avatarUrl
                        ? <img src={m.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : <span style={{ fontSize: 9, fontWeight: 700, color: "#fff" }}>{getInitials(m.name ?? m.email)}</span>
                      }
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "oklch(var(--color-ink))", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {m.name ?? m.email}
                      </div>
                      <div style={{ fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-3))" }}>{m.role.toLowerCase()}</div>
                    </div>
                    {m.userId !== boardCreatorId && (
                      <button
                        onClick={() => void handleRemoveMember(m.userId)}
                        disabled={removingMember === m.userId}
                        aria-label={`Remove ${m.name ?? m.email}`}
                        style={{
                          background: "none", border: "none", cursor: removingMember === m.userId ? "not-allowed" : "pointer",
                          color: "oklch(var(--color-error))", fontSize: "var(--text-xs)", padding: "2px 6px",
                          borderRadius: "var(--radius-badge)", opacity: removingMember === m.userId ? 0.5 : 1,
                        }}
                      >
                        {removingMember === m.userId ? "…" : "Remove"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add members */}
          <div style={{ flex: "1 1 180px", display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "oklch(var(--color-ink-2))", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Add members
            </span>
            <input
              type="text"
              placeholder="Search workspace members…"
              value={addMemberSearch}
              onChange={(e) => setAddMemberSearch(e.target.value)}
              style={{
                padding: "6px 10px", borderRadius: "var(--radius-input)",
                border: "1px solid oklch(var(--color-border))",
                background: "oklch(var(--color-paper-2))",
                color: "oklch(var(--color-ink))", fontSize: "var(--text-sm)",
                fontFamily: "var(--font-body)", outline: "none",
              }}
            />
            <div style={{ maxHeight: 150, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
              {filteredAddCandidates.length === 0 ? (
                <span style={{ fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-3))" }}>
                  {addMemberSearch ? "No members match" : "All workspace members already have access"}
                </span>
              ) : (
                filteredAddCandidates.map((m) => (
                  <div key={m.userId} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div
                      style={{
                        width: 24, height: 24, borderRadius: "50%",
                        background: m.avatarUrl ? "transparent" : getAvatarBg(m.userId),
                        display: "flex", alignItems: "center", justifyContent: "center",
                        overflow: "hidden", flexShrink: 0,
                      }}
                    >
                      {m.avatarUrl
                        ? <img src={m.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : <span style={{ fontSize: 8, fontWeight: 700, color: "#fff" }}>{getInitials(m.name ?? m.email)}</span>
                      }
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "var(--text-sm)", color: "oklch(var(--color-ink))", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {m.name ?? m.email}
                      </div>
                    </div>
                    <button
                      onClick={() => void handleAddMember(m.userId)}
                      disabled={addingMember === m.userId}
                      aria-label={`Add ${m.name ?? m.email}`}
                      style={{
                        padding: "3px 10px", borderRadius: "var(--radius-badge)",
                        border: "1px solid oklch(var(--color-accent))",
                        background: "transparent", color: "oklch(var(--color-accent))",
                        fontSize: "var(--text-xs)", fontWeight: 500,
                        cursor: addingMember === m.userId ? "not-allowed" : "pointer",
                        opacity: addingMember === m.userId ? 0.5 : 1,
                        fontFamily: "var(--font-body)",
                      }}
                    >
                      {addingMember === m.userId ? "…" : "Add"}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
