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
import { useAnalytics } from "../hooks/useAnalytics"
import type { Priority } from "@flowgrid/types"

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

// ── Custom tooltip ────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: {
  active?: boolean
  payload?: { value: number }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div
      style={{
        background: "oklch(var(--color-paper))",
        border: "1px solid oklch(var(--color-border))",
        borderRadius: "6px",
        padding: "8px 12px",
        fontSize: "var(--text-xs)",
        color: "oklch(var(--color-ink))",
        boxShadow: "0 2px 8px oklch(0% 0 0 / 0.08)",
      }}
    >
      <span style={{ fontWeight: 600 }}>{label}</span>
      <span style={{ marginLeft: "8px", color: "oklch(var(--color-accent))" }}>{payload[0].value}</span>
    </div>
  )
}

// ── Donut chart (SVG) ─────────────────────────────────────────────────────────

function DonutChart({ data }: { data: { label: string; count: number; color: string }[] }) {
  const total = data.reduce((acc, d) => acc + d.count, 0)
  const r = 52
  const circ = 2 * Math.PI * r
  const cx = 70
  const cy = 70

  let cumulative = 0
  const segments = data
    .filter((d) => d.count > 0)
    .map((d) => {
      const pct = d.count / total
      const dash = pct * circ
      const offset = circ - cumulative * circ
      cumulative += pct
      return { ...d, dash, offset }
    })

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "24px", flexWrap: "wrap" }}>
      <svg width="140" height="140" style={{ flexShrink: 0 }}>
        {/* background ring */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="oklch(var(--color-paper-3))" strokeWidth="16" />
        {segments.map((seg, i) => (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth="16"
            strokeDasharray={`${seg.dash} ${circ - seg.dash}`}
            strokeDashoffset={seg.offset}
            transform={`rotate(-90 ${cx} ${cy})`}
            strokeLinecap="butt"
          />
        ))}
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize="20" fontWeight="700" fill="oklch(var(--color-ink))">
          {total}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" fontSize="10" fill="oklch(var(--color-ink-3))">
          cards
        </text>
      </svg>
      {/* Legend */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {data.map((d) => (
          <div key={d.label} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: d.color, flexShrink: 0 }} />
            <span style={{ fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-2))", minWidth: 52 }}>{d.label}</span>
            <span style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "oklch(var(--color-ink))", fontVariantNumeric: "tabular-nums" }}>{d.count}</span>
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
  const { data, isLoading, isError } = useAnalytics(workspaceId)

  function handleExport() {
    if (!data) return
    const rows: string[] = [
      "Metric,Value,Trend%",
      `Total Cards,${data.totals.totalCards},${data.totals.cardsTrendPct}`,
      `Total Boards,${data.totals.totalBoards},${data.totals.boardsTrendPct}`,
      `Total Members,${data.totals.totalMembers},${data.totals.membersTrendPct}`,
      `Activities (30d),${data.totals.totalActivities},${data.totals.activitiesTrendPct}`,
      "",
      "Member,Actions",
      ...data.topMembers.map((m) => `${m.name ?? "Unknown"},${m.count}`),
    ]
    const csv = rows.join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "analytics.csv"
    a.click()
    URL.revokeObjectURL(url)
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
  const hasActivityData = data.activityOverTime.length > 0
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

  const activityChartData = data.activityOverTime.map((r) => ({
    name: r.date.slice(5),
    count: r.count,
  }))

  return (
    <div style={{ padding: "32px 40px", maxWidth: "1100px", display: "flex", flexDirection: "column", gap: "28px", fontFamily: "var(--font-body)" }}>

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
            <option>Last 30 Days</option>
            <option>Last 7 Days</option>
            <option>Last 90 Days</option>
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

      {/* Charts grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: "16px" }}>

        {/* Cards by priority — donut */}
        <ChartCard title="Cards by Priority" isEmpty={!hasPriorityData} emptyMsg="No cards yet — create some to see priority breakdown.">
          <DonutChart data={hasPriorityData ? donutData : fullDonutLegend} />
        </ChartCard>

        {/* Cards by board */}
        <ChartCard title="Cards by Board" isEmpty={!hasBoardData} emptyMsg="No cards yet — add cards to your boards.">
          <ResponsiveContainer width="100%" height={200}>
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

        {/* Activity over time — full width */}
        <div style={{ gridColumn: "1 / -1" }}>
          <ChartCard title="Activity Over Time" isEmpty={!hasActivityData} emptyMsg="Activity Over Time — No activity recorded in the last 30 days.">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={activityChartData} barCategoryGap="20%">
                <CartesianGrid vertical={false} stroke="oklch(var(--color-border))" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: TICK_COLOR }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11, fill: TICK_COLOR }} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "oklch(var(--color-paper-3))" }} />
                <Bar dataKey="count" radius={[3, 3, 0, 0]} fill="oklch(var(--color-accent))" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
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
                  <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-3))" }}>
                    Member
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
