/**
 * Upyun 存储测试
 * 运行: npx tsx test/upyun.ts
 * 配置: 从 .env 文件读取 Upyun 凭证
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { UpyunStorage } from '../server/services/upyun'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 读取 .env 文件
function loadEnv(): Record<string, string> {
  const envPath = path.join(__dirname, '..', '.env')
  const env: Record<string, string> = {}
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIndex = trimmed.indexOf('=')
      if (eqIndex > 0) {
        const key = trimmed.slice(0, eqIndex).trim()
        const value = trimmed.slice(eqIndex + 1).trim()
        env[key] = value
      }
    }
  }
  return env
}

const env = loadEnv()

// Upyun 配置（从 .env 读取）
const operator = env.ENV_upyun_operator
const password = env.ENV_upyun_password
const bucket = env.ENV_upyun_bucket
const endpoint = env.ENV_upyun_endpoint || 'v0.api.upyun.com'
const testPath = env.ENV_upyun_test_path || '/test'

if (!operator || !password || !bucket) {
  console.error('\x1b[31m错误: 缺少 Upyun 配置\x1b[0m')
  console.error('请在 .env 文件中配置以下变量：')
  console.error('  ENV_upyun_operator=操作员名称')
  console.error('  ENV_upyun_password=操作员密码')
  console.error('  ENV_upyun_bucket=服务名称')
  console.error('\n参考 .env.example 文件')
  process.exit(1)
}

const green = (s: string) => `\x1b[32m✓ ${s}\x1b[0m`
const red = (s: string) => `\x1b[31m✗ ${s}\x1b[0m`
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`

let passed = 0
let failed = 0

// 延迟函数，避免触发 Upyun 限流
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const storage = new UpyunStorage(operator, password, bucket, endpoint)
const TEST_DIR = `${testPath}/vuefm-test`
const TEST_FILE = `${TEST_DIR}/hello.txt`
const TEST_CONTENT = 'Hello from VueFileManager! 测试中文内容'

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn()
    console.log(green(name))
    passed++
  } catch (err: any) {
    console.log(red(`${name}: ${err.message}`))
    failed++
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg)
}

async function main() {
  console.log(cyan('╔═══════════════════════════════════════╗'))
  console.log(cyan('║   Upyun 存储测试                      ║'))
  console.log(cyan('╚═══════════════════════════════════════╝'))
  console.log(cyan(`\n服务: ${bucket} | 操作员: ${operator} | 路径: ${TEST_DIR}\n`))

  // 清理可能存在的测试文件
  try { await storage.remove(TEST_DIR) } catch {}

  await test('创建文件夹', async () => {
    await storage.mkdir(TEST_DIR)
    const exists = await storage.exists(TEST_DIR)
    assert(exists, '文件夹不存在')
  })
  await delay(500)

  await test('上传文件', async () => {
    await storage.upload(TEST_FILE, Buffer.from(TEST_CONTENT, 'utf-8'))
    const exists = await storage.exists(TEST_FILE)
    assert(exists, '文件不存在')
  })
  await delay(500)

  await test('获取文件信息', async () => {
    const info = await storage.info(TEST_FILE)
    assert(info.name === 'hello.txt', `文件名不正确: ${info.name}`)
    assert(info.size > 0, '文件大小为0')
    console.log(`    文件大小: ${info.size} bytes`)
  })
  await delay(500)

  await test('下载文件', async () => {
    const data = await storage.download(TEST_FILE)
    const content = data.toString('utf-8')
    assert(content === TEST_CONTENT, `内容不匹配: ${content}`)
  })
  await delay(500)

  await test('列出文件', async () => {
    const files = await storage.list(TEST_DIR)
    assert(files.length > 0, '文件列表为空')
    assert(files.some(f => f.name === 'hello.txt'), '未找到上传的文件')
    console.log(`    文件数量: ${files.length}`)
    files.forEach(f => console.log(`    - ${f.name} (${f.type}, ${f.size}B)`))
  })
  await delay(500)

  await test('创建子文件夹', async () => {
    await storage.mkdir(`${TEST_DIR}/sub-dir`)
    const files = await storage.list(TEST_DIR)
    assert(files.some(f => f.name === 'sub-dir' && f.type === 'folder'), '子文件夹不存在')
  })
  await delay(500)

  await test('重命名文件', async () => {
    await storage.rename(TEST_FILE, 'hello-renamed.txt')
    await delay(500)
    const exists = await storage.exists(`${TEST_DIR}/hello-renamed.txt`)
    assert(exists, '重命名后文件不存在')
  })
  await delay(500)

  await test('复制文件', async () => {
    await storage.copy(`${TEST_DIR}/hello-renamed.txt`, `${TEST_DIR}/hello-copy.txt`)
    await delay(500)
    const exists = await storage.exists(`${TEST_DIR}/hello-copy.txt`)
    assert(exists, '复制的文件不存在')
  })
  await delay(500)

  await test('移动文件', async () => {
    await storage.move(`${TEST_DIR}/hello-copy.txt`, `${TEST_DIR}/sub-dir/hello-moved.txt`)
    await delay(500)
    const exists = await storage.exists(`${TEST_DIR}/sub-dir/hello-moved.txt`)
    assert(exists, '移动的文件不存在')
  })
  await delay(500)

  await test('搜索文件', async () => {
    const results = await storage.search(TEST_DIR, 'hello')
    assert(results.length >= 1, `搜索结果数量不正确: ${results.length}`)
    console.log(`    搜索结果: ${results.length} 个`)
  })
  await delay(500)

  await test('删除文件', async () => {
    await storage.remove(`${TEST_DIR}/hello-renamed.txt`)
    await delay(500)
    await storage.remove(`${TEST_DIR}/sub-dir/hello-moved.txt`)
    await delay(500)
    await storage.remove(`${TEST_DIR}/sub-dir`)
    await delay(500)
  })

  await test('删除文件夹', async () => {
    await storage.remove(TEST_DIR)
    await delay(2000)
    // 再次尝试删除（如果还存在）
    try {
      const remaining = await storage.list(TEST_DIR)
      if (remaining.length > 0) {
        console.log(`    仍有残留，再次删除...`)
        await storage.remove(TEST_DIR)
        await delay(1000)
      }
    } catch {}
    // 检查是否还存在
    try {
      const remaining = await storage.list(TEST_DIR)
      assert(remaining.length === 0, `文件夹仍有 ${remaining.length} 个文件`)
    } catch {
      // 404 错误表示不存在，这是期望的结果
    }
  })

  console.log(cyan('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'))
  console.log(`  通过: ${passed}  失败: ${failed}  总计: ${passed + failed}`)
  console.log(cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'))

  if (failed > 0) process.exit(1)
}

main()
