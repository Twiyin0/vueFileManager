/**
 * SMTP 连通性测试脚本
 * 用法: npx tsx test/smtp.ts [收件邮箱]
 */

import nodemailer from 'nodemailer'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import yaml from 'js-yaml'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const configPath = path.join(__dirname, '..', 'config.yml')
const config = yaml.load(fs.readFileSync(configPath, 'utf8')) as any

const smtp = config.smtp

if (!smtp?.enabled) {
  console.log('❌ SMTP 未启用，请在 config.yml 中设置 smtp.enabled: true')
  process.exit(1)
}

console.log('📧 SMTP 配置:')
console.log(`   主机: ${smtp.host}`)
console.log(`   端口: ${smtp.port}`)
console.log(`   加密: ${smtp.secure ? 'SSL/TLS' : '无'} (${smtp.secure ? '隐式' : '显式'})`)
console.log(`   账号: ${smtp.user}`)
console.log(`   发件人: ${smtp.from}`)
console.log()

const transporter = nodemailer.createTransport({
  host: smtp.host,
  port: smtp.port,
  secure: smtp.secure,
  auth: {
    user: smtp.user,
    pass: smtp.pass,
  },
})

// 1. 验证连接
console.log('🔍 验证 SMTP 连接...')
try {
  await transporter.verify()
  console.log('✅ 连接成功，认证通过')
} catch (err: any) {
  console.log(`❌ 连接失败: ${err.message}`)
  if (err.code === 'EAUTH') {
    console.log('   → 认证失败，请检查账号密码（QQ 企业邮箱需使用安全密码）')
  } else if (err.code === 'ECONNREFUSED') {
    console.log('   → 连接被拒绝，请检查主机和端口')
  } else if (err.code === 'ETIMEDOUT') {
    console.log('   → 连接超时，请检查网络或防火墙')
  }
  process.exit(1)
}

// 2. 发送测试邮件（可选）
const to = process.argv[2]
if (!to) {
  console.log()
  console.log('💡 发送测试邮件: npx tsx test/smtp.ts your@email.com')
  await transporter.close()
  process.exit(0)
}

console.log()
console.log(`📤 发送测试邮件到 ${to}...`)
try {
  const info = await transporter.sendMail({
    from: smtp.from,
    to,
    subject: 'VueFileManager SMTP 测试',
    html: `
      <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #4f6ef7;">VueFileManager</h2>
        <p>SMTP 配置测试成功 ✅</p>
        <p style="color: #666; font-size: 14px;">发送时间: ${new Date().toLocaleString('zh-CN')}</p>
      </div>
    `,
  })
  console.log(`✅ 发送成功 (Message ID: ${info.messageId})`)
} catch (err: any) {
  console.log(`❌ 发送失败: ${err.message}`)
}

await transporter.close()
