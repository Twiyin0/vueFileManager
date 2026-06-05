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

// 颜色输出
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

// 带完整 URL 的请求（用于公开路由等非 /api 路径）
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

// ==================== 2. 存储池 ====================
async function testStoragePools() {
  console.log(cyan('\n━━━ 2. 存储池 API ━━━'))

  await test('GET /storage-pools - 获取存储池列表', async () => {
    const { status, data } = await api('GET', '/storage-pools', null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    assert(Array.isArray(data.pools), '返回非数组')
    assert(data.pools.length > 0, '存储池为空')
    // 验证 camelCase 字段
    const pool = data.pools[0]
    assert(typeof pool.storageType === 'string', `storageType 字段缺失: ${JSON.stringify(pool)}`)
    assert(typeof pool.isDefault === 'boolean', `isDefault 字段缺失`)
    testPoolId = pool.id
    console.log(yellow(`  默认存储池: ${pool.name} (${pool.storageType}) id=${pool.id}`))
  })

  await test('POST /storage-pools - 创建新存储池', async () => {
    const { status, data } = await api('POST', '/storage-pools', {
      name: '测试本地存储',
      storageType: 'local',
      config: { localPath: './test-uploads' }
    }, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    assert(data.pool.id, '缺少 pool id')
  })

  await test('GET /storage-pools - 验证新存储池', async () => {
    const { status, data } = await api('GET', '/storage-pools', null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    assert(data.pools.length >= 2, `存储池数量不正确: ${data.pools.length}`)
    const testPool = data.pools.find((p: any) => p.name === '测试本地存储')
    assert(testPool, '未找到新建的存储池')
    assert(testPool.storageType === 'local', '存储类型不正确')
    assert(testPool.isDefault === false, '不应是默认')
  })

  await test('PUT /storage-pools/:id - 更新存储池名称', async () => {
    const pools = await api('GET', '/storage-pools', null, auth(adminToken))
    const testPool = pools.data.pools.find((p: any) => p.name === '测试本地存储')
    const { status } = await api('PUT', `/storage-pools/${testPool.id}`, {
      name: '测试存储-已改名'
    }, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
  })

  await test('POST /storage-pools/:id/set-default - 设为默认', async () => {
    const pools = await api('GET', '/storage-pools', null, auth(adminToken))
    const testPool = pools.data.pools.find((p: any) => p.name === '测试存储-已改名')
    const { status } = await api('POST', `/storage-pools/${testPool.id}/set-default`, null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)

    // 验证切换
    const after = await api('GET', '/storage-pools', null, auth(adminToken))
    const newDefault = after.data.pools.find((p: any) => p.isDefault === true)
    assert(newDefault.id === testPool.id, '默认存储池切换失败')
  })

  await test('POST /storage-pools/:id/set-default - 切回原默认', async () => {
    const { status } = await api('POST', `/storage-pools/${testPoolId}/set-default`, null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
  })

  await test('POST /storage-pools/:id/test - 测试连接', async () => {
    const { status, data } = await api('POST', `/storage-pools/${testPoolId}/test`, null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    assert(data.success === true, `测试失败: ${data.message}`)
  })

  await test('DELETE /storage-pools/:id - 删除非默认存储池', async () => {
    const pools = await api('GET', '/storage-pools', null, auth(adminToken))
    const testPool = pools.data.pools.find((p: any) => p.name === '测试存储-已改名')
    const { status } = await api('DELETE', `/storage-pools/${testPool.id}`, null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
  })

  await test('DELETE /storage-pools/:id - 删除默认存储池应 400', async () => {
    const { status } = await api('DELETE', `/storage-pools/${testPoolId}`, null, auth(adminToken))
    assert(status === 400, `状态码 ${status}`)
  })
}

// ==================== 3. 文件操作 ====================
async function testFiles() {
  console.log(cyan('\n━━━ 3. 文件 API ━━━'))

  await test('POST /files/mkdir - 创建文件夹', async () => {
    const { status } = await api('POST', '/files/mkdir', { path: 'test-dir' }, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
  })

  await test('GET /files/list - 根目录列表（返回存储池虚拟文件夹）', async () => {
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

  await test('GET /files/list?path= - 子目录列表', async () => {
    const { status, data } = await api('GET', '/files/list?path=test-dir', null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    assert(Array.isArray(data.files), '返回非数组')
  })

  await test('POST /files/mkdir - 创建子文件夹', async () => {
    const { status } = await api('POST', '/files/mkdir', { path: 'test-dir/sub-dir' }, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
  })

  await test('POST /files/rename - 重命名文件夹', async () => {
    const { status } = await api('POST', '/files/rename', { path: 'test-dir/sub-dir', newName: 'sub-dir-v2' }, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
  })

  await test('POST /files/mkdir - 创建用于复制的源', async () => {
    const { status } = await api('POST', '/files/mkdir', { path: 'test-dir/copy-src' }, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
  })

  await test('POST /files/copy - 复制文件夹', async () => {
    const { status } = await api('POST', '/files/copy', { src: 'test-dir/copy-src', dest: 'test-dir/copy-dst' }, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
  })

  await test('POST /files/move - 移动文件夹', async () => {
    const { status } = await api('POST', '/files/move', { src: 'test-dir/copy-dst', dest: 'test-dir/moved' }, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
  })

  await test('GET /files/search - 搜索文件', async () => {
    const { status, data } = await api('GET', '/files/search?q=test', null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    assert(Array.isArray(data.files), '返回非数组')
    assert(data.files.length > 0, '搜索结果为空')
  })

  await test('GET /files/info - 获取文件信息', async () => {
    const { status, data } = await api('GET', '/files/info?path=test-dir', null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    assert(data.info, '缺少 info')
    console.log(yellow(`  test-dir: type=${data.info.type}`))
  })

  await test('GET /files/storage-stats - 存储空间统计', async () => {
    const { status, data } = await api('GET', '/files/storage-stats', null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    assert(typeof data.totalSize === 'number', '缺少 totalSize')
    console.log(yellow(`  统计: ${data.fileCount} 文件, ${data.folderCount} 文件夹, ${data.totalSize} bytes`))
  })

  await test('POST /files/batch-delete - 批量删除', async () => {
    // 先创建几个
    await api('POST', '/files/mkdir', { path: 'test-dir/batch-a' }, auth(adminToken))
    await api('POST', '/files/mkdir', { path: 'test-dir/batch-b' }, auth(adminToken))
    const { status, data } = await api('POST', '/files/batch-delete', {
      paths: ['test-dir/batch-a', 'test-dir/batch-b'],
      permanent: true
    }, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
  })

  await test('DELETE /files/delete - 删除到回收站', async () => {
    const { status } = await api('DELETE', '/files/delete?path=test-dir/moved', null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
  })

  await test('DELETE /files/delete - 永久删除', async () => {
    const { status } = await api('DELETE', '/files/delete?path=test-dir/copy-src&permanent=true', null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
  })

  await test('DELETE /files/delete - 清理测试文件夹', async () => {
    const { status } = await api('DELETE', '/files/delete?path=test-dir&permanent=true', null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
  })
}

// ==================== 4. 回收站 ====================
async function testTrash() {
  console.log(cyan('\n━━━ 4. 回收站 API ━━━'))

  // 先创建并删除一个文件到回收站
  await api('POST', '/files/mkdir', { path: 'trash-test-dir' }, auth(adminToken))
  await api('DELETE', '/files/delete?path=trash-test-dir', null, auth(adminToken))

  await test('GET /trash - 回收站列表', async () => {
    const { status, data } = await api('GET', '/trash', null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    assert(Array.isArray(data.items), '返回非数组')
    assert(data.items.length > 0, '回收站为空')
    console.log(yellow(`  回收站项目: ${data.items.length}`))
  })

  await test('POST /trash/:id/restore - 恢复文件', async () => {
    const trash = await api('GET', '/trash', null, auth(adminToken))
    const item = trash.data.items[0]
    const { status } = await api('POST', `/trash/${item.id}/restore`, null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
  })

  await test('DELETE /trash/:id - 永久删除回收站项目', async () => {
    // 再删除一次到回收站
    await api('DELETE', '/files/delete?path=trash-test-dir', null, auth(adminToken))
    const trash = await api('GET', '/trash', null, auth(adminToken))
    const item = trash.data.items[0]
    const { status } = await api('DELETE', `/trash/${item.id}`, null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
  })

  await test('DELETE /trash - 清空回收站', async () => {
    // 再创建几个并删除
    await api('POST', '/files/mkdir', { path: 'trash-a' }, auth(adminToken))
    await api('POST', '/files/mkdir', { path: 'trash-b' }, auth(adminToken))
    await api('DELETE', '/files/delete?path=trash-a', null, auth(adminToken))
    await api('DELETE', '/files/delete?path=trash-b', null, auth(adminToken))

    const { status } = await api('DELETE', '/trash', null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)

    // 验证清空
    const trash = await api('GET', '/trash', null, auth(adminToken))
    assert(trash.data.items.length === 0, '回收站未清空')
  })
}

// ==================== 5. 收藏 ====================
async function testFavourites() {
  console.log(cyan('\n━━━ 5. 收藏 API ━━━'))

  // 创建测试文件夹
  await api('POST', '/files/mkdir', { path: 'fav-test-dir' }, auth(adminToken))

  await test('POST /favourites - 添加收藏', async () => {
    const { status } = await api('POST', '/favourites', {
      filePath: 'fav-test-dir',
      fileName: 'fav-test-dir',
      fileType: 'folder',
      storagePoolId: testPoolId
    }, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
  })

  await test('GET /favourites/check - 检查是否已收藏', async () => {
    const { status, data } = await api('GET', `/favourites/check?filePath=fav-test-dir&storagePoolId=${testPoolId}`, null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    assert(data.isFavourited === true, '应为已收藏')
  })

  await test('GET /favourites - 收藏列表', async () => {
    const { status, data } = await api('GET', '/favourites', null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    assert(Array.isArray(data.items), '返回非数组')
    assert(data.items.length > 0, '收藏列表为空')
  })

  await test('DELETE /favourites - 取消收藏', async () => {
    const { status } = await api('DELETE', `/favourites?filePath=fav-test-dir&storagePoolId=${testPoolId}`, null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)

    // 验证取消
    const check = await api('GET', `/favourites/check?filePath=fav-test-dir&storagePoolId=${testPoolId}`, null, auth(adminToken))
    assert(check.data.isFavourited === false, '应为未收藏')
  })

  // 清理
  await api('DELETE', '/files/delete?path=fav-test-dir&permanent=true', null, auth(adminToken))
}

// ==================== 6. 分享（含 signToken） ====================
async function testShare() {
  console.log(cyan('\n━━━ 6. 分享 API（signToken 鉴权） ━━━'))

  // 先上传一个测试文件用于下载测试
  await api('POST', '/files/mkdir', { path: 'share-test' }, auth(adminToken))
  const testContent = Buffer.from('hello share test')
  const uploadRes = await fetch(`${BASE}/files/upload?path=share-test`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: (() => { const fd = new FormData(); fd.append('file', new Blob([testContent]), 'test.txt'); return fd })()
  })
  assert(uploadRes.ok, '上传测试文件失败')

  await test('POST /share/create - 创建分享（返回 signKey 和 signUrl）', async () => {
    const { status, data } = await api('POST', '/share/create', {
      filePath: 'share-test/test.txt',
      fileType: 'file',
      expiresIn: 24,
      maxDownloads: 100
    }, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    assert(data.shareCode, '缺少 shareCode')
    assert(data.signKey, '缺少 signKey')
    assert(data.signUrl, '缺少 signUrl')
    shareCode = data.shareCode
    signKey = data.signKey
    signUrl = data.signUrl
    console.log(yellow(`  shareCode: ${shareCode}, signKey: ${signKey}`))
  })

  await test('POST /share/create - 创建带密码分享', async () => {
    const { status, data } = await api('POST', '/share/create', {
      filePath: 'share-test/test.txt',
      fileType: 'file',
      password: '123456'
    }, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    assert(data.shareCode, '缺少 shareCode')
    assert(data.signKey, '缺少 signKey')
  })

  await test('GET /share/list - 我的分享列表（含 signUrl）', async () => {
    const { status, data } = await api('GET', '/share/list', null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    assert(Array.isArray(data.shares), '返回非数组')
    assert(data.shares.length >= 2, `分享数量不正确: ${data.shares.length}`)
    assert(data.shares[0].signUrl, '列表中缺少 signUrl')
    assert(data.shares[0].sign_key, '列表中缺少 sign_key')
  })

  await test('GET /share/s/:code - 访问分享（查看信息）', async () => {
    const { status, data } = await api('GET', `/share/s/${shareCode}`)
    assert(status === 200, `状态码 ${status}`)
    assert(data.needPassword === false, '不应需要密码')
    assert(data.owner === 'admin', '分享者不正确')
  })

  await test('GET /share/download/:code - 无 signToken 应 403', async () => {
    const { status } = await api('GET', `/share/download/${shareCode}`)
    assert(status === 403, `状态码 ${status}`)
  })

  await test('GET /share/download/:code - 错误 signToken 应 403', async () => {
    const { status } = await api('GET', `/share/download/${shareCode}?sign=badbadbad&t=9999999999`)
    assert(status === 403, `状态码 ${status}`)
  })

  await test('GET /share/download/:code - 正确 signToken 下载成功', async () => {
    // 从 signUrl 提取 sign 和 t 参数，调用 API 下载端点
    const url = new URL(`${PUBLIC_BASE}${signUrl}`)
    const sign = url.searchParams.get('sign')
    const t = url.searchParams.get('t')
    const res = await fetch(`${BASE}/share/download/${shareCode}?sign=${sign}&t=${t}`)
    assert(res.ok, `下载失败: ${res.status}`)
    const text = await res.text()
    assert(text === 'hello share test', `内容不匹配: ${text}`)
  })

  await test('GET /share/preview/:code - 正确 signToken 预览成功', async () => {
    const t = signUrl.split('t=')[1]
    const sign = new URL(`${PUBLIC_BASE}${signUrl}`).searchParams.get('sign')
    const res = await fetch(`${BASE}/share/preview/${shareCode}?sign=${sign}&t=${t}`)
    assert(res.ok, `预览失败: ${res.status}`)
  })

  await test('GET /share/s/:code - 访问带密码分享（返回 needPassword）', async () => {
    const shares = await api('GET', '/share/list', null, auth(adminToken))
    const pwdShare = shares.data.shares.find((s: any) => s.password)
    if (pwdShare) {
      const { status, data } = await api('GET', `/share/s/${pwdShare.share_code}`)
      assert(status === 200, `状态码 ${status}`)
      assert(data.needPassword === true, '应需要密码')
    }
  })

  await test('DELETE /share/:id - 删除分享', async () => {
    const shares = await api('GET', '/share/list', null, auth(adminToken))
    for (const s of shares.data.shares) {
      await api('DELETE', `/share/${s.id}`, null, auth(adminToken))
    }
    const after = await api('GET', '/share/list', null, auth(adminToken))
    assert(after.data.shares.length === 0, '分享未全部删除')
  })

  // 清理
  await api('DELETE', '/files/delete?path=share-test&permanent=true', null, auth(adminToken))
}

// ==================== 7. 流式上传 ====================
async function testUploadStream() {
  console.log(cyan('\n━━━ 7. 流式上传 API ━━━'))

  await api('POST', '/files/mkdir', { path: 'stream-test' }, auth(adminToken))

  await test('POST /files/upload-stream - 流式上传文件', async () => {
    const content = Buffer.from('hello streaming upload test content')
    const res = await fetch(`${BASE}/files/upload-stream`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-File-Name': 'stream-file.txt',
        'X-Dir-Path': 'stream-test',
      },
      body: content,
    })
    const data = await res.json()
    assert(res.ok, `状态码 ${res.status}`)
    assert(data.path === 'stream-test/stream-file.txt', `路径不正确: ${data.path}`)
    assert(data.poolId, '缺少 poolId')
    assert(data.storageType, '缺少 storageType')
    console.log(yellow(`  上传结果: path=${data.path}, poolId=${data.poolId}, type=${data.storageType}`))
  })

  await test('POST /files/upload-stream - 无文件名应 400', async () => {
    const res = await fetch(`${BASE}/files/upload-stream`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: Buffer.from('test'),
    })
    assert(res.status === 400, `状态码 ${res.status}`)
  })

  // 验证文件已上传
  await test('GET /files/list - 验证流式上传文件存在', async () => {
    const { status, data } = await api('GET', '/files/list?path=stream-test', null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    assert(data.files.some((f: any) => f.name === 'stream-file.txt'), '未找到 stream-file.txt')
  })

  // 清理
  await api('DELETE', '/files/delete?path=stream-test&permanent=true', null, auth(adminToken))
}

// ==================== 8. 断点续传 ====================
async function testChunkedUpload() {
  console.log(cyan('\n━━━ 8. 断点续传 API ━━━'))

  const chunkSize = 1024 // 1KB 分片
  const totalChunks = 3
  const fileContent = Buffer.alloc(chunkSize * totalChunks)
  for (let i = 0; i < fileContent.length; i++) fileContent[i] = i % 256
  const totalSize = fileContent.length
  const fileName = 'chunked-file.txt'

  await test('POST /files/upload/init - 初始化分片上传', async () => {
    const { status, data } = await api('POST', '/files/upload/init', {
      fileName,
      fileSize: totalSize,
      dirPath: 'chunk-test',
    }, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    assert(data.uploadId, '缺少 uploadId')
    uploadId = data.uploadId
    console.log(yellow(`  uploadId: ${uploadId}`))
  })

  // 上传第一个分片
  await test('PATCH /files/upload/:id/chunk - 上传分片 1', async () => {
    const chunk = fileContent.subarray(0, chunkSize)
    const res = await fetch(`${BASE}/files/upload/${uploadId}/chunk`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Range': `bytes 0-${chunkSize - 1}/${totalSize}`,
      },
      body: chunk,
    })
    const data = await res.json()
    assert(res.ok, `状态码 ${res.status}`)
    assert(data.partIndex === 0, `分片索引不正确: ${data.partIndex}`)
    assert(data.uploadedParts.includes(0), '分片 0 未记录')
  })

  // 查询状态（断点续传场景）
  await test('GET /files/upload/:id/status - 查询已上传分片', async () => {
    const { status, data } = await api('GET', `/files/upload/${uploadId}/status`, null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    assert(data.fileName === fileName, '文件名不匹配')
    assert(data.uploadedParts.includes(0), '分片 0 未记录')
    console.log(yellow(`  已上传分片: ${JSON.stringify(data.uploadedParts)}`))
  })

  // 上传剩余分片
  for (let i = 1; i < totalChunks; i++) {
    await test(`PATCH /files/upload/:id/chunk - 上传分片 ${i + 1}`, async () => {
      const start = i * chunkSize
      const end = start + chunkSize - 1
      const chunk = fileContent.subarray(start, end + 1)
      const res = await fetch(`${BASE}/files/upload/${uploadId}/chunk`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Range': `bytes ${start}-${end}/${totalSize}`,
        },
        body: chunk,
      })
      assert(res.ok, `状态码 ${res.status}`)
    })
  }

  // 完成上传
  await test('POST /files/upload/:id/complete - 合并分片完成上传', async () => {
    const { status, data } = await api('POST', `/files/upload/${uploadId}/complete`, null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    assert(data.path, '缺少 path')
    assert(data.poolId, '缺少 poolId')
    assert(data.storageType, '缺少 storageType')
    console.log(yellow(`  完成: path=${data.path}, poolId=${data.poolId}, type=${data.storageType}`))
  })

  // 验证文件内容
  await test('POST /files/download - 下载验证合并后文件', async () => {
    const res = await fetch(`${BASE}/files/download?path=chunk-test/${fileName}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    assert(res.ok, `下载失败: ${res.status}`)
    const downloaded = Buffer.from(await res.arrayBuffer())
    console.log(yellow(`  期望大小: ${totalSize}, 实际大小: ${downloaded.length}`))
    assert(downloaded.length === totalSize, `文件大小不匹配: 期望 ${totalSize}, 实际 ${downloaded.length}`)
    assert(downloaded.equals(fileContent), '文件内容不匹配')
  })

  // 清理
  await api('DELETE', '/files/delete?path=chunk-test&permanent=true', null, auth(adminToken))
}

// ==================== 9. 匿名公网访问 ====================
async function testPublicAccess() {
  console.log(cyan('\n━━━ 9. 匿名公网访问 API ━━━'))

  // 确保 testuser 有默认存储池
  const userPools = await api('GET', '/storage-pools', null, auth(userToken))
  if (!userPools.data?.pools?.length) {
    await api('POST', '/storage-pools', {
      name: 'testuser本地存储',
      storageType: 'local',
      config: { localPath: './test-user-uploads' }
    }, auth(userToken))
  }
  // 确保存在默认存储池
  const poolsAfter = await api('GET', '/storage-pools', null, auth(userToken))
  const defaultPool = poolsAfter.data?.pools?.find((p: any) => p.isDefault)
  if (!defaultPool && poolsAfter.data?.pools?.length) {
    await api('POST', `/storage-pools/${poolsAfter.data.pools[0].id}/set-default`, null, auth(userToken))
  }

  // 开启 testuser 访客模式
  await api('PUT', '/user/settings', { guestEnabled: true, guestPath: 'public' }, auth(userToken))

  // 在 public 目录创建测试文件
  await api('POST', '/files/mkdir', { path: 'public' }, auth(userToken))
  const testContent = 'hello public access test'
  await fetch(`${BASE}/files/upload?path=public`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${userToken}` },
    body: (() => { const fd = new FormData(); fd.append('file', new Blob([testContent]), 'public-test.txt'); return fd })()
  })

  await test('GET /f/:username/* - 公网访问文件成功', async () => {
    const res = await rawApi('GET', `${PUBLIC_BASE}/f/testuser/public-test.txt`)
    assert(res.status === 200, `状态码 ${res.status}`)
    assert(res.data === testContent, `内容不匹配: ${res.data}`)
  })

  await test('GET /f/:username/* - 路径越权应 403', async () => {
    // 使用 URL 编码的 / 防止 fetch 和 Express 自动规范化路径
    const res = await rawApi('GET', `${PUBLIC_BASE}/f/testuser/..%2F..%2F..%2Fetc%2Fpasswd`)
    assert(res.status === 403 || res.status === 404, `状态码 ${res.status}`)
  })

  await test('GET /f/:username/* - 不存在的用户应 404', async () => {
    const res = await rawApi('GET', `${PUBLIC_BASE}/f/nouser123/file.txt`)
    assert(res.status === 404, `状态码 ${res.status}`)
  })

  await test('GET /f/:username/* - 访客模式关闭后应 403', async () => {
    await api('PUT', '/user/settings', { guestEnabled: false }, auth(userToken))
    const res = await rawApi('GET', `${PUBLIC_BASE}/f/testuser/public-test.txt`)
    assert(res.status === 403, `状态码 ${res.status}`)
  })

  // 清理
  await api('PUT', '/user/settings', { guestEnabled: false }, auth(userToken))
  await api('DELETE', '/files/delete?path=public&permanent=true', null, auth(userToken))
}

// ==================== 10. API Key ====================
async function testApiKeys() {
  console.log(cyan('\n━━━ 10. API Key API ━━━'))

  await test('POST /user/apikeys - 创建 API Key', async () => {
    const { status, data } = await api('POST', '/user/apikeys', {
      name: '测试Key', permissions: 'read,write,delete'
    }, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    assert(data.key, '缺少 key')
    apiKey = data.key
    console.log(yellow(`  API Key: ${apiKey.slice(0, 20)}...`))
  })

  await test('GET /user/apikeys - API Key 列表', async () => {
    const { status, data } = await api('GET', '/user/apikeys', null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    assert(Array.isArray(data.keys), '返回非数组')
    assert(data.keys.length > 0, '列表为空')
  })

  await test('GET /files/list - 使用 API Key 认证', async () => {
    const { status, data } = await api('GET', '/files/list', null, { 'X-API-Key': apiKey })
    assert(status === 200, `状态码 ${status}`)
    assert(Array.isArray(data.files), '返回非数组')
  })

  await test('POST /files/mkdir - API Key 创建文件夹', async () => {
    const { status } = await api('POST', '/files/mkdir', { path: 'apikey-test' }, { 'X-API-Key': apiKey })
    assert(status === 200, `状态码 ${status}`)
  })

  await test('DELETE /files/delete - API Key 删除', async () => {
    const { status } = await api('DELETE', '/files/delete?path=apikey-test&permanent=true', null, { 'X-API-Key': apiKey })
    assert(status === 200, `状态码 ${status}`)
  })

  await test('DELETE /user/apikeys/:id - 删除 API Key', async () => {
    const keys = await api('GET', '/user/apikeys', null, auth(adminToken))
    for (const key of keys.data.keys) {
      await api('DELETE', `/user/apikeys/${key.id}`, null, auth(adminToken))
    }
    const { status, data } = await api('GET', '/user/apikeys', null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    assert(data.keys.length === 0, 'API Key 未全部删除')
  })
}

// ==================== 11. 用户设置 ====================
async function testUserSettings() {
  console.log(cyan('\n━━━ 11. 用户设置 API ━━━'))

  await test('GET /user/settings - 获取设置', async () => {
    const { status, data } = await api('GET', '/user/settings', null, auth(userToken))
    assert(status === 200, `状态码 ${status}`)
    assert(data.settings, '缺少 settings')
    assert(typeof data.settings.guestEnabled === 'boolean', '缺少 guestEnabled')
  })

  await test('PUT /user/settings - 更新访客设置', async () => {
    const { status } = await api('PUT', '/user/settings', {
      guestEnabled: true, guestPath: 'public', theme: 'dark'
    }, auth(userToken))
    assert(status === 200, `状态码 ${status}`)
  })

  await test('GET /user/settings - 验证更新', async () => {
    const { status, data } = await api('GET', '/user/settings', null, auth(userToken))
    assert(status === 200, `状态码 ${status}`)
    assert(data.settings.guestEnabled === true, '访客模式未开启')
    assert(data.settings.guestPath === 'public', '访客路径不正确')
    assert(data.settings.theme === 'dark', '主题不正确')
  })

  await test('PUT /user/settings - 恢复默认', async () => {
    const { status } = await api('PUT', '/user/settings', {
      guestEnabled: false, guestPath: '', theme: 'system'
    }, auth(userToken))
    assert(status === 200, `状态码 ${status}`)
  })
}

// ==================== 12. 访客 ====================
async function testGuest() {
  console.log(cyan('\n━━━ 12. 访客 API ━━━'))

  // 确保 testuser 有默认存储池
  const userPools = await api('GET', '/storage-pools', null, auth(userToken))
  if (!userPools.data?.pools?.length) {
    await api('POST', '/storage-pools', {
      name: 'testuser本地存储', storageType: 'local', config: { localPath: './test-user-uploads' }
    }, auth(userToken))
  }
  const poolsRes = await api('GET', '/storage-pools', null, auth(userToken))
  const defaultPool = poolsRes.data.pools.find((p: any) => p.isDefault) || poolsRes.data.pools[0]
  if (!defaultPool.isDefault) {
    await api('POST', `/storage-pools/${defaultPool.id}/set-default`, null, auth(userToken))
  }

  // 开启访客模式
  await api('PUT', '/user/settings', { guestEnabled: true }, auth(userToken))

  // 创建访客分享（带权限）
  let guestShareId = 0
  await test('POST /user/guest-shares - 创建访客分享（带权限）', async () => {
    const { status, data } = await api('POST', '/user/guest-shares', {
      folderPath: '/',
      storagePoolId: defaultPool.id,
      label: '根目录',
      permissions: 'preview,download'
    }, auth(userToken))
    assert(status === 200, `状态码 ${status}`)
    assert(data.share.permissions === 'preview,download', `权限不匹配: ${data.share.permissions}`)
    guestShareId = data.share.id
  })

  await test('GET /guest - 访客用户列表', async () => {
    const { status, data } = await api('GET', '/guest')
    assert(status === 200, `状态码 ${status}`)
    assert(Array.isArray(data.users), '返回非数组')
    assert(data.users.some((u: any) => u.username === 'testuser'), '未找到 testuser')
  })

  await test('GET /guest/testuser/list - 访客分享列表（含权限）', async () => {
    const { status, data } = await api('GET', '/guest/testuser/list')
    assert(status === 200, `状态码 ${status}`)
    assert(data.shares && Array.isArray(data.shares), '返回非数组')
    assert(data.shares.length > 0, '分享列表为空')
    assert(data.shares[0].permissions, '缺少 permissions 字段')
    console.log(yellow(`  访客分享: ${data.shares.length} 个, 权限: ${data.shares[0].permissions}`))
  })

  await test('PUT /user/guest-shares/:id - 更新访客分享权限', async () => {
    const { status, data } = await api('PUT', `/user/guest-shares/${guestShareId}`, {
      permissions: 'preview'
    }, auth(userToken))
    assert(status === 200, `状态码 ${status}`)
    assert(data.share.permissions === 'preview', `权限未更新: ${data.share.permissions}`)
  })

  await test('GET /guest/testuser/list - 验证权限已更新', async () => {
    const { status, data } = await api('GET', '/guest/testuser/list')
    assert(status === 200, `状态码 ${status}`)
    const share = data.shares.find((s: any) => s.id === guestShareId)
    assert(share, '未找到分享')
    assert(share.permissions === 'preview', `权限不匹配: ${share.permissions}`)
  })

  // 测试无 download 权限时下载应 403
  await test('GET /guest/:username/:shareId/download - 无下载权限应 403', async () => {
    const { status } = await rawApi('GET', `${BASE}/guest/testuser/${guestShareId}/download?path=test.txt`)
    assert(status === 403, `状态码 ${status}`)
  })

  // 恢复 download 权限用于后续测试
  await api('PUT', `/user/guest-shares/${guestShareId}`, { permissions: 'preview,download' }, auth(userToken))

  // 清理访客分享
  await test('DELETE /user/guest-shares - 清理访客分享', async () => {
    const shares = await api('GET', '/user/guest-shares', null, auth(userToken))
    for (const s of shares.data.shares) {
      await api('DELETE', `/user/guest-shares/${s.id}`, null, auth(userToken))
    }
    // 关闭访客模式
    await api('PUT', '/user/settings', { guestEnabled: false }, auth(userToken))
  })
}

// ==================== 13. 管理面板 ====================
async function testAdmin() {
  console.log(cyan('\n━━━ 13. 管理 API ━━━'))

  await test('GET /admin/users - 用户列表', async () => {
    const { status, data } = await api('GET', '/admin/users', null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    assert(Array.isArray(data.users), '返回非数组')
    assert(data.users.length >= 2, '用户数量不正确')
    // 验证包含 banned 字段
    const admin = data.users.find((u: any) => u.username === 'admin')
    assert(typeof admin.banned !== 'undefined', '缺少 banned 字段')
  })

  await test('GET /admin/users/:id - 用户详情', async () => {
    const { status, data } = await api('GET', `/admin/users/${testUserId}`, null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    assert(data.user.username === 'testuser', '用户名不匹配')
    assert(data.user.settings, '缺少 settings')
    assert(Array.isArray(data.user.pools), '缺少 pools')
    assert(data.user.stats, '缺少 stats')
    console.log(yellow(`  testuser: pools=${data.user.pools.length}, trash=${data.user.stats.trashCount}, fav=${data.user.stats.favCount}`))
  })

  await test('POST /admin/users - 创建用户', async () => {
    const { status, data } = await api('POST', '/admin/users', {
      username: 'admin-created', password: 'admin123456', role: 'user'
    }, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    assert(data.user.id, '缺少 user id')
    assert(data.user.username === 'admin-created', '用户名不匹配')
  })

  await test('POST /admin/users - 重复创建应 409', async () => {
    const { status } = await api('POST', '/admin/users', {
      username: 'admin-created', password: 'admin123456'
    }, auth(adminToken))
    assert(status === 409, `状态码 ${status}`)
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
    assert(status === 403, `封禁用户登录应 403, 实际 ${status}`)
  })

  await test('PUT /admin/users/:id/ban - 不能封禁管理员', async () => {
    const users = await api('GET', '/admin/users', null, auth(adminToken))
    const admin = users.data.users.find((u: any) => u.username === 'admin')
    const { status } = await api('PUT', `/admin/users/${admin.id}/ban`, null, auth(adminToken))
    assert(status === 400, `不能封禁管理员应 400, 实际 ${status}`)
  })

  await test('PUT /admin/users/:id/ban - 解封用户', async () => {
    const users = await api('GET', '/admin/users', null, auth(adminToken))
    const created = users.data.users.find((u: any) => u.username === 'admin-created')
    const { status, data } = await api('PUT', `/admin/users/${created.id}/ban`, null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    assert(data.banned === false, '应为已解封')
  })

  await test('PUT /admin/users/:id/password - 重置密码', async () => {
    const users = await api('GET', '/admin/users', null, auth(adminToken))
    const created = users.data.users.find((u: any) => u.username === 'admin-created')
    const { status } = await api('PUT', `/admin/users/${created.id}/password`, { password: 'newpass123456' }, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)

    // 验证新密码可用
    const { status: loginStatus, data } = await api('POST', '/auth/login', { username: 'admin-created', password: 'newpass123456' })
    assert(loginStatus === 200, `新密码登录失败: ${loginStatus}`)
  })

  await test('PUT /admin/users/:id/role - 修改角色', async () => {
    const users = await api('GET', '/admin/users', null, auth(adminToken))
    const created = users.data.users.find((u: any) => u.username === 'admin-created')
    const { status } = await api('PUT', `/admin/users/${created.id}/role`, { role: 'user' }, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
  })

  await test('PUT /admin/users/:id/role - 不能降级自己', async () => {
    const users = await api('GET', '/admin/users', null, auth(adminToken))
    const admin = users.data.users.find((u: any) => u.username === 'admin')
    const { status } = await api('PUT', `/admin/users/${admin.id}/role`, { role: 'user' }, auth(adminToken))
    assert(status === 400, `状态码 ${status}`)
  })

  await test('GET /admin/users - 普通用户无权限应 403', async () => {
    const { status } = await api('GET', '/admin/users', null, auth(userToken))
    assert(status === 403, `状态码 ${status}`)
  })

  await test('PUT /admin/users/:id/ban - 不能封禁自己', async () => {
    const users = await api('GET', '/admin/users', null, auth(adminToken))
    const admin = users.data.users.find((u: any) => u.username === 'admin')
    const { status } = await api('PUT', `/admin/users/${admin.id}/ban`, null, auth(adminToken))
    assert(status === 400, `状态码 ${status}`)
  })

  await test('DELETE /admin/users/:id - 不能删除自己', async () => {
    const users = await api('GET', '/admin/users', null, auth(adminToken))
    const admin = users.data.users.find((u: any) => u.username === 'admin')
    const { status } = await api('DELETE', `/admin/users/${admin.id}`, null, auth(adminToken))
    assert(status === 400, `状态码 ${status}`)
  })
}

// ==================== 14. 封禁用户 API Key 测试 ====================
async function testBannedApiKey() {
  console.log(cyan('\n━━━ 14. 封禁用户 API Key ━━━'))

  // 先创建一个用户并封禁
  await api('POST', '/admin/users', { username: 'banned-api-user', password: 'test123456' }, auth(adminToken))
  const users = await api('GET', '/admin/users', null, auth(adminToken))
  const bannedUser = users.data.users.find((u: any) => u.username === 'banned-api-user')
  const bannedLogin = await api('POST', '/auth/login', { username: 'banned-api-user', password: 'test123456' })
  const bannedToken = bannedLogin.data.token

  // 创建 API Key
  await test('POST /user/apikeys - 为待封禁用户创建 API Key', async () => {
    const { status, data } = await api('POST', '/user/apikeys', {
      name: 'banned-key', permissions: 'read,write,delete'
    }, auth(bannedToken))
    assert(status === 200, `状态码 ${status}`)
    bannedApiKey = data.key
  })

  // API Key 可正常使用
  await test('GET /files/list - 封禁前 API Key 可用', async () => {
    const { status } = await api('GET', '/files/list', null, { 'X-API-Key': bannedApiKey })
    assert(status === 200, `状态码 ${status}`)
  })

  // 封禁用户
  await test('PUT /admin/users/:id/ban - 封禁 API Key 所属用户', async () => {
    const { status } = await api('PUT', `/admin/users/${bannedUser.id}/ban`, null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
  })

  // API Key 应被拒绝
  await test('GET /files/list - 封禁后 API Key 应 403', async () => {
    const { status } = await api('GET', '/files/list', null, { 'X-API-Key': bannedApiKey })
    assert(status === 403, `封禁用户 API Key 应 403, 实际 ${status}`)
  })

  // 清理
  await api('PUT', `/admin/users/${bannedUser.id}/ban`, null, auth(adminToken)) // 解封
  await api('DELETE', `/admin/users/${bannedUser.id}`, null, auth(adminToken))
}

// ==================== 15. IP 黑名单/白名单 ====================
async function testIpBlacklist() {
  console.log(cyan('\n━━━ 15. IP 黑名单/白名单 ━━━'))

  // 确保当前是黑名单模式
  await test('GET /admin/ip-list/mode - 获取当前模式', async () => {
    const { status, data } = await api('GET', '/admin/ip-list/mode', null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    assert(['blacklist', 'whitelist'].includes(data.mode), `无效模式: ${data.mode}`)
    console.log(yellow(`  当前模式: ${data.mode}`))
  })

  // 如果是白名单模式先切回黑名单
  const modeRes = await api('GET', '/admin/ip-list/mode', null, auth(adminToken))
  if (modeRes.data.mode === 'whitelist') {
    await api('PUT', '/admin/ip-list/mode', { mode: 'blacklist' }, auth(adminToken))
  }

  // 清空黑名单
  const listRes = await api('GET', '/admin/ip-blacklist', null, auth(adminToken))
  for (const entry of listRes.data.entries) {
    await api('DELETE', `/admin/ip-blacklist/${entry.id}`, null, auth(adminToken))
  }

  await test('POST /admin/ip-blacklist - 添加黑名单条目', async () => {
    const { status, data } = await api('POST', '/admin/ip-blacklist', {
      ip_pattern: '10.0.0.1', reason: '测试IP'
    }, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    assert(data.entry.ip_pattern === '10.0.0.1', 'IP 不匹配')
  })

  await test('POST /admin/ip-blacklist - 重复添加应 409', async () => {
    const { status } = await api('POST', '/admin/ip-blacklist', {
      ip_pattern: '10.0.0.1'
    }, auth(adminToken))
    assert(status === 409, `状态码 ${status}`)
  })

  await test('POST /admin/ip-blacklist - 无效 IP 应 400', async () => {
    const { status } = await api('POST', '/admin/ip-blacklist', {
      ip_pattern: 'not-an-ip'
    }, auth(adminToken))
    assert(status === 400, `状态码 ${status}`)
  })

  await test('POST /admin/ip-blacklist - 添加 CIDR 网段', async () => {
    const { status, data } = await api('POST', '/admin/ip-blacklist', {
      ip_pattern: '192.168.1.0/24', reason: '测试网段'
    }, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    assert(data.entry.ip_pattern === '192.168.1.0/24', 'CIDR 不匹配')
  })

  await test('GET /admin/ip-blacklist - 查询列表', async () => {
    const { status, data } = await api('GET', '/admin/ip-blacklist', null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    assert(Array.isArray(data.entries), '返回非数组')
    assert(data.entries.length >= 2, `条目数量不正确: ${data.entries.length}`)
  })

  await test('DELETE /admin/ip-blacklist/:id - 删除条目', async () => {
    const list = await api('GET', '/admin/ip-blacklist', null, auth(adminToken))
    const entry = list.data.entries.find((e: any) => e.ip_pattern === '10.0.0.1')
    const { status } = await api('DELETE', `/admin/ip-blacklist/${entry.id}`, null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
  })

  // 切换到白名单模式
  await test('PUT /admin/ip-list/mode - 切换为白名单', async () => {
    const { status, data } = await api('PUT', '/admin/ip-list/mode', { mode: 'whitelist' }, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    assert(data.mode === 'whitelist', '模式不正确')
  })

  await test('GET /admin/ip-list/mode - 验证白名单模式', async () => {
    const { status, data } = await api('GET', '/admin/ip-list/mode', null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    assert(data.mode === 'whitelist', '模式不正确')
  })

  await test('GET /admin/ip-blacklist - 白名单应含默认本地 IP', async () => {
    const { status, data } = await api('GET', '/admin/ip-blacklist', null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    const patterns = data.entries.map((e: any) => e.ip_pattern)
    assert(patterns.includes('127.0.0.1'), '缺少 127.0.0.1')
    assert(patterns.includes('::1'), '缺少 ::1')
    console.log(yellow(`  白名单条目: ${patterns.join(', ')}`))
  })

  await test('DELETE /admin/ip-blacklist/:id - 白名单中 127.0.0.1 不可删除', async () => {
    const list = await api('GET', '/admin/ip-blacklist', null, auth(adminToken))
    const entry = list.data.entries.find((e: any) => e.ip_pattern === '127.0.0.1')
    const { status } = await api('DELETE', `/admin/ip-blacklist/${entry.id}`, null, auth(adminToken))
    assert(status === 400, `127.0.0.1 不可删除应 400, 实际 ${status}`)
  })

  await test('GET /files/list - 白名单模式下 127.0.0.1 可访问', async () => {
    const { status } = await api('GET', '/files/list', null, auth(adminToken))
    assert(status === 200, `白名单模式下 127.0.0.1 应可访问, 实际 ${status}`)
  })

  // 切回黑名单模式
  await test('PUT /admin/ip-list/mode - 切回黑名单', async () => {
    const { status, data } = await api('PUT', '/admin/ip-list/mode', { mode: 'blacklist' }, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    assert(data.mode === 'blacklist', '模式不正确')
  })

  // 清空黑名单
  const finalList = await api('GET', '/admin/ip-blacklist', null, auth(adminToken))
  for (const entry of finalList.data.entries) {
    await api('DELETE', `/admin/ip-blacklist/${entry.id}`, null, auth(adminToken))
  }

  await test('GET /admin/ip-blacklist - 清空后列表为空', async () => {
    const { status, data } = await api('GET', '/admin/ip-blacklist', null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    assert(data.entries.length === 0, `列表应为空, 实际 ${data.entries.length} 条`)
  })

}

// ==================== 16. 清理 ====================
async function testCleanup() {
  console.log(cyan('\n━━━ 16. 清理 ━━━'))

  // 清理可能残留的测试用户
  await test('DELETE /admin/users/:id - 删除 admin-created 用户', async () => {
    const users = await api('GET', '/admin/users', null, auth(adminToken))
    const created = users.data.users.find((u: any) => u.username === 'admin-created')
    if (created) {
      const { status } = await api('DELETE', `/admin/users/${created.id}`, null, auth(adminToken))
      assert(status === 200, `状态码 ${status}`)
    }
  })

  await test('DELETE /admin/users/:id - 删除 testuser', async () => {
    const users = await api('GET', '/admin/users', null, auth(adminToken))
    const tu = users.data.users.find((u: any) => u.username === 'testuser')
    if (tu) {
      const { status } = await api('DELETE', `/admin/users/${tu.id}`, null, auth(adminToken))
      assert(status === 200, `状态码 ${status}`)
    }
  })

  await test('DELETE /admin/users/:id - 删除残留封禁测试用户', async () => {
    const users = await api('GET', '/admin/users', null, auth(adminToken))
    for (const u of users.data.users) {
      if (['banned-api-user'].includes(u.username)) {
        if (u.banned) await api('PUT', `/admin/users/${u.id}/ban`, null, auth(adminToken))
        await api('DELETE', `/admin/users/${u.id}`, null, auth(adminToken))
      }
    }
  })

  // 确保 IP 列表清空且为黑名单模式
  await test('清理 IP 黑名单/白名单', async () => {
    await api('PUT', '/admin/ip-list/mode', { mode: 'blacklist' }, auth(adminToken))
    const list = await api('GET', '/admin/ip-blacklist', null, auth(adminToken))
    for (const entry of list.data.entries) {
      await api('DELETE', `/admin/ip-blacklist/${entry.id}`, null, auth(adminToken))
    }
    const after = await api('GET', '/admin/ip-blacklist', null, auth(adminToken))
    assert(after.data.entries.length === 0, 'IP 列表未清空')
  })

  await test('GET /admin/users - 验证清理', async () => {
    const { status, data } = await api('GET', '/admin/users', null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    assert(!data.users.some((u: any) => u.username === 'testuser'), 'testuser 未删除')
    assert(!data.users.some((u: any) => u.username === 'admin-created'), 'admin-created 未删除')
  })
}

// ==================== 主流程 ====================
async function main() {
  console.log(cyan('╔═══════════════════════════════════════════╗'))
  console.log(cyan('║   VueFileManager API 全流程测试           ║'))
  console.log(cyan('╚═══════════════════════════════════════════╝'))

  try {
    await testAuth()
    await testStoragePools()
    await testFiles()
    await testTrash()
    await testFavourites()
    await testShare()
    await testUploadStream()
    await testChunkedUpload()
    await testPublicAccess()
    await testApiKeys()
    await testUserSettings()
    await testGuest()
    await testAdmin()
    await testBannedApiKey()
    await testIpBlacklist()
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
