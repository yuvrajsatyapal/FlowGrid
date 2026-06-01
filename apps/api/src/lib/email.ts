import { Resend } from "resend"
import { env } from "../config/env"
import logger from "./logger"

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  MEMBER: "Member",
  VIEWER: "Viewer",
}

interface InviteEmailParams {
  to: string
  inviterName: string
  workspaceName: string
  role: string
  inviteUrl: string
}

export async function sendInviteEmail({ to, inviterName, workspaceName, role, inviteUrl }: InviteEmailParams): Promise<void> {
  if (!resend) {
    logger.warn("RESEND_API_KEY not set — skipping invite email", { to })
    return
  }

  const roleLabel = ROLE_LABELS[role] ?? role

  try {
    await resend.emails.send({
      from: "FlowGrid <invites@flowgrid.app>",
      to,
      subject: `${inviterName} invited you to ${workspaceName} on FlowGrid`,
      text: [
        `Hi there,`,
        ``,
        `${inviterName} has invited you to join the "${workspaceName}" workspace on FlowGrid as a ${roleLabel}.`,
        ``,
        `Accept your invitation:`,
        inviteUrl,
        ``,
        `This invite expires in 7 days. If you weren't expecting this, you can safely ignore it.`,
        ``,
        `— The FlowGrid team`,
      ].join("\n"),
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#111">
          <p>Hi there,</p>
          <p><strong>${escapeHtml(inviterName)}</strong> has invited you to join the
            <strong>${escapeHtml(workspaceName)}</strong> workspace on FlowGrid as a
            <strong>${escapeHtml(roleLabel)}</strong>.</p>
          <p style="margin:24px 0">
            <a href="${escapeHtml(inviteUrl)}"
               style="background:#6366f1;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:500">
              Accept invitation
            </a>
          </p>
          <p style="color:#666;font-size:14px">
            This invite expires in 7 days. If you weren't expecting this, you can safely ignore it.
          </p>
        </div>
      `,
    })
  } catch (err) {
    logger.warn("Failed to send invite email", { to, error: err instanceof Error ? err.message : err })
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}
