import { useState, useRef, useCallback, useLayoutEffect, useEffect } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "framer-motion"
import type { PresenceUser } from "@flowgrid/types"
import { getInitials } from "../../utils/avatar"

interface BoardPresenceProps {
  // All board members to display (regardless of online/offline status).
  users: PresenceUser[]
  // Subset of userIds that are currently connected to the board (live).
  onlineIds?: Set<string>
  // How many avatars to show before collapsing the rest into a +N badge.
  maxVisible?: number
  coverColor?: string
}

const DEFAULT_MAX_VISIBLE = 3
const AVATAR_SIZE = 32
// Monochrome fill for initials avatars (no photo) — a solid near-black circle with a
// white letter, matching the high-contrast look of the reference design.
const INITIALS_BG = "#16171b"
const OVERLAP = 8
// Gap between the avatar's bottom edge and the tooltip.
const ARROW_GAP = 10
// Keep the tooltip this far from the viewport edge when clamping.
const EDGE_MARGIN = 8
// Keep the arrow from reaching the tooltip's rounded corners (corner radius + arrow half-width).
const ARROW_INSET = 13

interface TipPos {
  // Tooltip centre x, clamped to the viewport (the box is translateX(-50%) from here).
  cx: number
  // Distance the ▲ arrow shifts from the tooltip's visual centre so it points at the avatar centre.
  arrowShift: number
  top: number
}

// ── Anchored-tooltip positioning hook ─────────────────────────────────────────
// Anchors a portalled tooltip to a specific element, centring it horizontally on
// that element and pointing the arrow at its exact centre. Width is *measured*
// from the rendered tooltip (no guessed constant), so clamping and the arrow
// shift stay correct for any name length, avatar count, overlap, or screen size.
// Recomputes on show, scroll, and resize.

function useAnchoredTooltip() {
  const anchorRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [pos, setPos] = useState<TipPos>({ cx: 0, arrowShift: 0, top: 0 })

  const recalc = useCallback(() => {
    const anchor = anchorRef.current
    if (!anchor) return
    const r = anchor.getBoundingClientRect()
    const avatarCx = r.left + r.width / 2
    const top = r.bottom + ARROW_GAP

    // Measured half-width of the actual tooltip box. 0 on the very first frame
    // (before it has mounted) — in that case we centre on the avatar with no
    // clamp, and the useLayoutEffect re-runs with the real width before paint.
    const half = (tooltipRef.current?.offsetWidth ?? 0) / 2
    const vw = window.innerWidth
    const cx = half > 0 ? Math.min(Math.max(avatarCx, half + EDGE_MARGIN), vw - half - EDGE_MARGIN) : avatarCx

    // Arrow points at the avatar centre, but never past the tooltip's corners.
    const maxArrow = Math.max(0, half - ARROW_INSET)
    const arrowShift = Math.max(-maxArrow, Math.min(maxArrow, avatarCx - cx))

    setPos({ cx, arrowShift, top })
  }, [])

  const show = useCallback(() => {
    setVisible(true)
    recalc()
  }, [recalc])

  const hide = useCallback(() => setVisible(false), [])

  // Re-measure once the tooltip is actually in the DOM, so the clamp and arrow
  // use the real rendered width (runs before paint → no visible jump).
  useLayoutEffect(() => {
    if (visible) recalc()
  }, [visible, recalc])

  // A fixed-position tooltip drifts from its avatar on scroll/resize — track both.
  useEffect(() => {
    if (!visible) return
    const onChange = () => recalc()
    window.addEventListener("resize", onChange)
    // capture: true catches scrolls inside any nested container, not just window.
    window.addEventListener("scroll", onChange, true)
    return () => {
      window.removeEventListener("resize", onChange)
      window.removeEventListener("scroll", onChange, true)
    }
  }, [visible, recalc])

  return { anchorRef, tooltipRef, visible, pos, show, hide }
}

// ── Shared tooltip shell (portalled so no parent clips it) ─────────────────────

function AnchoredTooltip({
  visible,
  pos,
  tooltipRef,
  column = false,
  children,
}: {
  visible: boolean
  pos: TipPos
  tooltipRef: React.RefObject<HTMLDivElement>
  column?: boolean
  children: React.ReactNode
}) {
  return createPortal(
    <AnimatePresence>
      {visible && (
        <motion.div
          ref={tooltipRef}
          // The horizontal centering (x: "-50%") MUST live inside the framer-motion
          // transform — a plain `transform: translateX(-50%)` in `style` gets clobbered
          // by the animated translateY/scale, which would shift the box right by half
          // its width and push it off-screen. The clamp in recalc assumes the box is
          // centred on pos.cx, so this centering has to survive the animation.
          initial={{ opacity: 0, y: -4, scale: 0.92, x: "-50%" }}
          animate={{ opacity: 1, y: 0, scale: 1, x: "-50%" }}
          exit={{ opacity: 0, y: -4, scale: 0.92, x: "-50%" }}
          transition={{ duration: 0.12 }}
          style={{
            position: "fixed",
            top: pos.top,
            left: pos.cx,
            background: "rgba(12, 12, 12, 0.9)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            color: "#fff",
            fontSize: "11.5px",
            fontWeight: 500,
            lineHeight: 1,
            padding: column ? "8px 11px" : "6px 11px",
            borderRadius: column ? "9px" : "8px",
            whiteSpace: "nowrap",
            pointerEvents: "none",
            zIndex: 9999,
            letterSpacing: "0.01em",
            border: "1px solid rgba(255,255,255,0.1)",
            boxShadow: "0 6px 20px rgba(0,0,0,0.35)",
            ...(column ? { display: "flex", flexDirection: "column", gap: "8px" } : null),
          }}
        >
          {/* Up-pointing arrow — shifted so it always points at the avatar centre */}
          <div
            style={{
              position: "absolute",
              bottom: "100%",
              left: `calc(50% + ${pos.arrowShift}px)`,
              transform: "translateX(-50%)",
              width: 0,
              height: 0,
              borderLeft: "5px solid transparent",
              borderRight: "5px solid transparent",
              borderBottom: "5px solid rgba(12,12,12,0.9)",
            }}
          />
          {children}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

// ── Single avatar ─────────────────────────────────────────────────────────────

function AvatarItem({
  user,
  index,
  borderColor,
  online,
}: {
  user: PresenceUser
  index: number
  borderColor: string
  online: boolean
}) {
  const { anchorRef, tooltipRef, visible, pos, show, hide } = useAnchoredTooltip()

  return (
    <>
      <motion.div
        ref={anchorRef}
        layout
        initial={{ opacity: 0, scale: 0.5, x: -6 }}
        animate={{ opacity: 1, scale: 1, x: 0 }}
        exit={{ opacity: 0, scale: 0.5 }}
        transition={{ type: "spring", stiffness: 400, damping: 28, delay: index * 0.06 }}
        whileHover={{ y: 3, zIndex: 30, transition: { type: "spring", stiffness: 500, damping: 22 } }}
        onMouseEnter={show}
        onMouseLeave={hide}
        style={{
          position: "relative",
          marginLeft: index === 0 ? 0 : -OVERLAP,
          zIndex: 20 - index,
          flexShrink: 0,
          cursor: "default",
          opacity: online ? 1 : 0.78,
        }}
      >
        <div
          style={{
            width: AVATAR_SIZE,
            height: AVATAR_SIZE,
            borderRadius: "50%",
            background: user.avatarUrl ? "transparent" : INITIALS_BG,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "13px",
            fontWeight: 800,
            letterSpacing: "-0.02em",
            color: "#fff",
            overflow: "hidden",
            flexShrink: 0,
            boxSizing: "border-box",
            boxShadow: "0 1px 6px rgba(0,0,0,0.18)",
            filter: online ? "none" : "grayscale(0.45)",
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

        {/* Live indicator — green dot for members currently connected to the board */}
        {online && (
          <span
            style={{
              position: "absolute",
              bottom: -1,
              right: -1,
              width: 9,
              height: 9,
              borderRadius: "50%",
              background: "#22c55e",
              border: `2px solid ${borderColor}`,
              boxSizing: "content-box",
              pointerEvents: "none",
            }}
          />
        )}
      </motion.div>

      <AnchoredTooltip visible={visible} pos={pos} tooltipRef={tooltipRef}>
        {user.name ?? "Unknown"}
      </AnchoredTooltip>
    </>
  )
}

// ── Overflow +N badge ─────────────────────────────────────────────────────────

function OverflowBadge({
  hidden,
  onlineIds,
}: {
  hidden: PresenceUser[]
  onlineIds?: Set<string>
}) {
  const { anchorRef, tooltipRef, visible, pos, show, hide } = useAnchoredTooltip()

  return (
    <>
      <motion.div
        ref={anchorRef}
        initial={{ opacity: 0, scale: 0.5, x: -6 }}
        animate={{ opacity: 1, scale: 1, x: 0 }}
        exit={{ opacity: 0, scale: 0.5 }}
        transition={{ type: "spring", stiffness: 400, damping: 28 }}
        whileHover={{ y: 3, zIndex: 20, transition: { type: "spring", stiffness: 500, damping: 22 } }}
        onMouseEnter={show}
        onMouseLeave={hide}
        style={{
          position: "relative",
          marginLeft: -OVERLAP,
          zIndex: 0,
          flexShrink: 0,
          cursor: "default",
        }}
      >
        <div
          style={{
            width: AVATAR_SIZE,
            height: AVATAR_SIZE,
            borderRadius: "50%",
            background: "oklch(var(--color-paper-3))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "11px",
            fontWeight: 700,
            color: "oklch(var(--color-ink-2))",
            flexShrink: 0,
            boxSizing: "border-box",
            letterSpacing: "-0.01em",
            boxShadow: "0 1px 6px rgba(0,0,0,0.18)",
          }}
        >
          +{hidden.length}
        </div>
      </motion.div>

      <AnchoredTooltip visible={visible} pos={pos} tooltipRef={tooltipRef} column>
        {hidden.map((u) => {
          const isOnline = onlineIds?.has(u.userId) ?? false
          return (
            <div key={u.userId} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div
                style={{
                  position: "relative",
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: u.avatarUrl ? "transparent" : INITIALS_BG,
                  overflow: "hidden",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "7px",
                  fontWeight: 700,
                  color: "#fff",
                  filter: isOnline ? "none" : "grayscale(0.45)",
                  opacity: isOnline ? 1 : 0.8,
                }}
              >
                {u.avatarUrl ? (
                  <img src={u.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  getInitials(u.name)
                )}
              </div>
              <span style={{ flex: 1 }}>{u.name ?? "Unknown"}</span>
              {isOnline && (
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: "#22c55e",
                    flexShrink: 0,
                  }}
                />
              )}
            </div>
          )
        })}
      </AnchoredTooltip>
    </>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function BoardPresence({ users, onlineIds, maxVisible = DEFAULT_MAX_VISIBLE, coverColor }: BoardPresenceProps) {
  const borderColor = coverColor ?? "oklch(var(--color-paper))"
  if (users.length === 0) return null

  const isOnline = (id: string) => onlineIds?.has(id) ?? false

  // Online members first, then oldest members first within each group.
  const sorted = [...users].sort((a, b) => {
    const onlineDiff = (isOnline(a.userId) ? 0 : 1) - (isOnline(b.userId) ? 0 : 1)
    if (onlineDiff !== 0) return onlineDiff
    if (!a.memberSince && !b.memberSince) return 0
    if (!a.memberSince) return 1
    if (!b.memberSince) return -1
    return new Date(a.memberSince).getTime() - new Date(b.memberSince).getTime()
  })

  const visible = sorted.slice(0, maxVisible)
  const hidden = sorted.slice(maxVisible)

  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      <AnimatePresence mode="popLayout">
        {visible.map((user, i) => (
          <AvatarItem key={user.userId} user={user} index={i} borderColor={borderColor} online={isOnline(user.userId)} />
        ))}
      </AnimatePresence>

      <AnimatePresence>
        {hidden.length > 0 && (
          <OverflowBadge key="overflow" hidden={hidden} onlineIds={onlineIds} />
        )}
      </AnimatePresence>
    </div>
  )
}
