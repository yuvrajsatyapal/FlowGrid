import { useParams } from "react-router-dom"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts"
import { useAnalytics } from "../hooks/useAnalytics"
import type { Priority } from "@flowgrid/types"

// ── Priority colours — consistent with card priority dots ──────────────────────

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

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        background: "oklch(var(--color-paper-2))",
        border: "1px solid oklch(var(--color-border))",
        borderRadius: "10px",
        padding: "20px 24px",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
      }}
    >
      <span
        style={{
          fontSize: "var(--text-xs)",
          color: "oklch(var(--color-ink-3))",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          fontWeight: 500,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: "28px",
          fontWeight: 700,
          color: "oklch(var(--color-ink))",
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value.toLocaleString()}
      </span>
    </div>
  )
}

// ── Chart card wrapper ────────────────────────────────────────────────────────

function ChartCard({ title, children, isEmpty, emptyMsg }: {
  title: string
  children: React.ReactNode
  isEmpty?: boolean
  emptyMsg?: string
}) {
  return (
    <div
      style={{
        background: "oklch(var(--color-paper-2))",
        border: "1px solid oklch(var(--color-border))",
        borderRadius: "10px",
        padding: "20px 24px",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
      }}
    >
      <span
        style={{
          fontSize: "var(--text-sm)",
          fontWeight: 600,
          color: "oklch(var(--color-ink))",
        }}
      >
        {title}
      </span>
      {isEmpty ? (
        <div
          style={{
            height: "180px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "oklch(var(--color-ink-3))",
            fontSize: "var(--text-sm)",
          }}
        >
          {emptyMsg ?? "No data yet"}
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
      <span style={{ marginLeft: "8px", color: "oklch(var(--color-accent))" }}>
        {payload[0].value}
      </span>
    </div>
  )
}

// ── Top members list ──────────────────────────────────────────────────────────

function Avatar({ name, avatarUrl, size = 28 }: { name: string | null; avatarUrl: string | null; size?: number }) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name ?? "Member"}
        width={size}
        height={size}
        style={{ borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
      />
    )
  }
  const initials = name ? name.slice(0, 2).toUpperCase() : "?"
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "oklch(var(--color-accent-muted))",
        color: "oklch(var(--color-accent))",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "11px",
        fontWeight: 600,
        flexShrink: 0,
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

  if (isLoading) {
    return (
      <div
        style={{
          padding: "40px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "oklch(var(--color-ink-2))",
          fontSize: "var(--text-sm)",
        }}
      >
        <span className="animate-pulse">Loading analytics…</span>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div
        style={{
          padding: "40px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "oklch(var(--color-error))",
          fontSize: "var(--text-sm)",
        }}
      >
        Failed to load analytics. Please try again.
      </div>
    )
  }

  const hasPriorityData = data.cardsByPriority.some((r) => r.count > 0)
  const hasBoardData = data.cardsByBoard.some((r) => r.count > 0)
  const hasActivityData = data.activityOverTime.length > 0
  const hasMembers = data.topMembers.length > 0

  const priorityChartData = data.cardsByPriority.map((r) => ({
    name: PRIORITY_LABEL[r.priority],
    count: r.count,
    priority: r.priority,
  }))

  const boardChartData = data.cardsByBoard.map((r) => ({
    name: r.boardName.length > 14 ? r.boardName.slice(0, 13) + "…" : r.boardName,
    fullName: r.boardName,
    count: r.count,
  }))

  const activityChartData = data.activityOverTime.map((r) => ({
    name: r.date.slice(5), // "MM-DD"
    count: r.count,
  }))

  return (
    <div
      style={{
        padding: "32px 40px",
        maxWidth: "1100px",
        display: "flex",
        flexDirection: "column",
        gap: "28px",
      }}
    >
      {/* Header */}
      <div>
        <h1
          style={{
            fontSize: "var(--text-xl)",
            fontWeight: 700,
            color: "oklch(var(--color-ink))",
            margin: 0,
          }}
        >
          Analytics
        </h1>
        <p
          style={{
            fontSize: "var(--text-sm)",
            color: "oklch(var(--color-ink-3))",
            marginTop: "4px",
          }}
        >
          Workspace overview · last 30 days
        </p>
      </div>

      {/* Totals row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: "12px",
        }}
      >
        <StatCard label="Total Cards" value={data.totals.totalCards} />
        <StatCard label="Boards" value={data.totals.totalBoards} />
        <StatCard label="Members" value={data.totals.totalMembers} />
        <StatCard label="Activities (30d)" value={data.totals.totalActivities} />
      </div>

      {/* Charts grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>

        {/* Cards by priority */}
        <ChartCard title="Cards by Priority" isEmpty={!hasPriorityData} emptyMsg="No cards yet — create some to see priority breakdown.">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={priorityChartData} barCategoryGap="30%">
              <CartesianGrid vertical={false} stroke="oklch(var(--color-border))" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: "oklch(72% 0.010 250)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "oklch(72% 0.010 250)" }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                width={28}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "oklch(var(--color-paper-3))" }} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {priorityChartData.map((entry) => (
                  <Cell key={entry.priority} fill={PRIORITY_COLOR[entry.priority]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Cards by board */}
        <ChartCard title="Cards by Board" isEmpty={!hasBoardData} emptyMsg="No cards yet — add cards to your boards.">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={boardChartData} barCategoryGap="30%">
              <CartesianGrid vertical={false} stroke="oklch(var(--color-border))" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10, fill: "oklch(72% 0.010 250)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "oklch(72% 0.010 250)" }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                width={28}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0].payload as { fullName: string; count: number }
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
                      <span style={{ fontWeight: 600 }}>{d.fullName}</span>
                      <span style={{ marginLeft: "8px", color: "oklch(var(--color-accent))" }}>
                        {d.count}
                      </span>
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
          <ChartCard
            title="Activity Over Time (last 30 days)"
            isEmpty={!hasActivityData}
            emptyMsg="No activity recorded in the last 30 days."
          >
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={activityChartData} barCategoryGap="20%">
                <CartesianGrid vertical={false} stroke="oklch(var(--color-border))" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: "oklch(72% 0.010 250)" }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "oklch(72% 0.010 250)" }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                  width={28}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "oklch(var(--color-paper-3))" }} />
                <Bar dataKey="count" radius={[3, 3, 0, 0]} fill="oklch(52% 0.22 260 / 0.7)" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </div>

      {/* Top members */}
      <ChartCard
        title="Most Active Members (last 30 days)"
        isEmpty={!hasMembers}
        emptyMsg="No activity recorded yet."
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {data.topMembers.map((m, i) => {
            const max = data.topMembers[0]?.count ?? 1
            const pct = Math.round((m.count / max) * 100)
            return (
              <div
                key={m.userId}
                style={{ display: "flex", alignItems: "center", gap: "12px" }}
              >
                <span
                  style={{
                    fontSize: "var(--text-xs)",
                    color: "oklch(var(--color-ink-3))",
                    width: "16px",
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {i + 1}
                </span>
                <Avatar name={m.name} avatarUrl={m.avatarUrl} size={28} />
                <span
                  style={{
                    fontSize: "var(--text-sm)",
                    color: "oklch(var(--color-ink))",
                    width: "160px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {m.name ?? "Unknown"}
                </span>
                {/* Progress bar */}
                <div
                  style={{
                    flex: 1,
                    height: "6px",
                    background: "oklch(var(--color-paper-3))",
                    borderRadius: "3px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${pct}%`,
                      height: "100%",
                      background: "oklch(var(--color-accent))",
                      borderRadius: "3px",
                      transition: "width 0.3s ease",
                    }}
                  />
                </div>
                <span
                  style={{
                    fontSize: "var(--text-xs)",
                    color: "oklch(var(--color-ink-2))",
                    fontVariantNumeric: "tabular-nums",
                    width: "40px",
                    textAlign: "right",
                  }}
                >
                  {m.count.toLocaleString()}
                </span>
              </div>
            )
          })}
        </div>
      </ChartCard>
    </div>
  )
}
