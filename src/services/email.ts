/**
 * Email service using Resend API
 * Reads configuration from environment variables:
 * - RESEND_API_KEY: Resend API key (optional; gracefully skips if missing)
 * - RESEND_FROM_EMAIL: From address, e.g. "Drizby <noreply@notifications.yourdomain.com>"
 * - APP_URL: Instance URL, e.g. "https://bi.example.com"
 * - APP_NAME: Instance display name, defaults to "Drizby"
 */

export function getAppUrl(): string {
  return process.env.APP_URL || 'http://localhost:3460'
}

export function getAppName(): string {
  return process.env.APP_NAME || 'Drizby'
}

/** Log email configuration on startup */
export function logEmailConfig(): void {
  if (process.env.RESEND_API_KEY) {
    const from = process.env.RESEND_FROM_EMAIL || `${getAppName()} <noreply@example.com>`
    console.log(`Resend email configured — from: ${from}, appName: ${getAppName()}, appUrl: ${getAppUrl()}`)
  } else {
    console.log('Resend email not configured (RESEND_API_KEY not set) — emails will be skipped')
  }
}

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('RESEND_API_KEY not configured — skipping email to', to)
    return false
  }

  const from = process.env.RESEND_FROM_EMAIL || `${getAppName()} <noreply@example.com>`

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, html }),
    })

    if (!res.ok) {
      const body = await res.text()
      console.error('Resend API error:', res.status, body)
      return false
    }

    return true
  } catch (err) {
    console.error('Failed to send email:', err)
    return false
  }
}

// ---------------------------------------------------------------------------
// Shared layout wrapper
// ---------------------------------------------------------------------------

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 512 512" fill="none" style="vertical-align:middle;margin-right:8px;"><path d="M256 48L48 176v160l208 128 208-128V176L256 48z" stroke="#6366f1" stroke-width="48" stroke-linejoin="round" fill="none"/><path d="M48 176l208 128 208-128" stroke="#6366f1" stroke-width="48" stroke-linejoin="round" fill="none"/><path d="M256 304v160" stroke="#6366f1" stroke-width="48" fill="none"/><path d="M400 368l32-20-32-20-32 20 32 20z" fill="#6366f1"/><path d="M400 340l-20-32 20-32 20 32-20 32z" fill="#6366f1"/></svg>`

function emailLayout(content: string, appName: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f172a;padding:40px 20px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#1e293b;border-radius:12px;overflow:hidden;">
<tr><td style="padding:32px 32px 0;text-align:center;">
<h1 style="margin:0;font-size:20px;font-weight:700;color:#6366f1;">${LOGO_SVG}${appName}</h1>
</td></tr>
<tr><td style="padding:24px 32px 32px;color:#e2e8f0;font-size:14px;line-height:1.6;">
${content}
</td></tr>
<tr><td style="padding:16px 32px;border-top:1px solid #334155;text-align:center;">
<p style="margin:0;font-size:12px;color:#64748b;">Sent by ${appName}</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}

function button(text: string, url: string): string {
  return `<table cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td>
<a href="${url}" style="display:inline-block;padding:10px 24px;background-color:#6366f1;color:#ffffff;font-weight:600;font-size:14px;text-decoration:none;border-radius:6px;">${text}</a>
</td></tr></table>`
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export function createWelcomeEmailTemplate(userName: string, appName: string, loginUrl: string): string {
  return emailLayout(`
<h2 style="margin:0 0 16px;font-size:18px;color:#f1f5f9;">Welcome to ${appName}!</h2>
<p style="margin:0 0 8px;">Hi ${userName},</p>
<p style="margin:0 0 16px;">Your account has been created. You can sign in to start exploring your data.</p>
${button('Sign In', loginUrl)}
<p style="margin:0;color:#94a3b8;font-size:13px;">If you didn't create this account, you can ignore this email.</p>
`, appName)
}

export function createNewUserNotificationTemplate(
  userName: string,
  userEmail: string,
  appName: string,
  usersUrl: string
): string {
  return emailLayout(`
<h2 style="margin:0 0 16px;font-size:18px;color:#f1f5f9;">New User Registered</h2>
<p style="margin:0 0 8px;">A new user has registered on ${appName}:</p>
<table style="margin:16px 0;width:100%;" cellpadding="0" cellspacing="0">
<tr><td style="padding:8px 12px;background-color:#334155;border-radius:6px 6px 0 0;color:#94a3b8;font-size:13px;">Name</td><td style="padding:8px 12px;background-color:#334155;border-radius:6px 6px 0 0;color:#f1f5f9;font-size:13px;">${userName}</td></tr>
<tr><td style="padding:8px 12px;background-color:#2d3a4f;border-radius:0 0 6px 6px;color:#94a3b8;font-size:13px;">Email</td><td style="padding:8px 12px;background-color:#2d3a4f;border-radius:0 0 6px 6px;color:#f1f5f9;font-size:13px;">${userEmail}</td></tr>
</table>
${button('Manage Users', usersUrl)}
`, appName)
}

export function createPasswordChangedEmailTemplate(userName: string, appName: string): string {
  return emailLayout(`
<h2 style="margin:0 0 16px;font-size:18px;color:#f1f5f9;">Password Changed</h2>
<p style="margin:0 0 8px;">Hi ${userName},</p>
<p style="margin:0 0 16px;">Your password on ${appName} has been changed successfully.</p>
<p style="margin:0;color:#94a3b8;font-size:13px;">If you didn't make this change, please contact your administrator immediately.</p>
`, appName)
}

export function createPasswordResetEmailTemplate(userName: string, resetUrl: string, appName: string): string {
  return emailLayout(`
<h2 style="margin:0 0 16px;font-size:18px;color:#f1f5f9;">Password Reset Request</h2>
<p style="margin:0 0 8px;">Hi ${userName},</p>
<p style="margin:0 0 16px;">We received a request to reset your password on ${appName}. Click the button below to set a new password. This link expires in 1 hour.</p>
${button('Reset Password', resetUrl)}
<p style="margin:0;color:#94a3b8;font-size:13px;">If you didn't request this, you can safely ignore this email.</p>
`, appName)
}

export function createPasswordResetConfirmEmailTemplate(userName: string, appName: string): string {
  return emailLayout(`
<h2 style="margin:0 0 16px;font-size:18px;color:#f1f5f9;">Password Reset Complete</h2>
<p style="margin:0 0 8px;">Hi ${userName},</p>
<p style="margin:0 0 16px;">Your password on ${appName} has been reset successfully. You can now sign in with your new password.</p>
<p style="margin:0;color:#94a3b8;font-size:13px;">If you didn't reset your password, please contact your administrator immediately.</p>
`, appName)
}

export function createAccountStatusEmailTemplate(userName: string, appName: string, isBlocked: boolean): string {
  const status = isBlocked ? 'Blocked' : 'Unblocked'
  const message = isBlocked
    ? 'Your account has been blocked by an administrator. You will not be able to sign in until your account is unblocked.'
    : 'Your account has been unblocked by an administrator. You can now sign in again.'

  return emailLayout(`
<h2 style="margin:0 0 16px;font-size:18px;color:#f1f5f9;">Account ${status}</h2>
<p style="margin:0 0 8px;">Hi ${userName},</p>
<p style="margin:0 0 16px;">${message}</p>
<p style="margin:0;color:#94a3b8;font-size:13px;">If you have questions, please contact your administrator.</p>
`, appName)
}

export function createAccountCreatedEmailTemplate(
  userName: string,
  appName: string,
  loginUrl: string,
  hasPassword: boolean
): string {
  const passwordNote = hasPassword
    ? 'You can sign in using the password that was set for you.'
    : 'No password has been set for your account. Please use the "Forgot password?" link on the login page to set one.'

  return emailLayout(`
<h2 style="margin:0 0 16px;font-size:18px;color:#f1f5f9;">Your Account Has Been Created</h2>
<p style="margin:0 0 8px;">Hi ${userName},</p>
<p style="margin:0 0 16px;">An account has been created for you on ${appName}. ${passwordNote}</p>
${button('Sign In', loginUrl)}
<p style="margin:0;color:#94a3b8;font-size:13px;">If you weren't expecting this, please contact your administrator.</p>
`, appName)
}

export function createInviteEmailTemplate(
  userName: string,
  inviterName: string,
  appName: string,
  resetUrl: string
): string {
  return emailLayout(`
<h2 style="margin:0 0 16px;font-size:18px;color:#f1f5f9;">You've been invited to ${appName}</h2>
<p style="margin:0 0 8px;">Hi ${userName},</p>
<p style="margin:0 0 16px;">${inviterName} has invited you to join ${appName}. Click the button below to set your password and get started. This link expires in 24 hours.</p>
${button('Accept Invite', resetUrl)}
<p style="margin:0;color:#94a3b8;font-size:13px;">If you weren't expecting this invitation, you can safely ignore this email.</p>
`, appName)
}
