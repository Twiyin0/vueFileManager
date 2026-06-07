import nodemailer from 'nodemailer'
import crypto from 'crypto'
import db from '../db'
import config from '../config'

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

/** 生成 6 位验证码 */
function generateCode(): string {
  return crypto.randomInt(100000, 999999).toString()
}

/** 发送验证码邮件，返回验证码（供测试用） */
export async function sendVerificationCode(email: string): Promise<{ code: string; expiresAt: string }> {
  const transport = getTransporter()
  if (!transport) throw new Error('SMTP 未启用')

  // 清理该邮箱的旧验证码
  db.prepare("DELETE FROM verification_codes WHERE email = ? AND (used = 1 OR expires_at < datetime('now'))").run(email)

  // 检查频率限制（1 分钟内不能重复发送）
  const recent = db.prepare(
    "SELECT id FROM verification_codes WHERE email = ? AND created_at > datetime('now', '-1 minute')"
  ).get(email)
  if (recent) throw new Error('请等待 1 分钟后再试')

  const code = generateCode()
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()

  db.prepare(
    'INSERT INTO verification_codes (email, code, type, expires_at) VALUES (?, ?, ?, ?)'
  ).run(email, code, 'register', expiresAt)

  await transport.sendMail({
    from: config.smtp.from,
    to: email,
    subject: 'VueFileManager 注册验证码',
    html: `
      <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #4f6ef7;">VueFileManager</h2>
        <p>您的注册验证码为：</p>
        <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #333; padding: 16px; background: #f5f5f5; border-radius: 8px; text-align: center;">
          ${code}
        </div>
        <p style="color: #666; font-size: 14px;">验证码 5 分钟内有效，请勿泄露给他人。</p>
      </div>
    `,
  })

  return { code, expiresAt }
}

/** 验证验证码 */
export function verifyCode(email: string, code: string): boolean {
  const record = db.prepare(
    "SELECT id FROM verification_codes WHERE email = ? AND code = ? AND used = 0 AND expires_at > datetime('now') ORDER BY id DESC LIMIT 1"
  ).get(email, code) as any

  if (!record) return false

  db.prepare('UPDATE verification_codes SET used = 1 WHERE id = ?').run(record.id)
  return true
}
