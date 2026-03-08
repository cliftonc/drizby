/**
 * Auto-setup: if ADMIN_EMAIL and RESEND_API_KEY are set and no users exist,
 * automatically create the admin account and send a password reset email.
 */

import crypto from 'node:crypto'
import { count } from 'drizzle-orm'
import { passwordResetTokens, settings, users } from '../../schema'
import { createPasswordResetEmailTemplate, getAppName, getAppUrl, sendEmail } from './email'

export async function runAutoSetup(db: any): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL
  const resendKey = process.env.RESEND_API_KEY

  if (!adminEmail || !resendKey) {
    return
  }

  // Check if any users exist
  const [{ value: userCount }] = await db.select({ value: count() }).from(users)
  if (userCount > 0) {
    return
  }

  console.log(`Auto-setup: creating admin account for ${adminEmail}`)

  // Create admin user with no password
  const username = adminEmail.split('@')[0]
  const [user] = await db
    .insert(users)
    .values({
      name: username,
      email: adminEmail,
      username,
      role: 'admin',
      organisationId: 1,
    })
    .returning()

  // Set setup_status to pending_admin_reset
  await db
    .insert(settings)
    .values({
      key: 'setup_status',
      value: 'pending_admin_reset',
      organisationId: 1,
    })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: 'pending_admin_reset', updatedAt: new Date() },
    })

  // Create password reset token
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours for initial setup

  await db.insert(passwordResetTokens).values({
    id: token,
    userId: user.id,
    expiresAt,
  })

  // Send password reset email
  const appName = getAppName()
  const resetUrl = `${getAppUrl()}/reset-password?token=${token}`

  const sent = await sendEmail(
    adminEmail,
    `Set up your ${appName} admin account`,
    createPasswordResetEmailTemplate(user.name, resetUrl, appName)
  )

  if (sent) {
    console.log(`Auto-setup: password reset email sent to ${adminEmail}`)
  } else {
    console.error('Auto-setup: failed to send password reset email')
  }
}
