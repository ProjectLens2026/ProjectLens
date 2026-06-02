// =============================================================================
// src/lib/email/notify.ts
// =============================================================================
// Server-only utility for sending owner notifications (signup, cancel, etc.)
// via Resend. NEVER import this from client code — it reads RESEND_API_KEY.
//
// Env vars used:
//   RESEND_API_KEY       — the re_... value from resend.com
//   NOTIFY_FROM_EMAIL    — e.g. "ControlLens <notifications@control-lens.com>"
//   NOTIFY_OWNER_EMAILS  — comma-separated, e.g. "a@x.com,b@y.com"
//
// All calls are wrapped in try/catch and never throw — a Resend outage must
// never break the signup or webhook flow. Failures are logged only.
// =============================================================================

interface SendOwnerNotificationArgs {
  subject: string
  html: string
  text?: string         // optional plain-text fallback
  replyTo?: string      // optional override
}

export async function sendOwnerNotification(args: SendOwnerNotificationArgs): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.NOTIFY_FROM_EMAIL
    || 'ControlLens <notifications@control-lens.com>'
  const toList = (process.env.NOTIFY_OWNER_EMAILS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
  const replyTo = args.replyTo || 'support@control-lens.com'

  if (!apiKey) {
    console.warn('[notify] RESEND_API_KEY not set — skipping email:', args.subject)
    return false
  }
  if (toList.length === 0) {
    console.warn('[notify] NOTIFY_OWNER_EMAILS not set — skipping email:', args.subject)
    return false
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: toList,
        reply_to: replyTo,
        subject: args.subject,
        html: args.html,
        text: args.text,
      }),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error('[notify] Resend rejected email:', res.status, body)
      return false
    }

    const data = await res.json().catch(() => null)
    console.log('[notify] sent:', args.subject, data?.id || '(no id)')
    return true
  } catch (err) {
    console.error('[notify] send failed:', err)
    return false
  }
}

// -----------------------------------------------------------------------------
// HTML template — keeps every notification consistent.
// -----------------------------------------------------------------------------
export function notificationTemplate(opts: {
  headline: string
  intro: string
  rows: Array<{ label: string; value: string }>
  ctaText?: string
  ctaUrl?: string
  footer?: string
}): { html: string; text: string } {
  const rowHtml = opts.rows.map(r => `
    <tr>
      <td style="padding:8px 16px 8px 0;color:#6B7280;font-size:13px;vertical-align:top;white-space:nowrap;">${escapeHtml(r.label)}</td>
      <td style="padding:8px 0;color:#1F2937;font-size:14px;">${escapeHtml(r.value)}</td>
    </tr>
  `).join('')

  const ctaHtml = (opts.ctaText && opts.ctaUrl) ? `
    <div style="margin:24px 0 0;">
      <a href="${escapeHtml(opts.ctaUrl)}"
         style="display:inline-block;background:#2563EB;color:#fff;padding:10px 18px;border-radius:8px;font-weight:600;font-size:14px;text-decoration:none;">
        ${escapeHtml(opts.ctaText)}
      </a>
    </div>
  ` : ''

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#F1F5F9;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:24px;">
    <div style="background:#fff;border:1px solid #E2E8F0;border-radius:12px;padding:28px;">
      <div style="font-size:20px;font-weight:700;color:#1E40AF;margin-bottom:8px;">ControlLens</div>
      <div style="font-size:22px;font-weight:700;color:#1F2937;margin-bottom:12px;">${escapeHtml(opts.headline)}</div>
      <div style="font-size:14px;color:#4B5563;line-height:1.55;margin-bottom:18px;">${escapeHtml(opts.intro)}</div>
      <table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;border-top:1px solid #E2E8F0;padding-top:8px;">
        ${rowHtml}
      </table>
      ${ctaHtml}
      ${opts.footer ? `<div style="margin-top:24px;font-size:12px;color:#9CA3AF;line-height:1.5;">${escapeHtml(opts.footer)}</div>` : ''}
    </div>
    <div style="text-align:center;font-size:11px;color:#9CA3AF;margin-top:16px;">
      Sent by ControlLens · Nobel Project Management Services, LLC
    </div>
  </div>
</body></html>`

  // Plain-text fallback (for email clients that block HTML)
  const text = [
    `ControlLens — ${opts.headline}`,
    '',
    opts.intro,
    '',
    ...opts.rows.map(r => `${r.label}: ${r.value}`),
    opts.ctaUrl ? `\n${opts.ctaText}: ${opts.ctaUrl}` : '',
    opts.footer ? `\n${opts.footer}` : '',
  ].filter(Boolean).join('\n')

  return { html, text }
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
