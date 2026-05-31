/**
 * VueFileManager API 全流程测试
 * 运行: npx tsx test/workflows.ts
 */

const BASE = 'http://localhost:3000/api'
let adminToken = ''
let userToken = ''
let apiKey = ''
let shareCode = ''

// 颜色输出
const green = (s: string) => `\x1b[32m✓ ${s}\x1b[0m`
const red = (s: string) => `\x1b[31m✗ ${s}\x1b[0m`
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`

let passed = 0
let failed = 0

async function api(method: string, path: string, body?: any, headers: Record<string, string> = {}) {
  const opts: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json', ...headers }
  }
  if (body && method !== 'GET') opts.body = JSON.stringify(body)
  const res = await fetch(`${BASE}${path}`, opts)
  const data = await res.json().catch(() => null)
  return { status: res.status, data }
}

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

// ==================== 认证测试 ====================
async function testAuth() {
  console.log(cyan('\n━━━ 认证 API ━━━'))

  await test('POST /auth/register - 注册用户', async () => {
    const { status, data } = await api('POST', '/auth/register', { username: 'testuser', password: 'test123456' })
    assert(status === 200, `状态码 ${status}`)
    assert(data.token, '缺少 token')
    userToken = data.token
  })

  await test('POST /auth/register - 重复注册应失败', async () => {
    const { status } = await api('POST', '/auth/register', { username: 'testuser', password: 'test123456' })
    assert(status === 409, `状态码 ${status}`)
  })

  await test('POST /auth/login - 管理员登录', async () => {
    const { status, data } = await api('POST', '/auth/login', { username: 'admin', password: 'admin' })
    assert(status === 200, `状态码 ${status}`)
    assert(data.token, '缺少 token')
    adminToken = data.token
  })

  await test('POST /auth/login - 错误密码应失败', async () => {
    const { status } = await api('POST', '/auth/login', { username: 'admin', password: 'wrong' })
    assert(status === 401, `状态码 ${status}`)
  })

  await test('GET /auth/me - 获取当前用户', async () => {
    const { status, data } = await api('GET', '/auth/me', null, { Authorization: `Bearer ${adminToken}` })
    assert(status === 200, `状态码 ${status}`)
    assert(data.user.username === 'admin', '用户名不匹配')
    assert(data.user.role === 'admin', '角色不匹配')
  })

  await test('GET /auth/me - 无 Token 应失败', async () => {
    const { status } = await api('GET', '/auth/me')
    assert(status === 401, `状态码 ${status}`)
  })
}

// ==================== 文件测试 ====================
async function testFiles() {
  console.log(cyan('\n━━━ 文件 API ━━━'))

  await test('POST /files/mkdir - 创建文件夹', async () => {
    const { status, data } = await api('POST', '/files/mkdir', { path: 'test-dir' }, { Authorization: `Bearer ${adminToken}` })
    assert(status === 200, `状态码 ${status}`)
  })

  await test('GET /files/list - 文件列表', async () => {
    const { status, data } = await api('GET', '/files/list', null, { Authorization: `Bearer ${adminToken}` })
    assert(status === 200, `状态码 ${status}`)
    assert(Array.isArray(data.files), '返回非数组')
    assert(data.files.some((f: any) => f.name === 'test-dir'), '未找到创建的文件夹')
  })

  await test('GET /files/list?path= - 带路径的文件列表', async () => {
    const { status, data } = await api('GET', '/files/list?path=test-dir', null, { Authorization: `Bearer ${adminToken}` })
    assert(status === 200, `状态码 ${status}`)
    assert(Array.isArray(data.files), '返回非数组')
  })

  await test('POST /files/rename - 重命名', async () => {
    const { status } = await api('POST', '/files/rename', { path: 'test-dir', newName: 'test-dir-renamed' }, { Authorization: `Bearer ${adminToken}` })
    assert(status === 200, `状态码 ${status}`)
  })

  await test('POST /files/mkdir - 创建子文件夹用于移动测试', async () => {
    const { status } = await api('POST', '/files/mkdir', { path: 'test-dir-renamed/sub-dir' }, { Authorization: `Bearer ${adminToken}` })
    assert(status === 200, `状态码 ${status}`)
  })

  await test('POST /files/copy - 复制文件夹', async () => {
    const { status } = await api('POST', '/files/copy', { src: 'test-dir-renamed', dest: 'test-dir-copy' }, { Authorization: `Bearer ${adminToken}` })
    assert(status === 200, `状态码 ${status}`)
  })

  await test('POST /files/move - 移动文件夹', async () => {
    const { status } = await api('POST', '/files/move', { src: 'test-dir-copy/sub-dir', dest: 'test-dir-renamed/sub-dir-moved' }, { Authorization: `Bearer ${adminToken}` })
    assert(status === 200, `状态码 ${status}`)
  })

  await test('GET /files/search - 搜索文件', async () => {
    const { status, data } = await api('GET', '/files/search?q=test', null, { Authorization: `Bearer ${adminToken}` })
    assert(status === 200, `状态码 ${status}`)
    assert(Array.isArray(data.files), '返回非数组')
    assert(data.files.length > 0, '搜索结果为空')
  })

  await test('DELETE /files/delete - 删除文件夹', async () => {
    const { status } = await api('DELETE', '/files/delete?path=test-dir-renamed', null, { Authorization: `Bearer ${adminToken}` })
    assert(status === 200, `状态码 ${status}`)
  })

  await test('DELETE /files/delete - 删除复制的文件夹', async () => {
    const { status } = await api('DELETE', '/files/delete?path=test-dir-copy', null, { Authorization: `Bearer ${adminToken}` })
    assert(status === 200, `状态码 ${status}`)
  })
}

// ==================== API Key 测试 ====================
async function testApiKeys() {
  console.log(cyan('\n━━━ API Key API ━━━'))

  await test('POST /user/apikeys - 创建 API Key', async () => {
    const { status, data } = await api('POST', '/user/apikeys', { name: '测试Key', permissions: 'read,write,delete' }, { Authorization: `Bearer ${adminToken}` })
    assert(status === 200, `状态码 ${status}`)
    assert(data.key, '缺少 key')
    apiKey = data.key
  })

  await test('GET /user/apikeys - API Key 列表', async () => {
    const { status, data } = await api('GET', '/user/apikeys', null, { Authorization: `Bearer ${adminToken}` })
    assert(status === 200, `状态码 ${status}`)
    assert(Array.isArray(data.keys), '返回非数组')
    assert(data.keys.length > 0, '列表为空')
  })

  await test('GET /files/list - 使用 API Key 认证', async () => {
    const { status, data } = await api('GET', '/files/list', null, { 'X-API-Key': apiKey })
    assert(status === 200, `状态码 ${status}`)
    assert(Array.isArray(data.files), '返回非数组')
  })

  await test('POST /files/mkdir - 使用 API Key 创建文件夹', async () => {
    const { status } = await api('POST', '/files/mkdir', { path: 'api-key-test' }, { 'X-API-Key': apiKey })
    assert(status === 200, `状态码 ${status}`)
  })

  await test('DELETE /files/delete - 使用 API Key 删除', async () => {
    const { status } = await api('DELETE', '/files/delete?path=api-key-test', null, { 'X-API-Key': apiKey })
    assert(status === 200, `状态码 ${status}`)
  })
}

// ==================== 用户设置测试 ====================
async function testUserSettings() {
  console.log(cyan('\n━━━ 用户设置 API ━━━'))

  await test('GET /user/settings - 获取设置', async () => {
    const { status, data } = await api('GET', '/user/settings', null, { Authorization: `Bearer ${userToken}` })
    assert(status === 200, `状态码 ${status}`)
    assert(data.settings, '缺少 settings')
    assert(data.settings.storageType === 'local', '默认存储类型不正确')
  })

  await test('PUT /user/settings - 更新设置', async () => {
    const { status } = await api('PUT', '/user/settings', {
      guestEnabled: true,
      guestPath: 'public',
      theme: 'dark'
    }, { Authorization: `Bearer ${userToken}` })
    assert(status === 200, `状态码 ${status}`)
  })

  await test('GET /user/settings - 验证更新', async () => {
    const { status, data } = await api('GET', '/user/settings', null, { Authorization: `Bearer ${userToken}` })
    assert(status === 200, `状态码 ${status}`)
    assert(data.settings.guestEnabled === true, '访客模式未开启')
    assert(data.settings.guestPath === 'public', '访客路径不正确')
    assert(data.settings.theme === 'dark', '主题不正确')
  })
}

// ==================== 访客 API 测试 ====================
async function testGuest() {
  console.log(cyan('\n━━━ 访客 API ━━━'))

  await test('GET /guest - 访客用户列表', async () => {
    const { status, data } = await api('GET', '/guest')
    assert(status === 200, `状态码 ${status}`)
    assert(Array.isArray(data.users), '返回非数组')
    assert(data.users.some((u: any) => u.username === 'testuser'), '未找到开启访客的用户')
  })

  await test('GET /guest/testuser/list - 访客文件列表', async () => {
    const { status, data } = await api('GET', '/guest/testuser/list')
    assert(status === 200, `状态码 ${status}`)
    assert(Array.isArray(data.files), '返回非数组')
  })
}

// ==================== 分享 API 测试 ====================
async function testShare() {
  console.log(cyan('\n━━━ 分享 API ━━━'))

  // 先创建一个测试文件夹
  await api('POST', '/files/mkdir', { path: 'share-test-dir' }, { Authorization: `Bearer ${adminToken}` })

  await test('POST /share/create - 创建分享', async () => {
    const { status, data } = await api('POST', '/share/create', {
      filePath: 'share-test-dir',
      fileType: 'folder',
      expiresIn: 24,
      maxDownloads: 100
    }, { Authorization: `Bearer ${adminToken}` })
    assert(status === 200, `状态码 ${status}`)
    assert(data.shareCode, '缺少 shareCode')
    shareCode = data.shareCode
  })

  await test('POST /share/create - 创建带密码的分享', async () => {
    const { status, data } = await api('POST', '/share/create', {
      filePath: 'share-test-dir',
      fileType: 'folder',
      password: '123456'
    }, { Authorization: `Bearer ${adminToken}` })
    assert(status === 200, `状态码 ${status}`)
    assert(data.shareCode, '缺少 shareCode')
  })

  await test('GET /share/list - 我的分享列表', async () => {
    const { status, data } = await api('GET', '/share/list', null, { Authorization: `Bearer ${adminToken}` })
    assert(status === 200, `状态码 ${status}`)
    assert(Array.isArray(data.shares), '返回非数组')
    assert(data.shares.length >= 2, '分享数量不正确')
  })

  await test('GET /share/s/:code - 访问分享', async () => {
    const { status, data } = await api('GET', `/share/s/${shareCode}`)
    assert(status === 200, `状态码 ${status}`)
    assert(data.needPassword === false, '不应需要密码')
    assert(data.owner === 'admin', '分享者不正确')
  })

  await test('GET /share/s/:code - 访问带密码的分享(无密码应返回needPassword)', async () => {
    const shares = await api('GET', '/share/list', null, { Authorization: `Bearer ${adminToken}` })
    const pwdShare = shares.data.shares.find((s: any) => s.password === '123456')
    if (pwdShare) {
      const { status, data } = await api('GET', `/share/s/${pwdShare.share_code}`)
      assert(status === 200, `状态码 ${status}`)
      assert(data.needPassword === true, '应需要密码')
    }
  })

  await test('DELETE /share/:id - 删除分享', async () => {
    const shares = await api('GET', '/share/list', null, { Authorization: `Bearer ${adminToken}` })
    const shareId = shares.data.shares[0]?.id
    if (shareId) {
      const { status } = await api('DELETE', `/share/${shareId}`, null, { Authorization: `Bearer ${adminToken}` })
      assert(status === 200, `状态码 ${status}`)
    }
  })

  // 清理
  await api('DELETE', '/files/delete?path=share-test-dir', null, { Authorization: `Bearer ${adminToken}` })
}

// ==================== 管理 API 测试 ====================
async function testAdmin() {
  console.log(cyan('\n━━━ 管理 API ━━━'))

  await test('GET /admin/users - 用户列表', async () => {
    const { status, data } = await api('GET', '/admin/users', null, { Authorization: `Bearer ${adminToken}` })
    assert(status === 200, `状态码 ${status}`)
    assert(Array.isArray(data.users), '返回非数组')
    assert(data.users.length >= 2, '用户数量不正确')
  })

  await test('PUT /admin/users/:id/role - 修改角色', async () => {
    const users = await api('GET', '/admin/users', null, { Authorization: `Bearer ${adminToken}` })
    const testUserId = users.data.users.find((u: any) => u.username === 'testuser')?.id
    if (testUserId) {
      const { status } = await api('PUT', `/admin/users/${testUserId}/role`, { role: 'user' }, { Authorization: `Bearer ${adminToken}` })
      assert(status === 200, `状态码 ${status}`)
    }
  })

  await test('GET /admin/users - 普通用户无权限', async () => {
    const { status } = await api('GET', '/admin/users', null, { Authorization: `Bearer ${userToken}` })
    assert(status === 403, `状态码 ${status}`)
  })
}

// ==================== 清理测试 ====================
async function testCleanup() {
  console.log(cyan('\n━━━ 清理 ━━━'))

  await test('DELETE /user/apikeys/:id - 删除 API Key', async () => {
    const keys = await api('GET', '/user/apikeys', null, { Authorization: `Bearer ${adminToken}` })
    for (const key of keys.data.keys) {
      await api('DELETE', `/user/apikeys/${key.id}`, null, { Authorization: `Bearer ${adminToken}` })
    }
    const { status } = await api('GET', '/user/apikeys', null, { Authorization: `Bearer ${adminToken}` })
    assert(status === 200, `状态码 ${status}`)
  })

  await test('DELETE /admin/users/:id - 删除测试用户', async () => {
    const users = await api('GET', '/admin/users', null, { Authorization: `Bearer ${adminToken}` })
    const testUserId = users.data.users.find((u: any) => u.username === 'testuser')?.id
    if (testUserId) {
      const { status } = await api('DELETE', `/admin/users/${testUserId}`, null, { Authorization: `Bearer ${adminToken}` })
      assert(status === 200, `状态码 ${status}`)
    }
  })
}

// ==================== 主流程 ====================
async function main() {
  console.log(cyan('╔═══════════════════════════════════════╗'))
  console.log(cyan('║   VueFileManager API 全流程测试       ║'))
  console.log(cyan('╚═══════════════════════════════════════╝'))

  try {
    await testAuth()
    await testFiles()
    await testApiKeys()
    await testUserSettings()
    await testGuest()
    await testShare()
    await testAdmin()
    await testCleanup()
  } catch (err: any) {
    console.error(red(`\n测试执行出错: ${err.message}`))
  }

  console.log(cyan('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'))
  console.log(`  通过: ${passed}  失败: ${failed}  总计: ${passed + failed}`)
  console.log(cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'))

  if (failed > 0) process.exit(1)
}

main()
