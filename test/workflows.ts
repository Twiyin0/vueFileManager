/**
 * VueFileManager API 全流程测试
 * 运行: npx tsx test/workflows.ts
 * 前置: 服务器需在 localhost:3000 运行
 */

const BASE = 'http://localhost:3000/api'
const PUBLIC_BASE = 'http://localhost:3000'
let adminToken = ''
let userToken = ''
let apiKey = ''
let bannedApiKey = ''
let shareCode = ''
let signKey = ''
let signUrl = ''
let testUserId = 0
let testPoolId = 0
let uploadId = ''

const green = (s: string) => `\x1b[32m✓ ${s}\x1b[0m`
const red = (s: string) => `\x1b[31m✗ ${s}\x1b[0m`
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`
const yellow = (s: string) => `\x1b[33m  ${s}\x1b[0m`

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

async function rawApi(method: string, url: string, headers: Record<string, string> = {}) {
  const opts: RequestInit = { method, headers }
  const res = await fetch(url, opts)
  return { status: res.status, data: await res.text() }
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

const auth = (token: string) => ({ Authorization: `Bearer ${token}` })

// ==================== 1. 认证 ====================
async function testAuth() {
  console.log(cyan('\n━━━ 1. 认证 API ━━━'))

  await test('POST /auth/register - 注册用户', async () => {
    const { status, data } = await api('POST', '/auth/register', { username: 'testuser', password: 'test123456' })
    assert(status === 200, `状态码 ${status}`)
    assert(data.token, '缺少 token')
    userToken = data.token
    testUserId = data.user.id
  })

  await test('POST /auth/register - 重复注册应 409', async () => {
    const { status } = await api('POST', '/auth/register', { username: 'testuser', password: 'test123456' })
    assert(status === 409, `状态码 ${status}`)
  })

  await test('POST /auth/register - 用户名过短应 400', async () => {
    const { status } = await api('POST', '/auth/register', { username: 'ab', password: '123456' })
    assert(status === 400, `状态码 ${status}`)
  })

  await test('POST /auth/register - 密码过短应 400', async () => {
    const { status } = await api('POST', '/auth/register', { username: 'shortpwd', password: '123' })
    assert(status === 400, `状态码 ${status}`)
  })

  await test('POST /auth/register - 带邮箱注册', async () => {
    const { status, data } = await api('POST', '/auth/register', { username: 'emailuser', password: 'test123456', email: 'test@example.com' })
    assert(status === 200, `状态码 ${status}`)
    assert(data.token, '缺少 token')
  })

  await test('POST /auth/login - 管理员登录', async () => {
    const { status, data } = await api('POST', '/auth/login', { username: 'admin', password: 'admin' })
    assert(status === 200, `状态码 ${status}`)
    assert(data.token, '缺少 token')
    adminToken = data.token
  })

  await test('POST /auth/login - 错误密码应 401', async () => {
    const { status } = await api('POST', '/auth/login', { username: 'admin', password: 'wrong' })
    assert(status === 401, `状态码 ${status}`)
  })

  await test('POST /auth/login - 不存在用户应 401', async () => {
    const { status } = await api('POST', '/auth/login', { username: 'nouser', password: '123456' })
    assert(status === 401, `状态码 ${status}`)
  })

  await test('GET /auth/me - 获取管理员信息', async () => {
    const { status, data } = await api('GET', '/auth/me', null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    assert(data.user.username === 'admin', '用户名不匹配')
    assert(data.user.role === 'admin', '角色不匹配')
    assert(data.user.settings, '缺少 settings')
  })

  await test('GET /auth/me - 无 Token 应 401', async () => {
    const { status } = await api('GET', '/auth/me')
    assert(status === 401, `状态码 ${status}`)
  })

  await test('GET /auth/me - 无效 Token 应 401', async () => {
    const { status } = await api('GET', '/auth/me', null, { Authorization: 'Bearer invalid.token.here' })
    assert(status === 401, `状态码 ${status}`)
  })
}

// ==================== 2. 站点配置 ====================
async function testSiteConfig() {
  console.log(cyan('\n━━━ 2. 站点配置 API ━━━'))

  await test('GET /site-config - 获取站点配置', async () => {
    const { status, data } = await api('GET', '/site-config')
    assert(status === 200, `状态码 ${status}`)
    assert(typeof data.smtp_enabled === 'boolean', '缺少 smtp_enabled')
    assert(typeof data.themes_enabled === 'boolean', '缺少 themes_enabled')
    console.log(yellow(`  smtp=${data.smtp_enabled}, themes=${data.themes_enabled}`))
  })
}

// ==================== 3. 存储池 ====================
async function testStoragePools() {
  console.log(cyan('\n━━━ 3. 存储池 API ━━━'))

  await test('GET /storage-pools - 获取存储池列表', async () => {
    const { status, data } = await api('GET', '/storage-pools', null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    assert(Array.isArray(data.pools), '返回非数组')
    assert(data.pools.length > 0, '存储池为空')
    const pool = data.pools[0]
    assert(typeof pool.storageType === 'string', 'storageType 字段缺失')
    assert(typeof pool.isDefault === 'boolean', 'isDefault 字段缺失')
    testPoolId = pool.id
    console.log(yellow(`  默认存储池: ${pool.name} (${pool.storageType}) id=${pool.id}`))
  })

  await test('POST /storage-pools - 创建新存储池（本地，无路径）', async () => {
    const { status, data } = await api('POST', '/storage-pools', {
      name: '测试本地存储',
      storageType: 'local',
      config: {}
    }, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    assert(data.pool.id, '缺少 pool id')
  })

  await test('GET /storage-pools - 验证新存储池含 resolvedPath', async () => {
    const { status, data } = await api('GET', '/storage-pools', null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    const testPool = data.pools.find((p: any) => p.name === '测试本地存储')
    assert(testPool, '未找到新建的存储池')
    assert(testPool.resolvedPath, '缺少 resolvedPath')
    console.log(yellow(`  resolvedPath: ${testPool.resolvedPath}`))
  })

  await test('POST /storage-pools - 创建带映射路径的存储池', async () => {
    const { status, data } = await api('POST', '/storage-pools', {
      name: '映射路径存储',
      storageType: 'local',
      config: { rootPath: '/subfolder' }
    }, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    assert(data.pool.id, '缺少 pool id')
  })

  await test('POST /storage-pools/:id/test - 测试本地连接', async () => {
    const { status, data } = await api('POST', `/storage-pools/${testPoolId}/test`, null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    assert(data.success === true, `测试失败: ${data.message}`)
  })

  await test('PUT /storage-pools/:id - 更新存储池名称', async () => {
    const pools = await api('GET', '/storage-pools', null, auth(adminToken))
    const testPool = pools.data.pools.find((p: any) => p.name === '映射路径存储')
    const { status } = await api('PUT', `/storage-pools/${testPool.id}`, {
      name: '映射路径存储-已改名'
    }, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
  })

  await test('POST /storage-pools/:id/set-default - 设为默认', async () => {
    const pools = await api('GET', '/storage-pools', null, auth(adminToken))
    const testPool = pools.data.pools.find((p: any) => p.name === '映射路径存储-已改名')
    const { status } = await api('POST', `/storage-pools/${testPool.id}/set-default`, null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    const after = await api('GET', '/storage-pools', null, auth(adminToken))
    const newDefault = after.data.pools.find((p: any) => p.isDefault === true)
    assert(newDefault.id === testPool.id, '默认存储池切换失败')
  })

  await test('POST /storage-pools/:id/set-default - 切回原默认', async () => {
    const { status } = await api('POST', `/storage-pools/${testPoolId}/set-default`, null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
  })

  await test('DELETE /storage-pools/:id - 删除非默认存储池', async () => {
    const pools = await api('GET', '/storage-pools', null, auth(adminToken))
    const testPool = pools.data.pools.find((p: any) => p.name === '映射路径存储-已改名')
    const { status } = await api('DELETE', `/storage-pools/${testPool.id}`, null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
  })

  await test('DELETE /storage-pools/:id - 删除默认存储池应 400', async () => {
    const { status } = await api('DELETE', `/storage-pools/${testPoolId}`, null, auth(adminToken))
    assert(status === 400, `状态码 ${status}`)
  })
}

// ==================== 4. 文件操作 ====================
async function testFiles() {
  console.log(cyan('\n━━━ 4. 文件 API ━━━'))

  await test('POST /files/mkdir - 创建文件夹', async () => {
    const { status } = await api('POST', '/files/mkdir', { path: 'test-dir' }, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
  })

  await test('GET /files/list - 根目录列表', async () => {
    const { status, data } = await api('GET', '/files/list', null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    assert(Array.isArray(data.files), '返回非数组')
    assert(data.files.some((f: any) => f.isPool === true), '未找到虚拟存储池文件夹')
  })

  await test('GET /files/list?poolId= - 存储池内列表', async () => {
    const { status, data } = await api('GET', `/files/list?poolId=${testPoolId}`, null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    assert(Array.isArray(data.files), '返回非数组')
    assert(data.files.some((f: any) => f.name === 'test-dir'), '未找到 test-dir')
  })

  await test('POST /files/upload - 上传文件', async () => {
    const res = await fetch(`${BASE}/files/upload?path=test-dir&poolId=${testPoolId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: (() => { const fd = new FormData(); fd.append('file', new Blob(['hello world']), 'test.txt'); return fd })()
    })
    assert(res.ok, `上传失败: ${res.status}`)
  })

  await test('POST /files/upload - 上传搜索测试文件', async () => {
    const visible = await fetch(`${BASE}/files/upload?path=test-dir&poolId=${testPoolId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: (() => { const fd = new FormData(); fd.append('file', new Blob(['visible search target']), 'visible-search-target.txt'); return fd })()
    })
    assert(visible.ok, `可见搜索文件上传失败: ${visible.status}`)

    const { status: mkdirStatus } = await api('POST', '/files/mkdir', { path: 'test-dir/.trash', poolId: testPoolId }, auth(adminToken))
    assert(mkdirStatus === 200, `创建 .trash 目录失败: ${mkdirStatus}`)

    const hidden = await fetch(`${BASE}/files/upload?path=test-dir/.trash&poolId=${testPoolId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: (() => { const fd = new FormData(); fd.append('file', new Blob(['hidden search target']), 'hidden-search-target.txt'); return fd })()
    })
    assert(hidden.ok, `隐藏搜索文件上传失败: ${hidden.status}`)
  })

  await test('GET /files/list - 验证上传文件存在', async () => {
    const { status, data } = await api('GET', '/files/list?path=test-dir', null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    assert(data.files.some((f: any) => f.name === 'test.txt'), '未找到 test.txt')
  })

  await test('POST /files/rename - 重命名', async () => {
    const { status } = await api('POST', '/files/rename', { path: 'test-dir/test.txt', newName: 'renamed.txt', poolId: testPoolId }, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
  })

  await test('POST /files/copy - 复制', async () => {
    const { status } = await api('POST', '/files/copy', { src: 'test-dir/renamed.txt', dest: 'test-dir/copied.txt', poolId: testPoolId }, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
  })

  await test('POST /files/move - 移动', async () => {
    const { status } = await api('POST', '/files/move', { src: 'test-dir/copied.txt', dest: 'test-dir/moved.txt', poolId: testPoolId }, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
  })

  await test('GET /files/search - 搜索', async () => {
    const { status, data } = await api('GET', `/files/search?q=search-target&poolId=${testPoolId}`, null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    assert(Array.isArray(data.files), '返回非数组')
    assert(data.files.some((f: any) => f.name === 'visible-search-target.txt'), '未找到可见搜索结果')
    assert(!data.files.some((f: any) => String(f.path || '').includes('/.trash/')), '搜索结果不应包含 .trash 子项')
  })

  await test('GET /files/info - 文件信息', async () => {
    const { status, data } = await api('GET', '/files/info?path=test-dir', null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    assert(data.info, '缺少 info')
  })

  await test('GET /files/storage-stats - 存储统计', async () => {
    const { status, data } = await api('GET', '/files/storage-stats', null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    assert(typeof data.totalSize === 'number', '缺少 totalSize')
  })

  await test('POST /files/download-zip - 打包下载', async () => {
    const res = await fetch(`${BASE}/files/download-zip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ paths: ['test-dir/renamed.txt', 'test-dir/moved.txt'], poolId: testPoolId })
    })
    assert(res.ok, `下载失败: ${res.status}`)
    const buffer = Buffer.from(await res.arrayBuffer())
    assert(buffer[0] === 0x50 && buffer[1] === 0x4B, '不是有效的 ZIP')
  })

  await test('POST /files/batch-delete - 批量删除', async () => {
    await api('POST', '/files/mkdir', { path: 'test-dir/batch-a' }, auth(adminToken))
    await api('POST', '/files/mkdir', { path: 'test-dir/batch-b' }, auth(adminToken))
    const { status } = await api('POST', '/files/batch-delete', {
      paths: ['test-dir/batch-a', 'test-dir/batch-b'], permanent: true
    }, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
  })

  await test('DELETE /files/delete - 删除到回收站', async () => {
    const { status, data } = await api('POST', '/files/delete', { path: 'test-dir/moved.txt', poolId: testPoolId }, auth(adminToken))
    assert(status === 200, `状态码 ${status}, 错误: ${data?.error || '无'}`)
  })

  await test('DELETE /files/delete - 永久删除', async () => {
    const { status } = await api('POST', '/files/delete', { path: 'test-dir/renamed.txt', poolId: testPoolId, permanent: true }, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
  })

  await test('清理测试文件夹', async () => {
    const { status } = await api('POST', '/files/delete', { path: 'test-dir', poolId: testPoolId, permanent: true }, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
  })
}

// ==================== 5. 回收站 ====================
async function testTrash() {
  console.log(cyan('\n━━━ 5. 回收站 API ━━━'))

  await api('POST', '/files/mkdir', { path: 'trash-test-dir' }, auth(adminToken))
  await api('POST', '/files/delete', { path: 'trash-test-dir', poolId: testPoolId }, auth(adminToken))

  await test('GET /trash - 回收站列表', async () => {
    const { status, data } = await api('GET', '/trash', null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    assert(Array.isArray(data.items), '返回非数组')
    assert(data.items.length > 0, '回收站为空')
  })

  await test('POST /trash/:id/restore - 恢复文件', async () => {
    const trash = await api('GET', '/trash', null, auth(adminToken))
    const item = trash.data.items[0]
    const { status } = await api('POST', `/trash/${item.id}/restore`, null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
  })

  await test('DELETE /trash/:id - 永久删除回收站项目', async () => {
    await api('POST', '/files/delete', { path: 'trash-test-dir', poolId: testPoolId }, auth(adminToken))
    const trash = await api('GET', '/trash', null, auth(adminToken))
    const item = trash.data.items[0]
    const { status } = await api('DELETE', `/trash/${item.id}`, null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
  })

  await test('DELETE /trash - 清空回收站', async () => {
    await api('POST', '/files/mkdir', { path: 'trash-a' }, auth(adminToken))
    await api('POST', '/files/mkdir', { path: 'trash-b' }, auth(adminToken))
    await api('POST', '/files/delete', { path: 'trash-a', poolId: testPoolId }, auth(adminToken))
    await api('POST', '/files/delete', { path: 'trash-b', poolId: testPoolId }, auth(adminToken))
    const { status } = await api('DELETE', '/trash', null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    const trash = await api('GET', '/trash', null, auth(adminToken))
    assert(trash.data.items.length === 0, '回收站未清空')
  })
}

// ==================== 6. 收藏 ====================
async function testFavourites() {
  console.log(cyan('\n━━━ 6. 收藏 API ━━━'))

  await api('POST', '/files/mkdir', { path: 'fav-test-dir' }, auth(adminToken))

  await test('POST /favourites - 添加收藏', async () => {
    const { status } = await api('POST', '/favourites', {
      filePath: 'fav-test-dir', fileName: 'fav-test-dir', fileType: 'folder', storagePoolId: testPoolId
    }, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
  })

  await test('GET /favourites/check - 检查收藏状态', async () => {
    const { status, data } = await api('GET', `/favourites/check?filePath=fav-test-dir&storagePoolId=${testPoolId}`, null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    assert(data.isFavourited === true, '应为已收藏')
  })

  await test('GET /favourites - 收藏列表', async () => {
    const { status, data } = await api('GET', '/favourites', null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    assert(data.items.length > 0, '收藏列表为空')
  })

  await test('DELETE /favourites - 取消收藏', async () => {
    const { status } = await api('DELETE', `/favourites?filePath=fav-test-dir&storagePoolId=${testPoolId}`, null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    const check = await api('GET', `/favourites/check?filePath=fav-test-dir&storagePoolId=${testPoolId}`, null, auth(adminToken))
    assert(check.data.isFavourited === false, '应为未收藏')
  })

  await api('POST', '/files/delete', { path: 'fav-test-dir', poolId: testPoolId, permanent: true }, auth(adminToken))
}

// ==================== 7. 分享 ====================
async function testShare() {
  console.log(cyan('\n━━━ 7. 分享 API ━━━'))

  await api('POST', '/files/mkdir', { path: 'share-test' }, auth(adminToken))
  await fetch(`${BASE}/files/upload?path=share-test&poolId=${testPoolId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: (() => { const fd = new FormData(); fd.append('file', new Blob(['hello share']), 'test.txt'); return fd })()
  })

  await test('POST /share/create - 创建分享', async () => {
    const { status, data } = await api('POST', '/share/create', {
      filePath: 'share-test/test.txt', fileType: 'file', storagePoolId: testPoolId, expiresIn: 24
    }, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    assert(data.shareCode, '缺少 shareCode')
    assert(data.signKey, '缺少 signKey')
    shareCode = data.shareCode
    signKey = data.signKey
    signUrl = data.signUrl
  })

  await test('GET /share/list - 分享列表', async () => {
    const { status, data } = await api('GET', '/share/list', null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    assert(data.shares.length >= 1, '分享列表为空')
  })

  await test('GET /share/s/:code - 访问分享', async () => {
    const { status, data } = await api('GET', `/share/s/${shareCode}`)
    assert(status === 200, `状态码 ${status}`)
    assert(data.owner === 'admin', '分享者不正确')
  })

  await test('GET /share/download/:code - signToken 下载', async () => {
    const url = new URL(`${PUBLIC_BASE}${signUrl}`)
    const sign = url.searchParams.get('sign')
    const t = url.searchParams.get('t')
    const res = await fetch(`${BASE}/share/download/${shareCode}?sign=${sign}&t=${t}`)
    assert(res.ok, `下载失败: ${res.status}`)
    const text = await res.text()
    assert(text === 'hello share', '内容不匹配')
  })

  await test('DELETE /share/:id - 删除分享', async () => {
    const shares = await api('GET', '/share/list', null, auth(adminToken))
    for (const s of shares.data.shares) {
      await api('DELETE', `/share/${s.id}`, null, auth(adminToken))
    }
    const after = await api('GET', '/share/list', null, auth(adminToken))
    assert(after.data.shares.length === 0, '分享未全部删除')
  })

  await api('POST', '/files/delete', { path: 'share-test', poolId: testPoolId, permanent: true }, auth(adminToken))
}

// ==================== 8. 流式上传 ====================
async function testUploadStream() {
  console.log(cyan('\n━━━ 8. 流式上传 API ━━━'))

  await api('POST', '/files/mkdir', { path: 'stream-test' }, auth(adminToken))

  await test('POST /files/upload-stream - 流式上传', async () => {
    const res = await fetch(`${BASE}/files/upload-stream`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'X-File-Name': 'stream-file.txt', 'X-Dir-Path': 'stream-test' },
      body: Buffer.from('hello streaming upload'),
    })
    assert(res.ok, `状态码 ${res.status}`)
  })

  await test('GET /files/list - 验证流式上传', async () => {
    const { data } = await api('GET', '/files/list?path=stream-test', null, auth(adminToken))
    assert(data.files.some((f: any) => f.name === 'stream-file.txt'), '未找到文件')
  })

  await api('POST', '/files/delete', { path: 'stream-test', poolId: testPoolId, permanent: true }, auth(adminToken))
}

// ==================== 9. 断点续传 ====================
async function testChunkedUpload() {
  console.log(cyan('\n━━━ 9. 断点续传 API ━━━'))

  const chunkSize = 1024
  const totalChunks = 3
  const fileContent = Buffer.alloc(chunkSize * totalChunks)
  for (let i = 0; i < fileContent.length; i++) fileContent[i] = i % 256
  const totalSize = fileContent.length

  await test('POST /files/upload/init - 初始化', async () => {
    const { status, data } = await api('POST', '/files/upload/init', {
      fileName: 'chunked.txt', fileSize: totalSize, dirPath: 'chunk-test'
    }, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    uploadId = data.uploadId
  })

  for (let i = 0; i < totalChunks; i++) {
    await test(`PATCH /files/upload/:id/chunk - 分片 ${i + 1}`, async () => {
      const start = i * chunkSize
      const end = start + chunkSize - 1
      const res = await fetch(`${BASE}/files/upload/${uploadId}/chunk`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Range': `bytes ${start}-${end}/${totalSize}` },
        body: fileContent.subarray(start, end + 1),
      })
      assert(res.ok, `状态码 ${res.status}`)
    })
  }

  await test('POST /files/upload/:id/complete - 完成', async () => {
    const { status, data } = await api('POST', `/files/upload/${uploadId}/complete`, null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    assert(data.path, '缺少 path')
  })

  await test('下载验证合并文件', async () => {
    const res = await fetch(`${BASE}/files/download?path=chunk-test/chunked.txt`, { headers: { Authorization: `Bearer ${adminToken}` } })
    const downloaded = Buffer.from(await res.arrayBuffer())
    assert(downloaded.length === totalSize, `大小不匹配: ${downloaded.length}`)
    assert(downloaded.equals(fileContent), '内容不匹配')
  })

  await api('POST', '/files/delete', { path: 'chunk-test', poolId: testPoolId, permanent: true }, auth(adminToken))
}

// ==================== 10. API Key ====================
async function testApiKeys() {
  console.log(cyan('\n━━━ 10. API Key API ━━━'))

  await test('POST /user/apikeys - 创建 API Key', async () => {
    const { status, data } = await api('POST', '/user/apikeys', { name: '测试Key', permissions: 'read,write,delete' }, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    apiKey = data.key
  })

  await test('GET /files/list - API Key 认证', async () => {
    const { status } = await api('GET', '/files/list', null, { 'X-API-Key': apiKey })
    assert(status === 200, `状态码 ${status}`)
  })

  await test('DELETE /user/apikeys/:id - 删除', async () => {
    const keys = await api('GET', '/user/apikeys', null, auth(adminToken))
    for (const key of keys.data.keys) {
      await api('DELETE', `/user/apikeys/${key.id}`, null, auth(adminToken))
    }
    const { data } = await api('GET', '/user/apikeys', null, auth(adminToken))
    assert(data.keys.length === 0, '未全部删除')
  })
}

// ==================== 11. 用户设置 ====================
async function testUserSettings() {
  console.log(cyan('\n━━━ 11. 用户设置 API ━━━'))

  await test('GET /user/settings - 获取设置', async () => {
    const { status, data } = await api('GET', '/user/settings', null, auth(userToken))
    assert(status === 200, `状态码 ${status}`)
    assert(data.settings, '缺少 settings')
  })

  await test('PUT /user/settings - 更新设置', async () => {
    const { status } = await api('PUT', '/user/settings', { guestEnabled: true, guestPath: 'public', theme: 'dark' }, auth(userToken))
    assert(status === 200, `状态码 ${status}`)
  })

  await test('PUT /user/settings - 恢复默认', async () => {
    const { status } = await api('PUT', '/user/settings', { guestEnabled: false, guestPath: '', theme: 'system' }, auth(userToken))
    assert(status === 200, `状态码 ${status}`)
  })
}

// ==================== 12. 用户信息（含存储配额） ====================
async function testUserInfo() {
  console.log(cyan('\n━━━ 12. 用户信息 API（含配额） ━━━'))

  await test('GET /user/info - 获取用户信息含存储配额', async () => {
    const { status, data } = await api('GET', '/user/info', null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    assert(data.user.storage, '缺少 storage')
    assert(typeof data.user.storage.quota === 'number', '缺少 quota')
    assert(typeof data.user.storage.used === 'number', '缺少 used')
    assert(typeof data.user.storage.remaining === 'number', '缺少 remaining')
    console.log(yellow(`  配额: ${data.user.storage.quotaFormatted}, 已用: ${data.user.storage.usedFormatted}`))
  })
}

// ==================== 13. 访客 ====================
async function testGuest() {
  console.log(cyan('\n━━━ 13. 访客 API ━━━'))

  const userPools = await api('GET', '/storage-pools', null, auth(userToken))
  if (!userPools.data?.pools?.length) {
    await api('POST', '/storage-pools', { name: 'testuser本地存储', storageType: 'local', config: {} }, auth(userToken))
  }
  const poolsRes = await api('GET', '/storage-pools', null, auth(userToken))
  const defaultPool = poolsRes.data.pools.find((p: any) => p.isDefault) || poolsRes.data.pools[0]
  if (!defaultPool.isDefault) {
    await api('POST', `/storage-pools/${defaultPool.id}/set-default`, null, auth(userToken))
  }

  await api('PUT', '/user/settings', { guestEnabled: true }, auth(userToken))
  await api('POST', '/files/mkdir', { path: 'guest-test' }, auth(userToken))
  await fetch(`${BASE}/files/upload?path=guest-test&poolId=${defaultPool.id}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${userToken}` },
    body: (() => { const fd = new FormData(); fd.append('file', new Blob(['guest test']), 'guest-file.txt'); return fd })()
  })

  let guestShareId = 0
  await test('POST /user/guest-shares - 创建访客分享', async () => {
    const { status, data } = await api('POST', '/user/guest-shares', {
      folderPath: 'guest-test', storagePoolId: defaultPool.id, label: '测试文件夹', permissions: 'read,write,delete,edit'
    }, auth(userToken))
    assert(status === 200, `状态码 ${status}`)
    guestShareId = data.share.id
  })

  await test('GET /guest - 访客用户列表', async () => {
    const { status, data } = await api('GET', '/guest')
    assert(status === 200, `状态码 ${status}`)
    assert(data.users.some((u: any) => u.username === 'testuser'), '未找到 testuser')
  })

  await test('GET /guest/testuser/:shareId/list - 访客文件列表', async () => {
    const { status, data } = await api('GET', `/guest/testuser/${guestShareId}/list`)
    assert(status === 200, `状态码 ${status}`)
    assert(data.files.some((f: any) => f.name === 'guest-file.txt'), '未找到文件')
    assert(data.permissions === 'read,write,delete,edit', '权限不匹配')
  })

  await test('POST /guest/:username/:shareId/mkdir - 访客创建文件夹', async () => {
    const { status } = await api('POST', `/guest/testuser/${guestShareId}/mkdir`, { path: 'guest-folder' })
    assert(status === 200, `状态码 ${status}`)
  })

  await test('POST /guest/:username/:shareId/rename - 访客重命名', async () => {
    const { status } = await api('POST', `/guest/testuser/${guestShareId}/rename`, { path: 'guest-file.txt', newName: 'renamed.txt' })
    assert(status === 200, `状态码 ${status}`)
  })

  await test('GET /guest/:username/:shareId/preview - 访客预览', async () => {
    const res = await fetch(`${BASE}/guest/testuser/${guestShareId}/preview?path=renamed.txt`)
    assert(res.ok, `预览失败: ${res.status}`)
  })

  await test('POST /guest/:username/:shareId/delete - 访客删除', async () => {
    const { status } = await api('POST', `/guest/testuser/${guestShareId}/delete`, { path: 'renamed.txt' })
    assert(status === 200, `状态码 ${status}`)
  })

  await test('PUT /user/guest-shares/:id - 降级为只读', async () => {
    const { status } = await api('PUT', `/user/guest-shares/${guestShareId}`, { permissions: 'read' }, auth(userToken))
    assert(status === 200, `状态码 ${status}`)
  })

  await test('POST /guest/:username/:shareId/mkdir - 无写入权限应 403', async () => {
    const { status } = await api('POST', `/guest/testuser/${guestShareId}/mkdir`, { path: 'should-fail' })
    assert(status === 403, `状态码 ${status}`)
  })

  // 清理
  const shares = await api('GET', '/user/guest-shares', null, auth(userToken))
  for (const s of shares.data.shares) {
    await api('DELETE', `/user/guest-shares/${s.id}`, null, auth(userToken))
  }
  await api('PUT', '/user/settings', { guestEnabled: false }, auth(userToken))
  await api('POST', '/files/delete', { path: 'guest-test', poolId: defaultPool.id, permanent: true }, auth(userToken))
}

// ==================== 14. 管理面板 ====================
async function testAdmin() {
  console.log(cyan('\n━━━ 14. 管理 API ━━━'))

  await test('GET /admin/users - 用户列表含存储用量', async () => {
    const { status, data } = await api('GET', '/admin/users', null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    assert(data.users.length >= 2, '用户数量不正确')
    const admin = data.users.find((u: any) => u.username === 'admin')
    assert(typeof admin.storage_quota === 'number', '缺少 storage_quota')
    assert(typeof admin.storage_used === 'number', '缺少 storage_used')
    console.log(yellow(`  admin 配额: ${admin.storage_quota}, 已用: ${admin.storage_used}`))
  })

  await test('GET /admin/users/:id - 用户详情含配额', async () => {
    const { status, data } = await api('GET', `/admin/users/${testUserId}`, null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    assert(data.user.storage, '缺少 storage')
    assert(typeof data.user.storage.quota === 'number', '缺少 quota')
  })

  await test('PUT /admin/users/:id/quota - 调整配额', async () => {
    const { status } = await api('PUT', `/admin/users/${testUserId}/quota`, { quota: 5368709120 }, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
  })

  await test('GET /admin/users - 验证配额已更新', async () => {
    const { data } = await api('GET', '/admin/users', null, auth(adminToken))
    const tu = data.users.find((u: any) => u.username === 'testuser')
    assert(tu.storage_quota === 5368709120, `配额不匹配: ${tu.storage_quota}`)
    console.log(yellow(`  testuser 新配额: ${tu.storage_quota} (5GB)`))
  })

  // ---- 配额超限测试 ----
  let originalQuota = 0
  await test('配额超限准备 - 获取当前配额', async () => {
    const { data } = await api('GET', `/admin/users/${testUserId}`, null, auth(adminToken))
    originalQuota = data.user.storage.quota
    assert(originalQuota > 0, `配额获取失败: ${originalQuota}`)
    console.log(yellow(`  当前配额: ${originalQuota}`))
  })

  await test('配额超限准备 - 设置极小配额 (100B)', async () => {
    const { status } = await api('PUT', `/admin/users/${testUserId}/quota`, { quota: 100 }, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
  })

  await test('POST /files/upload - 配额超限应返回 400', async () => {
    const pools = await api('GET', '/storage-pools', null, auth(userToken))
    const pool = pools.data.pools.find((p: any) => p.isDefault) || pools.data.pools[0]
    const fd = new FormData()
    fd.append('file', new Blob(['x'.repeat(200)]), 'quota-test.txt')
    const res = await fetch(`${BASE}/files/upload?path=/&poolId=${pool.id}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${userToken}` },
      body: fd,
    })
    const data = await res.json().catch(() => null)
    assert(res.status === 400, `期望 400，实际 ${res.status}`)
    assert(data?.error?.includes('存储空间不足'), `错误信息不匹配: ${data?.error}`)
    console.log(yellow(`  返回: ${res.status} - ${data.error}`))
  })

  await test('配额恢复 - 还原原始配额', async () => {
    const { status } = await api('PUT', `/admin/users/${testUserId}/quota`, { quota: originalQuota }, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
  })

  await test('POST /admin/users - 创建用户', async () => {
    const { status, data } = await api('POST', '/admin/users', { username: 'admin-created', password: 'admin123456', role: 'user' }, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
  })

  await test('PUT /admin/users/:id/ban - 封禁用户', async () => {
    const users = await api('GET', '/admin/users', null, auth(adminToken))
    const created = users.data.users.find((u: any) => u.username === 'admin-created')
    const { status, data } = await api('PUT', `/admin/users/${created.id}/ban`, null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    assert(data.banned === true, '应为已封禁')
  })

  await test('POST /auth/login - 封禁用户登录应 403', async () => {
    const { status } = await api('POST', '/auth/login', { username: 'admin-created', password: 'admin123456' })
    assert(status === 403, `应为 403, 实际 ${status}`)
  })

  await test('PUT /admin/users/:id/ban - 不能封禁管理员', async () => {
    const users = await api('GET', '/admin/users', null, auth(adminToken))
    const admin = users.data.users.find((u: any) => u.username === 'admin')
    const { status } = await api('PUT', `/admin/users/${admin.id}/ban`, null, auth(adminToken))
    assert(status === 400, `应为 400, 实际 ${status}`)
  })

  await test('PUT /admin/users/:id/ban - 解封', async () => {
    const users = await api('GET', '/admin/users', null, auth(adminToken))
    const created = users.data.users.find((u: any) => u.username === 'admin-created')
    const { status } = await api('PUT', `/admin/users/${created.id}/ban`, null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
  })

  await test('PUT /admin/users/:id/password - 重置密码', async () => {
    const users = await api('GET', '/admin/users', null, auth(adminToken))
    const created = users.data.users.find((u: any) => u.username === 'admin-created')
    const { status } = await api('PUT', `/admin/users/${created.id}/password`, { password: 'newpass123456' }, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    const { status: loginStatus } = await api('POST', '/auth/login', { username: 'admin-created', password: 'newpass123456' })
    assert(loginStatus === 200, `新密码登录失败: ${loginStatus}`)
  })

  await test('PUT /admin/users/:id/role - 修改角色', async () => {
    const users = await api('GET', '/admin/users', null, auth(adminToken))
    const created = users.data.users.find((u: any) => u.username === 'admin-created')
    const { status } = await api('PUT', `/admin/users/${created.id}/role`, { role: 'user' }, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
  })

  await test('GET /admin/users - 普通用户无权限应 403', async () => {
    const { status } = await api('GET', '/admin/users', null, auth(userToken))
    assert(status === 403, `状态码 ${status}`)
  })
}

// ==================== 15. 主题 API ====================
async function testThemes() {
  console.log(cyan('\n━━━ 15. 主题 API ━━━'))

  await test('GET /themes/list - 主题列表', async () => {
    const { status, data } = await api('GET', '/themes/list')
    assert(status === 200, `状态码 ${status}`)
    assert(Array.isArray(data.themes), '返回非数组')
    console.log(yellow(`  主题数量: ${data.themes.length}`))
  })

  await test('GET /themes/styles - 已启用主题样式', async () => {
    const { status, data } = await api('GET', '/themes/styles')
    assert(status === 200, `状态码 ${status}`)
    assert(Array.isArray(data.styles), '返回非数组')
  })

  await test('PUT /themes/:name/toggle - 切换主题', async () => {
    const themes = await api('GET', '/themes/list')
    if (themes.data.themes.length > 0) {
      const theme = themes.data.themes[0]
      const { status } = await api('PUT', `/themes/${theme.name}/toggle`, { enabled: !theme.enabled }, auth(adminToken))
      assert(status === 200, `状态码 ${status}`)
      // 切回
      await api('PUT', `/themes/${theme.name}/toggle`, { enabled: theme.enabled }, auth(adminToken))
    }
  })

  await test('PUT /themes/:name/toggle - 无认证应 401', async () => {
    const themes = await api('GET', '/themes/list')
    if (themes.data.themes.length > 0) {
      const { status } = await api('PUT', `/themes/${themes.data.themes[0].name}/toggle`, { enabled: true })
      assert(status === 401, `状态码 ${status}`)
    }
  })
}

// ==================== 16. IP 黑名单/白名单 ====================
async function testIpBlacklist() {
  console.log(cyan('\n━━━ 16. IP 黑名单/白名单 ━━━'))

  await test('GET /admin/ip-list/mode - 获取模式', async () => {
    const { status, data } = await api('GET', '/admin/ip-list/mode', null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    assert(['blacklist', 'whitelist'].includes(data.mode), `无效模式: ${data.mode}`)
  })

  const modeRes = await api('GET', '/admin/ip-list/mode', null, auth(adminToken))
  if (modeRes.data.mode === 'whitelist') {
    await api('PUT', '/admin/ip-list/mode', { mode: 'blacklist' }, auth(adminToken))
  }

  const listRes = await api('GET', '/admin/ip-blacklist', null, auth(adminToken))
  for (const entry of listRes.data.entries) {
    await api('DELETE', `/admin/ip-blacklist/${entry.id}`, null, auth(adminToken))
  }

  await test('POST /admin/ip-blacklist - 添加条目', async () => {
    const { status, data } = await api('POST', '/admin/ip-blacklist', { ip_pattern: '10.0.0.1', reason: '测试' }, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
  })

  await test('POST /admin/ip-blacklist - 重复应 409', async () => {
    const { status } = await api('POST', '/admin/ip-blacklist', { ip_pattern: '10.0.0.1' }, auth(adminToken))
    assert(status === 409, `状态码 ${status}`)
  })

  await test('POST /admin/ip-blacklist - 无效 IP 应 400', async () => {
    const { status } = await api('POST', '/admin/ip-blacklist', { ip_pattern: 'not-an-ip' }, auth(adminToken))
    assert(status === 400, `状态码 ${status}`)
  })

  await test('PUT /admin/ip-list/mode - 切换白名单', async () => {
    const { status } = await api('PUT', '/admin/ip-list/mode', { mode: 'whitelist' }, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
  })

  await test('GET /admin/ip-blacklist - 白名单含默认 IP', async () => {
    const { data } = await api('GET', '/admin/ip-blacklist', null, auth(adminToken))
    const patterns = data.entries.map((e: any) => e.ip_pattern)
    assert(patterns.includes('127.0.0.1'), '缺少 127.0.0.1')
  })

  await test('DELETE /admin/ip-blacklist/:id - 127.0.0.1 不可删', async () => {
    const list = await api('GET', '/admin/ip-blacklist', null, auth(adminToken))
    const entry = list.data.entries.find((e: any) => e.ip_pattern === '127.0.0.1')
    const { status } = await api('DELETE', `/admin/ip-blacklist/${entry.id}`, null, auth(adminToken))
    assert(status === 400, `应为 400, 实际 ${status}`)
  })

  // 切回黑名单
  await api('PUT', '/admin/ip-list/mode', { mode: 'blacklist' }, auth(adminToken))
  const finalList = await api('GET', '/admin/ip-blacklist', null, auth(adminToken))
  for (const entry of finalList.data.entries) {
    await api('DELETE', `/admin/ip-blacklist/${entry.id}`, null, auth(adminToken))
  }
}

// ==================== 17. 封禁用户 API Key ====================
async function testBannedApiKey() {
  console.log(cyan('\n━━━ 17. 封禁用户 API Key ━━━'))

  await api('POST', '/admin/users', { username: 'banned-api-user', password: 'test123456' }, auth(adminToken))
  const users = await api('GET', '/admin/users', null, auth(adminToken))
  const bannedUser = users.data.users.find((u: any) => u.username === 'banned-api-user')
  const bannedLogin = await api('POST', '/auth/login', { username: 'banned-api-user', password: 'test123456' })
  const bannedToken = bannedLogin.data.token

  await test('创建并使用 API Key', async () => {
    const { data } = await api('POST', '/user/apikeys', { name: 'banned-key', permissions: 'read' }, auth(bannedToken))
    bannedApiKey = data.key
    const { status } = await api('GET', '/files/list', null, { 'X-API-Key': bannedApiKey })
    assert(status === 200, `状态码 ${status}`)
  })

  await test('封禁后 API Key 应 403', async () => {
    await api('PUT', `/admin/users/${bannedUser.id}/ban`, null, auth(adminToken))
    const { status } = await api('GET', '/files/list', null, { 'X-API-Key': bannedApiKey })
    assert(status === 403, `应为 403, 实际 ${status}`)
  })

  // 清理
  await api('PUT', `/admin/users/${bannedUser.id}/ban`, null, auth(adminToken))
  await api('DELETE', `/admin/users/${bannedUser.id}`, null, auth(adminToken))
}

// ==================== 18. 匿名公网访问 ====================
async function testPublicAccess() {
  console.log(cyan('\n━━━ 18. 匿名公网访问 API ━━━'))

  const userPools = await api('GET', '/storage-pools', null, auth(userToken))
  if (!userPools.data?.pools?.length) {
    await api('POST', '/storage-pools', { name: 'testuser本地存储', storageType: 'local', config: {} }, auth(userToken))
  }
  const poolsRes = await api('GET', '/storage-pools', null, auth(userToken))
  const defaultPool = poolsRes.data.pools.find((p: any) => p.isDefault) || poolsRes.data.pools[0]
  if (!defaultPool.isDefault) {
    await api('POST', `/storage-pools/${defaultPool.id}/set-default`, null, auth(userToken))
  }

  await api('PUT', '/user/settings', { guestEnabled: true, guestPath: 'public' }, auth(userToken))
  await api('POST', '/files/mkdir', { path: 'public' }, auth(userToken))
  await fetch(`${BASE}/files/upload?path=public&poolId=${defaultPool.id}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${userToken}` },
    body: (() => { const fd = new FormData(); fd.append('file', new Blob(['public test']), 'public-test.txt'); return fd })()
  })

  await test('GET /f/:username/* - 访问成功', async () => {
    const res = await rawApi('GET', `${PUBLIC_BASE}/f/testuser/public-test.txt`)
    assert(res.status === 200, `状态码 ${res.status}`)
    assert(res.data === 'public test', '内容不匹配')
  })

  await test('GET /f/:username/* - 路径越权应 403', async () => {
    const res = await rawApi('GET', `${PUBLIC_BASE}/f/testuser/..%2F..%2F..%2Fetc%2Fpasswd`)
    assert(res.status === 403 || res.status === 404, `状态码 ${res.status}`)
  })

  await api('PUT', '/user/settings', { guestEnabled: false }, auth(userToken))
  await api('POST', '/files/delete', { path: 'public', poolId: defaultPool.id, permanent: true }, auth(userToken))
}

// ==================== 19. 清理 ====================
async function testCleanup() {
  console.log(cyan('\n━━━ 19. 清理 ━━━'))

  await test('删除测试用户', async () => {
    const users = await api('GET', '/admin/users', null, auth(adminToken))
    for (const u of users.data.users) {
      if (['testuser', 'emailuser', 'admin-created', 'banned-api-user'].includes(u.username)) {
        if (u.banned) await api('PUT', `/admin/users/${u.id}/ban`, null, auth(adminToken))
        await api('DELETE', `/admin/users/${u.id}`, null, auth(adminToken))
      }
    }
    const after = await api('GET', '/admin/users', null, auth(adminToken))
    assert(!after.data.users.some((u: any) => u.username === 'testuser'), 'testuser 未删除')
  })

  await test('清理 IP 黑名单', async () => {
    await api('PUT', '/admin/ip-list/mode', { mode: 'blacklist' }, auth(adminToken))
    const list = await api('GET', '/admin/ip-blacklist', null, auth(adminToken))
    for (const entry of list.data.entries) {
      await api('DELETE', `/admin/ip-blacklist/${entry.id}`, null, auth(adminToken))
    }
  })
}

// ==================== 主流程 ====================
async function main() {
  console.log(cyan('╔═══════════════════════════════════════════╗'))
  console.log(cyan('║   VueFileManager API 全流程测试 v2        ║'))
  console.log(cyan('╚═══════════════════════════════════════════╝'))

  try {
    await testAuth()
    await testSiteConfig()
    await testStoragePools()
    await testFiles()
    await testTrash()
    await testFavourites()
    await testShare()
    await testUploadStream()
    await testChunkedUpload()
    await testApiKeys()
    await testUserSettings()
    await testUserInfo()
    await testGuest()
    await testAdmin()
    await testThemes()
    await testIpBlacklist()
    await testBannedApiKey()
    await testPublicAccess()
    await testCleanup()
  } catch (err: any) {
    console.error(red(`\n测试执行出错: ${err.message}`))
  }

  console.log(cyan('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'))
  console.log(`  通过: ${passed}  失败: ${failed}  总计: ${passed + failed}`)
  console.log(cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'))

  if (failed > 0) process.exit(1)
}

main()
