/**
 * VueFileManager API 全流程测试
 * 运行: npx tsx test/workflows.ts
 * 前置: 服务器需在 localhost:3000 运行
 */

const BASE = 'http://localhost:3000/api'
let adminToken = ''
let userToken = ''
let apiKey = ''
let shareCode = ''
let testUserId = 0
let testPoolId = 0

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

  await test('GET /files/list - 根目录列表', async () => {
    const { status, data } = await api('GET', '/files/list', null, auth(adminToken))
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

// ==================== 6. 分享 ====================
async function testShare() {
  console.log(cyan('\n━━━ 6. 分享 API ━━━'))

  await api('POST', '/files/mkdir', { path: 'share-test' }, auth(adminToken))

  await test('POST /share/create - 创建分享', async () => {
    const { status, data } = await api('POST', '/share/create', {
      filePath: 'share-test',
      fileType: 'folder',
      expiresIn: 24,
      maxDownloads: 100
    }, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    assert(data.shareCode, '缺少 shareCode')
    shareCode = data.shareCode
  })

  await test('POST /share/create - 创建带密码分享', async () => {
    const { status, data } = await api('POST', '/share/create', {
      filePath: 'share-test',
      fileType: 'folder',
      password: '123456'
    }, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    assert(data.shareCode, '缺少 shareCode')
  })

  await test('GET /share/list - 我的分享列表', async () => {
    const { status, data } = await api('GET', '/share/list', null, auth(adminToken))
    assert(status === 200, `状态码 ${status}`)
    assert(Array.isArray(data.shares), '返回非数组')
    assert(data.shares.length >= 2, `分享数量不正确: ${data.shares.length}`)
  })

  await test('GET /share/s/:code - 访问分享（无需密码）', async () => {
    const { status, data } = await api('GET', `/share/s/${shareCode}`)
    assert(status === 200, `状态码 ${status}`)
    assert(data.needPassword === false, '不应需要密码')
    assert(data.owner === 'admin', '分享者不正确')
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
    const shareId = shares.data.shares[0]?.id
    if (shareId) {
      const { status } = await api('DELETE', `/share/${shareId}`, null, auth(adminToken))
      assert(status === 200, `状态码 ${status}`)
    }
  })

  // 清理
  await api('DELETE', '/files/delete?path=share-test&permanent=true', null, auth(adminToken))
}

// ==================== 7. API Key ====================
async function testApiKeys() {
  console.log(cyan('\n━━━ 7. API Key API ━━━'))

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

// ==================== 8. 用户设置 ====================
async function testUserSettings() {
  console.log(cyan('\n━━━ 8. 用户设置 API ━━━'))

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

// ==================== 9. 访客 ====================
async function testGuest() {
  console.log(cyan('\n━━━ 9. 访客 API ━━━'))

  // 先开启 testuser 的访客模式
  await api('PUT', '/user/settings', { guestEnabled: true, guestPath: '' }, auth(userToken))

  await test('GET /guest - 访客用户列表', async () => {
    const { status, data } = await api('GET', '/guest')
    assert(status === 200, `状态码 ${status}`)
    assert(Array.isArray(data.users), '返回非数组')
    assert(data.users.some((u: any) => u.username === 'testuser'), '未找到 testuser')
  })

  await test('GET /guest/testuser/list - 访客文件列表', async () => {
    const { status, data } = await api('GET', '/guest/testuser/list')
    assert(status === 200, `状态码 ${status}`)
    assert(Array.isArray(data.files), '返回非数组')
  })

  // 关闭访客模式
  await api('PUT', '/user/settings', { guestEnabled: false }, auth(userToken))
}

// ==================== 10. 管理面板 ====================
async function testAdmin() {
  console.log(cyan('\n━━━ 10. 管理 API ━━━'))

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
    // 登录会成功拿到 token，但后续请求应被拒绝
    // 实际上封禁检查在 authMiddleware，登录本身不检查
    // 所以我们测试用 token 访问 API
    const loginRes = await api('POST', '/auth/login', { username: 'admin-created', password: 'admin123456' })
    if (loginRes.data?.token) {
      const meRes = await api('GET', '/auth/me', null, auth(loginRes.data.token))
      assert(meRes.status === 403, `封禁用户访问应 403, 实际 ${meRes.status}`)
    }
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

// ==================== 11. 清理 ====================
async function testCleanup() {
  console.log(cyan('\n━━━ 11. 清理 ━━━'))

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
    await testApiKeys()
    await testUserSettings()
    await testGuest()
    await testAdmin()
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
