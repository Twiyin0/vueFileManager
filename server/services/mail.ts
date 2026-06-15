import nodemailer from 'nodemailer'
import crypto from 'crypto'
import db from '../db'
import config from '../config'
import { translateServerText } from './server-i18n'

let transporter: nodemailer.Transporter | null = null

function getTransporter() {
  if (transporter) return transporter
  if (!config.smtp.enabled) return null

  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass,
    },
  })
  return transporter
}

function generateCode(): string {
  return crypto.randomInt(100000, 999999).toString()
}

export async function sendVerificationCode(email: string): Promise<{ code: string; expiresAt: string }> {
  const transport = getTransporter()
  const language = config.default_language === 'zh-CN' ? 'zh-CN' : 'en-US'
  if (!transport) throw new Error('common.smtpNotEnabled')

  await db.prepare("DELETE FROM verification_codes WHERE email = ? AND (used = 1 OR expires_at < datetime('now'))").run(email)

  const recent = await db.prepare(
    "SELECT id FROM verification_codes WHERE email = ? AND created_at > datetime('now', '-1 minute')"
  ).get(email)
  if (recent) throw new Error('common.pleaseWaitOneMinute')

  const code = generateCode()
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()

  await db.prepare(
    'INSERT INTO verification_codes (email, code, type, expires_at) VALUES (?, ?, ?, ?)'
  ).run(email, code, 'register', expiresAt)

  await transport.sendMail({
    from: config.smtp.from,
    to: email,
    subject: translateServerText('mail.verificationSubject', language, 'VueFileManager verification code'),
    html: `
      <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #4f6ef7;">VueFileManager</h2>
        <p>${translateServerText('mail.verificationTitle', language, 'Your registration verification code')}</p>
        <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #333; padding: 16px; background: #f5f5f5; border-radius: 8px; text-align: center;">
          ${code}
        </div>
        <p style="color: #666; font-size: 14px;">${translateServerText('mail.verificationExpires', language, 'The code is valid for 5 minutes. Do not share it with others.')}</p>
      </div>
    `,
  })

  return { code, expiresAt }
}

export async function verifyCode(email: string, code: string): Promise<boolean> {
  const record = await db.prepare(
    "SELECT id FROM verification_codes WHERE email = ? AND code = ? AND used = 0 AND expires_at > datetime('now') ORDER BY id DESC LIMIT 1"
  ).get(email, code) as any

  if (!record) return false

  await db.prepare('UPDATE verification_codes SET used = 1 WHERE id = ?').run(record.id)
  return true
}
