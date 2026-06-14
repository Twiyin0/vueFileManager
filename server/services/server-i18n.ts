import type { NextFunction, Request, Response } from 'express'
import config, { type AppLanguage } from '../config'
import db from '../db'

type TranslationDictionary = Record<string, Record<AppLanguage, string>>

const messageDictionary: TranslationDictionary = {
  '服务器内部错误': {
    'en-US': 'Internal server error',
    'zh-CN': '服务器内部错误'
  },
  '未登录': {
    'en-US': 'Not signed in',
    'zh-CN': '未登录'
  },
  '用户不存在': {
    'en-US': 'User not found',
    'zh-CN': '用户不存在'
  },
  '账号已被封禁': {
    'en-US': 'Account has been banned',
    'zh-CN': '账号已被封禁'
  },
  'Token 无效': {
    'en-US': 'Invalid token',
    'zh-CN': 'Token 无效'
  },
  'Token 无效或已过期': {
    'en-US': 'Invalid or expired token',
    'zh-CN': 'Token 无效或已过期'
  },
  '认证失败': {
    'en-US': 'Authentication failed',
    'zh-CN': '认证失败'
  },
  '需要管理员权限': {
    'en-US': 'Administrator permission required',
    'zh-CN': '需要管理员权限'
  },
  '缺少 API Key': {
    'en-US': 'Missing API key',
    'zh-CN': '缺少 API Key'
  },
  'API Key 无效': {
    'en-US': 'Invalid API key',
    'zh-CN': 'API Key 无效'
  },
  'API Key 认证失败': {
    'en-US': 'API key authentication failed',
    'zh-CN': 'API Key 认证失败'
  },
  '未认证': {
    'en-US': 'Unauthenticated',
    'zh-CN': '未认证'
  },
  '邮箱注册未启用': {
    'en-US': 'Email registration is disabled',
    'zh-CN': '邮箱注册未启用'
  },
  '邮箱不能为空': {
    'en-US': 'Email is required',
    'zh-CN': '邮箱不能为空'
  },
  '邮箱格式不正确': {
    'en-US': 'Invalid email format',
    'zh-CN': '邮箱格式不正确'
  },
  '该邮箱已被注册': {
    'en-US': 'Email is already registered',
    'zh-CN': '该邮箱已被注册'
  },
  '验证码已发送': {
    'en-US': 'Verification code sent',
    'zh-CN': '验证码已发送'
  },
  '用户名和密码不能为空': {
    'en-US': 'Username and password are required',
    'zh-CN': '用户名和密码不能为空'
  },
  '用户名长度需在 3-20 之间': {
    'en-US': 'Username must be between 3 and 20 characters',
    'zh-CN': '用户名长度需在 3-20 之间'
  },
  '密码长度不能少于 6 位': {
    'en-US': 'Password must be at least 6 characters',
    'zh-CN': '密码长度不能少于 6 位'
  },
  '请输入邮箱和验证码': {
    'en-US': 'Email and verification code are required',
    'zh-CN': '请输入邮箱和验证码'
  },
  '验证码无效或已过期': {
    'en-US': 'Verification code is invalid or expired',
    'zh-CN': '验证码无效或已过期'
  },
  '用户名已存在': {
    'en-US': 'Username already exists',
    'zh-CN': '用户名已存在'
  },
  '注册成功': {
    'en-US': 'Registration successful',
    'zh-CN': '注册成功'
  },
  '用户名或密码错误': {
    'en-US': 'Invalid username or password',
    'zh-CN': '用户名或密码错误'
  },
  '账号未验证，请检查邮箱验证码或等待管理员处理': {
    'en-US': 'Account is not verified yet. Please check the email verification code or wait for administrator approval',
    'zh-CN': '账号未验证，请检查邮箱验证码或等待管理员处理'
  },
  '登录成功': {
    'en-US': 'Login successful',
    'zh-CN': '登录成功'
  },
  '设置已更新': {
    'en-US': 'Settings updated',
    'zh-CN': '设置已更新'
  },
  '名称不能为空': {
    'en-US': 'Name is required',
    'zh-CN': '名称不能为空'
  },
  'API Key 创建成功': {
    'en-US': 'API key created successfully',
    'zh-CN': 'API Key 创建成功'
  },
  'API Key 不存在': {
    'en-US': 'API key not found',
    'zh-CN': 'API Key 不存在'
  },
  'API Key 已删除': {
    'en-US': 'API key deleted',
    'zh-CN': 'API Key 已删除'
  },
  '缺少文件夹路径或存储池 ID': {
    'en-US': 'Missing folder path or storage pool ID',
    'zh-CN': '缺少文件夹路径或存储池 ID'
  },
  '存储池不存在': {
    'en-US': 'Storage pool not found',
    'zh-CN': '存储池不存在'
  },
  '该文件夹已经分享至访客模式': {
    'en-US': 'This folder is already shared to guest mode',
    'zh-CN': '该文件夹已经分享至访客模式'
  },
  '已分享至访客模式': {
    'en-US': 'Shared to guest mode',
    'zh-CN': '已分享至访客模式'
  },
  '访客分享不存在': {
    'en-US': 'Guest share not found',
    'zh-CN': '访客分享不存在'
  },
  '访客分享已更新': {
    'en-US': 'Guest share updated',
    'zh-CN': '访客分享已更新'
  },
  '访客分享已删除': {
    'en-US': 'Guest share deleted',
    'zh-CN': '访客分享已删除'
  },
  '缺少文件路径': {
    'en-US': 'Missing file path',
    'zh-CN': '缺少文件路径'
  },
  '删除成功': {
    'en-US': 'Deleted successfully',
    'zh-CN': '删除成功'
  },
  '缺少路径': {
    'en-US': 'Missing path',
    'zh-CN': '缺少路径'
  },
  '缺少路径列表': {
    'en-US': 'Missing path list',
    'zh-CN': '缺少路径列表'
  },
  '批量删除完成': {
    'en-US': 'Batch deletion completed',
    'zh-CN': '批量删除完成'
  },
  '缺少参数': {
    'en-US': 'Missing required parameters',
    'zh-CN': '缺少参数'
  },
  '批量移动完成': {
    'en-US': 'Batch move completed',
    'zh-CN': '批量移动完成'
  },
  '缺少文件夹路径': {
    'en-US': 'Missing folder path',
    'zh-CN': '缺少文件夹路径'
  },
  '文件夹创建成功': {
    'en-US': 'Folder created successfully',
    'zh-CN': '文件夹创建成功'
  },
  '重命名成功': {
    'en-US': 'Renamed successfully',
    'zh-CN': '重命名成功'
  },
  '移动成功': {
    'en-US': 'Moved successfully',
    'zh-CN': '移动成功'
  },
  '复制成功': {
    'en-US': 'Copied successfully',
    'zh-CN': '复制成功'
  },
  '跨池复制完成': {
    'en-US': 'Cross-pool copy completed',
    'zh-CN': '跨池复制完成'
  },
  '跨池移动完成': {
    'en-US': 'Cross-pool move completed',
    'zh-CN': '跨池移动完成'
  },
  '缺少搜索关键词': {
    'en-US': 'Missing search keyword',
    'zh-CN': '缺少搜索关键词'
  },
  '没有文件': {
    'en-US': 'No file provided',
    'zh-CN': '没有文件'
  },
  '上传成功': {
    'en-US': 'Upload successful',
    'zh-CN': '上传成功'
  },
  '缺少 filePath 或 content': {
    'en-US': 'Missing filePath or content',
    'zh-CN': '缺少 filePath 或 content'
  },
  'content 必须是字符串': {
    'en-US': 'content must be a string',
    'zh-CN': 'content 必须是字符串'
  },
  '文件过大，请使用上传功能': {
    'en-US': 'File is too large. Please use upload instead',
    'zh-CN': '文件过大，请使用上传功能'
  },
  '保存超时': {
    'en-US': 'Save timed out',
    'zh-CN': '保存超时'
  },
  '保存失败': {
    'en-US': 'Save failed',
    'zh-CN': '保存失败'
  },
  '缺少 X-File-Name 头': {
    'en-US': 'Missing X-File-Name header',
    'zh-CN': '缺少 X-File-Name 头'
  },
  '流式上传成功': {
    'en-US': 'Stream upload successful',
    'zh-CN': '流式上传成功'
  },
  '上传已取消': {
    'en-US': 'Upload cancelled',
    'zh-CN': '上传已取消'
  },
  '缺少文件名或文件大小': {
    'en-US': 'Missing file name or file size',
    'zh-CN': '缺少文件名或文件大小'
  },
  '分片上传已初始化': {
    'en-US': 'Chunk upload initialized',
    'zh-CN': '分片上传已初始化'
  },
  '缺少 Content-Range 头': {
    'en-US': 'Missing Content-Range header',
    'zh-CN': '缺少 Content-Range 头'
  },
  'Content-Range 格式错误': {
    'en-US': 'Invalid Content-Range format',
    'zh-CN': 'Content-Range 格式错误'
  },
  '上传任务不存在': {
    'en-US': 'Upload task not found',
    'zh-CN': '上传任务不存在'
  },
  '无权操作此上传任务': {
    'en-US': 'No permission to operate this upload task',
    'zh-CN': '无权操作此上传任务'
  },
  '上传任务已过期': {
    'en-US': 'Upload task expired',
    'zh-CN': '上传任务已过期'
  },
  '分片上传成功': {
    'en-US': 'Chunk uploaded successfully',
    'zh-CN': '分片上传成功'
  },
  '无权查看此上传任务': {
    'en-US': 'No permission to view this upload task',
    'zh-CN': '无权查看此上传任务'
  },
  '分片上传完成': {
    'en-US': 'Chunk upload completed',
    'zh-CN': '分片上传完成'
  },
  '上传缓存已清理': {
    'en-US': 'Upload cache cleared',
    'zh-CN': '上传缓存已清理'
  },
  '缺少 URL': {
    'en-US': 'Missing URL',
    'zh-CN': '缺少 URL'
  },
  '远程上传成功': {
    'en-US': 'Remote upload successful',
    'zh-CN': '远程上传成功'
  },
  '离线下载任务已创建': {
    'en-US': 'Offline download task created',
    'zh-CN': '离线下载任务已创建'
  },
  '任务已取消': {
    'en-US': 'Task cancelled',
    'zh-CN': '任务已取消'
  },
  '任务已重新加入队列': {
    'en-US': 'Task requeued',
    'zh-CN': '任务已重新加入队列'
  },
  '已清空已结束任务': {
    'en-US': 'Finished tasks cleared',
    'zh-CN': '已清空已结束任务'
  },
  '分享链接创建成功': {
    'en-US': 'Share link created successfully',
    'zh-CN': '分享链接创建成功'
  },
  '分享不存在': {
    'en-US': 'Share not found',
    'zh-CN': '分享不存在'
  },
  '分享已删除': {
    'en-US': 'Share deleted',
    'zh-CN': '分享已删除'
  },
  '分享链接不存在': {
    'en-US': 'Share link not found',
    'zh-CN': '分享链接不存在'
  },
  '分享链接已过期': {
    'en-US': 'Share link expired',
    'zh-CN': '分享链接已过期'
  },
  '下载次数已达上限': {
    'en-US': 'Download limit reached',
    'zh-CN': '下载次数已达上限'
  },
  '不是文件夹分享': {
    'en-US': 'This share is not a folder share',
    'zh-CN': '不是文件夹分享'
  },
  '缺少签名参数': {
    'en-US': 'Missing signature parameters',
    'zh-CN': '缺少签名参数'
  },
  '签名验证失败': {
    'en-US': 'Signature verification failed',
    'zh-CN': '签名验证失败'
  },
  '密码错误': {
    'en-US': 'Incorrect password',
    'zh-CN': '密码错误'
  },
  '不支持预览文件夹': {
    'en-US': 'Folder preview is not supported',
    'zh-CN': '不支持预览文件夹'
  },
  '缺少必要参数': {
    'en-US': 'Missing required parameters',
    'zh-CN': '缺少必要参数'
  },
  '存储池创建成功': {
    'en-US': 'Storage pool created successfully',
    'zh-CN': '存储池创建成功'
  },
  '存储池更新成功': {
    'en-US': 'Storage pool updated successfully',
    'zh-CN': '存储池更新成功'
  },
  '不能删除默认存储池，请先设置其他存储池为默认': {
    'en-US': 'Cannot delete the default storage pool. Set another pool as default first',
    'zh-CN': '不能删除默认存储池，请先设置其他存储池为默认'
  },
  '存储池删除成功': {
    'en-US': 'Storage pool deleted successfully',
    'zh-CN': '存储池删除成功'
  },
  '缺少存储池 ID 列表': {
    'en-US': 'Missing storage pool ID list',
    'zh-CN': '缺少存储池 ID 列表'
  },
  '没有存储池被删除': {
    'en-US': 'No storage pool was deleted',
    'zh-CN': '没有存储池被删除'
  },
  '默认存储池设置成功': {
    'en-US': 'Default storage pool updated successfully',
    'zh-CN': '默认存储池设置成功'
  },
  '不支持的存储类型': {
    'en-US': 'Unsupported storage type',
    'zh-CN': '不支持的存储类型'
  },
  '又拍云存储需要填写操作员、密码和服务名': {
    'en-US': 'UpYun storage requires operator, password, and bucket',
    'zh-CN': '又拍云存储需要填写操作员、密码和服务名'
  },
  'FTP 存储需要填写主机地址': {
    'en-US': 'FTP storage requires a host',
    'zh-CN': 'FTP 存储需要填写主机地址'
  },
  'SFTP 存储需要填写主机地址和用户名': {
    'en-US': 'SFTP storage requires host and username',
    'zh-CN': 'SFTP 存储需要填写主机地址和用户名'
  },
  'SFTP 存储需要密码或私钥': {
    'en-US': 'SFTP storage requires a password or private key',
    'zh-CN': 'SFTP 存储需要密码或私钥'
  },
  'S3 存储需要填写 Bucket 名称': {
    'en-US': 'S3 storage requires a bucket name',
    'zh-CN': 'S3 存储需要填写 Bucket 名称'
  },
  'S3 存储需要填写 Access Key': {
    'en-US': 'S3 storage requires access keys',
    'zh-CN': 'S3 存储需要填写 Access Key'
  },
  '缺少 Destination': {
    'en-US': 'Missing Destination header',
    'zh-CN': '缺少 Destination'
  },
  '暂不支持跨存储池移动': {
    'en-US': 'Cross-pool move is not supported yet',
    'zh-CN': '暂不支持跨存储池移动'
  },
  '暂不支持跨存储池复制': {
    'en-US': 'Cross-pool copy is not supported yet',
    'zh-CN': '暂不支持跨存储池复制'
  },
  '需要 multipart 请求': {
    'en-US': 'multipart request required',
    'zh-CN': '需要 multipart 请求'
  },
  '文件上传流错误': {
    'en-US': 'File upload stream error',
    'zh-CN': '文件上传流错误'
  }
}

const regexRules: Array<{
  match: RegExp
  render: (language: AppLanguage, ...groups: string[]) => string
}> = [
  {
    match: /^已拦截系统文件: (.+)$/u,
    render: (language: AppLanguage, fileName: string) => (
      language === 'en-US'
        ? `Blocked system file: ${fileName}`
        : `已拦截系统文件: ${fileName}`
    )
  },
  {
    match: /^文件大小超过限制 \((\d+)MB\)$/u,
    render: (language: AppLanguage, limit: string) => (
      language === 'en-US'
        ? `File size exceeds the limit (${limit}MB)`
        : `文件大小超过限制 (${limit}MB)`
    )
  },
  {
    match: /^无效的存储池 ID: (.+)$/u,
    render: (language: AppLanguage, value: string) => (
      language === 'en-US'
        ? `Invalid storage pool ID: ${value}`
        : `无效的存储池 ID: ${value}`
    )
  },
  {
    match: /^存储池不存在: #(\d+)$/u,
    render: (language: AppLanguage, id: string) => (
      language === 'en-US'
        ? `Storage pool not found: #${id}`
        : `存储池不存在: #${id}`
    )
  },
  {
    match: /^不能删除默认存储池 (.+)$/u,
    render: (language: AppLanguage, name: string) => (
      language === 'en-US'
        ? `Cannot delete default storage pool ${name}`
        : `不能删除默认存储池 ${name}`
    )
  },
  {
    match: /^已删除 (\d+) 个存储池$/u,
    render: (language: AppLanguage, count: string) => (
      language === 'en-US'
        ? `Deleted ${count} storage pools`
        : `已删除 ${count} 个存储池`
    )
  },
  {
    match: /^下载失败: (.+)$/u,
    render: (language: AppLanguage, detail: string) => (
      language === 'en-US'
        ? `Download failed: ${detail}`
        : `下载失败: ${detail}`
    )
  },
  {
    match: /^User (.+) uploaded a file in poolID:#(\d+) (.+)$/u,
    render: (language: AppLanguage, userName: string, poolId: string, filePath: string) => (
      language === 'en-US'
        ? `User ${userName} uploaded a file in poolID:#${poolId} ${filePath}`
        : `用户 ${userName} 在存储池 #${poolId} 上传了文件 ${filePath}`
    )
  }
]

function normalizeLanguage(language: unknown): AppLanguage {
  return language === 'zh-CN' ? 'zh-CN' : 'en-US'
}

function extractLanguageFromHeader(headerValue: string | undefined): AppLanguage {
  if (!headerValue) {
    return normalizeLanguage(config.default_language)
  }

  const first = headerValue
    .split(',')
    .map((value) => value.trim())
    .find(Boolean)
    ?.toLowerCase()

  if (first?.startsWith('zh')) {
    return 'zh-CN'
  }

  return 'en-US'
}

export async function resolveRequestLanguage(req: Request): Promise<AppLanguage> {
  const requestWithUser = req as Request & { userId?: number }
  if (requestWithUser.userId) {
    try {
      const row = await db.prepare('SELECT language FROM user_settings WHERE user_id = ?').get(requestWithUser.userId) as { language?: string } | undefined
      if (row?.language) {
        return normalizeLanguage(row.language)
      }
    } catch {
      // ignore lookup failures and fall back
    }
  }

  return extractLanguageFromHeader(req.headers['accept-language'] as string | undefined)
}

export function translateServerText(message: string, language: AppLanguage): string {
  const direct = messageDictionary[message]
  if (direct) {
    return direct[language] || direct['en-US'] || message
  }

  for (const rule of regexRules) {
    const match = message.match(rule.match)
    if (match) {
      return rule.render(language, ...match.slice(1))
    }
  }

  return message
}

function translatePayload(payload: unknown, language: AppLanguage): unknown {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload
  }

  const record = payload as Record<string, unknown>
  const next = { ...record }

  if (typeof next.error === 'string') {
    next.error = translateServerText(next.error, language)
  }

  if (typeof next.message === 'string') {
    next.message = translateServerText(next.message, language)
  }

  if (Array.isArray(next.errors)) {
    next.errors = next.errors.map((entry) => (
      typeof entry === 'string' ? translateServerText(entry, language) : entry
    ))
  }

  return next
}

export async function translateResponsePayload(req: Request, payload: unknown) {
  const language = await resolveRequestLanguage(req)
  return translatePayload(payload, language)
}

export function registerServerI18nMiddleware() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res)
    res.json = ((body: unknown) => originalJson(translatePayload(body, (req as any).__resolvedLanguage || 'en-US'))) as Response['json']

    ;(req as any).__resolvedLanguage = await resolveRequestLanguage(req)
    ;(req as any).t = (message: string) => translateServerText(message, (req as any).__resolvedLanguage || 'en-US')
    next()
  }
}

export function getRequestTranslator(req: Request) {
  const language = ((req as any).__resolvedLanguage as AppLanguage | undefined) || 'en-US'
  return (message: string) => translateServerText(message, language)
}
