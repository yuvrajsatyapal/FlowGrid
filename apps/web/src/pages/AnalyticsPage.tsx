import { useState } from "react"
import { useParams, Link } from "react-router-dom"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import * as XLSX from "xlsx"
import { useAnalytics } from "../hooks/useAnalytics"
import type { Priority } from "@flowgrid/types"

const PERIOD_OPTIONS = [
  { label: "Last 7 Days", days: 7 },
  { label: "Last 30 Days", days: 30 },
  { label: "Last 90 Days", days: 90 },
]

const TICK_COLOR = "oklch(72% 0.010 250)"

const PRIORITY_COLOR: Record<Priority, string> = {
  NONE:   "oklch(72% 0.008 250)",
  LOW:    "oklch(60% 0.16 155)",
  MEDIUM: "oklch(72% 0.18 70)",
  HIGH:   "oklch(60% 0.22 30)",
  URGENT: "oklch(55% 0.25 25)",
}

const PRIORITY_LABEL: Record<Priority, string> = {
  NONE:   "None",
  LOW:    "Low",
  MEDIUM: "Medium",
  HIGH:   "High",
  URGENT: "Urgent",
}

// ── Icons ─────────────────────────────────────────────────────────────────────

const CLOCK_ICON = (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.1" />
    <path d="M6 3.5V6l1.5 1.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const DOWNLOAD_ICON = (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
    <path d="M6.5 2v6M4 6l2.5 2.5L9 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2 10h9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
)

const CHART_UP_ICON = (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <path d="M4 24l7-8 5 4 6-8 6 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

function StatIcon({ type }: { type: "cards" | "boards" | "members" | "activities" }) {
  if (type === "cards") return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1" y="3" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.25" />
      <line x1="4" y1="7" x2="12" y2="7" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <line x1="4" y1="10" x2="9" y2="10" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  )
  if (type === "boards") return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="6" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
      <rect x="9" y="1" width="6" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
      <rect x="9" y="11" width="6" height="4" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  )
  if (type === "members") return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="5.5" cy="5" r="2.25" stroke="currentColor" strokeWidth="1.1" />
      <path d="M1 13c0-2.49 2.01-4.5 4.5-4.5S10 10.51 10 13" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <circle cx="12" cy="5" r="1.5" stroke="currentColor" strokeWidth="1.1" />
      <path d="M14 12c0-1.24-.8-2.3-1.9-2.66" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  )
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2 12l4-5 3 3 3-4 3 3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── Trend indicator ────────────────────────────────────────────────────────────

function Trend({ pct }: { pct: number }) {
  const color = pct > 0 ? "oklch(var(--color-success))" : pct < 0 ? "oklch(var(--color-error))" : "oklch(var(--color-ink-3))"
  const arrow = pct > 0 ? "↗" : pct < 0 ? "↘" : "→"
  return (
    <span style={{ fontSize: "var(--text-xs)", color, fontWeight: 500, marginTop: "4px", display: "flex", alignItems: "center", gap: "2px" }}>
      {arrow} {pct > 0 ? "+" : ""}{pct}% vs last period
    </span>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, trendPct, iconType }: {
  label: string
  value: number
  trendPct: number
  iconType: "cards" | "boards" | "members" | "activities"
}) {
  return (
    <div
      style={{
        background: "oklch(var(--color-paper-2))",
        border: "1px solid oklch(var(--color-border))",
        borderRadius: "var(--radius-card)",
        padding: "20px 24px",
        display: "flex",
        flexDirection: "column",
        gap: "4px",
        position: "relative",
      }}
    >
      <div style={{ position: "absolute", top: "16px", right: "16px", color: "oklch(var(--color-ink-3))" }}>
        <StatIcon type={iconType} />
      </div>
      <span
        style={{
          fontSize: "0.6875rem",
          color: "oklch(var(--color-ink-3))",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          fontWeight: 700,
          fontFamily: "var(--font-body)",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: "var(--text-3xl)",
          fontWeight: 700,
          color: "oklch(var(--color-ink))",
          lineHeight: 1.1,
          fontFamily: "var(--font-display)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value.toLocaleString()}
      </span>
      <Trend pct={trendPct} />
    </div>
  )
}

// ── Chart card wrapper ────────────────────────────────────────────────────────

function ChartCard({ title, children, isEmpty, emptyMsg, action }: {
  title: string
  children: React.ReactNode
  isEmpty?: boolean
  emptyMsg?: string
  action?: React.ReactNode
}) {
  return (
    <div
      style={{
        background: "oklch(var(--color-paper-2))",
        border: "1px solid oklch(var(--color-border))",
        borderRadius: "var(--radius-card)",
        padding: "20px 24px",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "oklch(var(--color-ink))" }}>
          {title}
        </span>
        {action}
      </div>
      {isEmpty ? (
        <div
          style={{
            height: "180px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "12px",
            color: "oklch(var(--color-ink-3))",
          }}
        >
          <div style={{ opacity: 0.35 }}>{CHART_UP_ICON}</div>
          <span style={{ fontSize: "var(--text-sm)" }}>{emptyMsg ?? "No data yet"}</span>
          {emptyMsg?.includes("Activity") && (
            <button
              style={{
                padding: "5px 12px",
                borderRadius: "var(--radius-button)",
                border: "1px solid oklch(var(--color-border))",
                background: "transparent",
                color: "oklch(var(--color-ink-2))",
                fontSize: "var(--text-xs)",
                cursor: "pointer",
                fontFamily: "var(--font-body)",
                letterSpacing: "0.05em",
              }}
            >
              VIEW RAW LOGS
            </button>
          )}
        </div>
      ) : (
        children
      )}
    </div>
  )
}

// ── Donut chart (SVG) ─────────────────────────────────────────────────────────

function polarToXY(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const clamped = Math.min(endDeg - startDeg, 359.99)
  const end = endDeg === startDeg + 360 ? startDeg + 359.99 : endDeg
  const s = polarToXY(cx, cy, r, startDeg)
  const e = polarToXY(cx, cy, r, end)
  const large = clamped > 180 ? 1 : 0
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`
}

function DonutChart({ data }: { data: { label: string; count: number; color: string }[] }) {
  const [tooltip, setTooltip] = useState<{ label: string; count: number; color: string; x: number; y: number } | null>(null)
  const [hovered, setHovered] = useState<number | null>(null)

  const total = data.reduce((acc, d) => acc + d.count, 0)
  const r = 100
  const cx = 126
  const cy = 126
  const sw = 24

  let cumDeg = 0
  const segments = data
    .filter((d) => d.count > 0)
    .map((d, i) => {
      const startDeg = cumDeg
      const spanDeg = (d.count / total) * 360
      cumDeg += spanDeg
      return { ...d, startDeg, endDeg: cumDeg, i }
    })

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "20px", width: "100%", padding: "8px 0", position: "relative" }}>
      <svg width="252" height="252" style={{ flexShrink: 0, overflow: "visible" }}>
        {/* Background ring */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="oklch(var(--color-paper-3))" strokeWidth={sw} />
        {segments.map((seg) => {
          const isHov = hovered === seg.i
          return (
            <path
              key={seg.i}
              d={arcPath(cx, cy, r, seg.startDeg, seg.endDeg)}
              fill="none"
              stroke={seg.color}
              strokeWidth={isHov ? sw + 6 : sw}
              strokeLinecap="butt"
              style={{ cursor: "pointer", transition: "stroke-width 0.15s ease" }}
              onMouseEnter={(e) => {
                setHovered(seg.i)
                setTooltip({ label: seg.label, count: seg.count, color: seg.color, x: e.clientX, y: e.clientY })
              }}
              onMouseMove={(e) => setTooltip((t) => t ? { ...t, x: e.clientX, y: e.clientY } : null)}
              onMouseLeave={() => { setHovered(null); setTooltip(null) }}
            />
          )
        })}
        <text x={cx} y={cy - 8} textAnchor="middle" fontSize="30" fontWeight="700" fill="oklch(var(--color-ink))" style={{ pointerEvents: "none" }}>
          {total}
        </text>
        <text x={cx} y={cy + 16} textAnchor="middle" fontSize="12" fill="oklch(var(--color-ink-3))" style={{ pointerEvents: "none" }}>
          cards
        </text>
      </svg>

      {/* Floating tooltip */}
      {tooltip && (
        <div style={{
          position: "fixed",
          left: tooltip.x + 14,
          top: tooltip.y - 36,
          background: "oklch(var(--color-paper))",
          border: "1px solid oklch(var(--color-border))",
          borderRadius: "8px",
          padding: "6px 12px",
          boxShadow: "0 4px 12px oklch(0% 0 0 / 0.12)",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          fontSize: "var(--text-xs)",
          fontFamily: "var(--font-body)",
          pointerEvents: "none",
          zIndex: 9999,
          whiteSpace: "nowrap",
        }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: tooltip.color, flexShrink: 0 }} />
          <span style={{ color: "oklch(var(--color-ink-2))" }}>{tooltip.label}</span>
          <span style={{ fontWeight: 700, color: "oklch(var(--color-ink))" }}>{tooltip.count}</span>
        </div>
      )}

      {/* Legend */}
      <div style={{ display: "flex", flexDirection: "column", gap: "10px", width: "100%" }}>
        {data.map((d) => (
          <div key={d.label} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: 9, height: 9, borderRadius: "50%", background: d.color, flexShrink: 0 }} />
            <span style={{ fontSize: "var(--text-sm)", color: "oklch(var(--color-ink-2))", flex: 1 }}>{d.label}</span>
            <span style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "oklch(var(--color-ink))", fontVariantNumeric: "tabular-nums" }}>{d.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({ name, avatarUrl, size = 32 }: { name: string | null; avatarUrl: string | null; size?: number }) {
  if (avatarUrl) {
    return (
      <img src={avatarUrl} alt={name ?? "Member"} width={size} height={size}
        style={{ borderRadius: "var(--radius-card)", objectFit: "cover", flexShrink: 0 }} />
    )
  }
  const initials = name ? name.slice(0, 2).toUpperCase() : "?"
  return (
    <div
      style={{
        width: size, height: size,
        borderRadius: "var(--radius-card)",
        background: "oklch(var(--color-accent-muted))",
        color: "oklch(var(--color-accent))",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "11px", fontWeight: 700, flexShrink: 0,
      }}
    >
      {initials}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const [days, setDays] = useState(30)
  const { data, isLoading, isError } = useAnalytics(workspaceId, days)

  function handleExport() {
    if (!data) return
    const wb = XLSX.utils.book_new()

    const summarySheet = XLSX.utils.aoa_to_sheet([
      ["Metric", "Value", "Trend %"],
      ["Total Cards", data.totals.totalCards, data.totals.cardsTrendPct],
      ["Total Boards", data.totals.totalBoards, data.totals.boardsTrendPct],
      ["Total Members", data.totals.totalMembers, data.totals.membersTrendPct],
      ["Activities", data.totals.totalActivities, data.totals.activitiesTrendPct],
    ])
    XLSX.utils.book_append_sheet(wb, summarySheet, "Summary")

    const prioritySheet = XLSX.utils.aoa_to_sheet([
      ["Priority", "Count"],
      ...data.cardsByPriority.map((r) => [PRIORITY_LABEL[r.priority], r.count]),
    ])
    XLSX.utils.book_append_sheet(wb, prioritySheet, "Cards by Priority")

    const boardSheet = XLSX.utils.aoa_to_sheet([
      ["Board", "Cards"],
      ...data.cardsByBoard.map((r) => [r.boardName, r.count]),
    ])
    XLSX.utils.book_append_sheet(wb, boardSheet, "Cards by Board")

    const membersSheet = XLSX.utils.aoa_to_sheet([
      ["Member", "Actions"],
      ...data.topMembers.map((m) => [m.name ?? "Unknown", m.count]),
    ])
    XLSX.utils.book_append_sheet(wb, membersSheet, "Top Contributors")

    XLSX.writeFile(wb, `analytics-${days}d.xlsx`)
  }

  if (isLoading) {
    return (
      <div style={{ padding: "40px", display: "flex", alignItems: "center", justifyContent: "center", color: "oklch(var(--color-ink-2))", fontSize: "var(--text-sm)" }}>
        <span className="animate-pulse">Loading analytics…</span>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div style={{ padding: "40px", display: "flex", alignItems: "center", justifyContent: "center", color: "oklch(var(--color-error))", fontSize: "var(--text-sm)" }}>
        Failed to load analytics. Please try again.
      </div>
    )
  }

  const hasPriorityData = data.cardsByPriority.some((r) => r.count > 0)
  const hasBoardData = data.cardsByBoard.some((r) => r.count > 0)
  const hasMembers = data.topMembers.length > 0

  const donutData = data.cardsByPriority
    .filter((r) => r.count > 0)
    .map((r) => ({
      label: PRIORITY_LABEL[r.priority],
      count: r.count,
      color: PRIORITY_COLOR[r.priority],
    }))
  // Show all priorities in legend even if 0
  const fullDonutLegend = data.cardsByPriority.map((r) => ({
    label: PRIORITY_LABEL[r.priority],
    count: r.count,
    color: PRIORITY_COLOR[r.priority],
  }))

  const boardChartData = data.cardsByBoard.map((r) => ({
    name: r.boardName.length > 14 ? r.boardName.slice(0, 13) + "…" : r.boardName,
    fullName: r.boardName,
    count: r.count,
  }))

  return (
    <div style={{ padding: "32px 40px", display: "flex", flexDirection: "column", gap: "28px", fontFamily: "var(--font-body)" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
        <div>
          <p
            style={{
              margin: 0,
              fontSize: "0.625rem",
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "oklch(var(--color-accent))",
              fontFamily: "var(--font-body)",
              marginBottom: "6px",
            }}
          >
            Workspace Overview
          </p>
          <h1
            style={{
              fontSize: "var(--text-2xl)",
              fontWeight: 700,
              color: "oklch(var(--color-ink))",
              margin: 0,
              fontFamily: "var(--font-display)",
              letterSpacing: "var(--display-tracking)",
            }}
          >
            Analytics
          </h1>
        </div>

        {/* Right cluster */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0, flexWrap: "wrap" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-3))" }}>
            {CLOCK_ICON} Last updated: Just now
          </span>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            style={{
              padding: "6px 10px",
              borderRadius: "var(--radius-input)",
              border: "1px solid oklch(var(--color-border))",
              background: "oklch(var(--color-paper-2))",
              color: "oklch(var(--color-ink-2))",
              fontSize: "var(--text-sm)",
              cursor: "pointer",
              fontFamily: "var(--font-body)",
              outline: "none",
            }}
          >
            {PERIOD_OPTIONS.map((o) => (
              <option key={o.days} value={o.days}>{o.label}</option>
            ))}
          </select>
          <button
            onClick={handleExport}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "7px 14px",
              borderRadius: "var(--radius-button)",
              border: "none",
              background: "oklch(var(--color-accent))",
              color: "#fff",
              fontSize: "var(--text-sm)",
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "var(--font-body)",
            }}
          >
            {DOWNLOAD_ICON}
            Export
          </button>
        </div>
      </div>

      {/* Totals row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
        <StatCard label="Total Cards" value={data.totals.totalCards} trendPct={data.totals.cardsTrendPct} iconType="cards" />
        <StatCard label="Boards" value={data.totals.totalBoards} trendPct={data.totals.boardsTrendPct} iconType="boards" />
        <StatCard label="Members" value={data.totals.totalMembers} trendPct={data.totals.membersTrendPct} iconType="members" />
        <StatCard label="Activities" value={data.totals.totalActivities} trendPct={data.totals.activitiesTrendPct} iconType="activities" />
      </div>

      {/* Charts grid — priority narrower, board wider */}
      <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: "16px" }}>

        {/* Cards by priority — donut */}
        <ChartCard title="Cards by Priority" isEmpty={!hasPriorityData} emptyMsg="No cards yet — create some to see priority breakdown.">
          <DonutChart data={hasPriorityData ? donutData : fullDonutLegend} />
        </ChartCard>

        {/* Cards by board */}
        <ChartCard title="Cards by Board" isEmpty={!hasBoardData} emptyMsg="No cards yet — add cards to your boards.">
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={boardChartData} barCategoryGap="30%">
              <CartesianGrid vertical={false} stroke="oklch(var(--color-border))" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: TICK_COLOR }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: TICK_COLOR }} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0].payload as { fullName: string; count: number }
                  return (
                    <div style={{ background: "oklch(var(--color-paper))", border: "1px solid oklch(var(--color-border))", borderRadius: "6px", padding: "8px 12px", fontSize: "var(--text-xs)", color: "oklch(var(--color-ink))", boxShadow: "0 2px 8px oklch(0% 0 0 / 0.08)" }}>
                      <span style={{ fontWeight: 600 }}>{d.fullName}</span>
                      <span style={{ marginLeft: "8px", color: "oklch(var(--color-accent))" }}>{d.count}</span>
                    </div>
                  )
                }}
                cursor={{ fill: "oklch(var(--color-paper-3))" }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} fill="oklch(var(--color-accent))" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Team Insights / Top Contributors */}
      <div
        style={{
          background: "oklch(var(--color-paper-2))",
          border: "1px solid oklch(var(--color-border))",
          borderRadius: "var(--radius-card)",
          padding: "20px 24px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "oklch(var(--color-ink))" }}>
            Team Insights
          </span>
          <span
            style={{
              fontSize: "0.625rem",
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "oklch(var(--color-ink-3))",
            }}
          >
            Top Contributors
          </span>
        </div>

        {!hasMembers ? (
          <div style={{ padding: "20px 0", fontSize: "var(--text-sm)", color: "oklch(var(--color-ink-3))", textAlign: "center" }}>
            No activity recorded yet.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {data.topMembers.map((m) => (
              <div
                key={m.userId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "10px 12px",
                  borderRadius: "var(--radius-card)",
                  transition: "background var(--dur-fast)",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "oklch(var(--color-paper-3))" }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent" }}
              >
                <Avatar name={m.name} avatarUrl={m.avatarUrl} size={32} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: 500, color: "oklch(var(--color-ink))", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {m.name ?? "Unknown"}
                  </p>
                  <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-3))", textTransform: "capitalize" }}>
                    {m.role.charAt(0) + m.role.slice(1).toLowerCase()}
                  </p>
                </div>
                <span style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "oklch(var(--color-ink-2))", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                  {m.count.toLocaleString()} Actions
                </span>
              </div>
            ))}

            {/* Invite Member tile */}
            <Link
              to={`/${workspaceId}/members`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "10px 12px",
                borderRadius: "var(--radius-card)",
                border: "1px dashed oklch(var(--color-border))",
                marginTop: "8px",
                textDecoration: "none",
                color: "oklch(var(--color-ink-3))",
                transition: "color var(--dur-fast), border-color var(--dur-fast)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.color = "oklch(var(--color-accent))"
                ;(e.currentTarget as HTMLAnchorElement).style.borderColor = "oklch(var(--color-accent))"
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.color = "oklch(var(--color-ink-3))"
                ;(e.currentTarget as HTMLAnchorElement).style.borderColor = "oklch(var(--color-border))"
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "var(--radius-card)",
                  border: "1px dashed currentColor",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "18px",
                  flexShrink: 0,
                }}
              >
                +
              </div>
              <span style={{ fontSize: "var(--text-sm)", fontWeight: 500 }}>Invite Member</span>
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
