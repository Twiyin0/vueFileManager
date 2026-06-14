import { Router, type Response } from 'express'
import config, { updateConfigFile } from '../../config'
import { authMiddleware, adminMiddleware, type AuthRequest } from '../../middleware/auth'
import { getDatabaseStatus, testDatabaseConnection } from '../../services/database'
import { Logger } from '../../services/logger'
import { getRequestTranslator } from '../../services/server-i18n'
import { sendServerError } from './shared'

const router = Router()

router.get('/upload-limit', authMiddleware, adminMiddleware, (_req: AuthRequest, res: Response) => {
  res.json({
    upload_limit: config.upload_limit,
    max_concurrent_uploads: config.max_concurrent_uploads,
    log_level: config.log_level
  })
})

router.put('/upload-limit', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
  const { upload_limit, max_concurrent_uploads, log_level } = req.body
  const t = getRequestTranslator(req)

  if (typeof upload_limit !== 'number' || upload_limit < 1 || upload_limit > 10240) {
    return res.status(400).json({ error: 'upload_limit must be between 1 and 10240 MB' })
  }

  if (typeof max_concurrent_uploads !== 'number' || max_concurrent_uploads < 1 || max_concurrent_uploads > 16) {
    return res.status(400).json({ error: 'max_concurrent_uploads must be between 1 and 16' })
  }

  if (typeof log_level !== 'number' || ![1, 2, 3].includes(log_level)) {
    return res.status(400).json({ error: 'log_level must be 1, 2, or 3' })
  }

  config.upload_limit = upload_limit
  config.max_concurrent_uploads = max_concurrent_uploads
  config.log_level = log_level as 1 | 2 | 3

  updateConfigFile((rawConfig) => {
    rawConfig.upload_limit = upload_limit
    rawConfig.max_concurrent_uploads = max_concurrent_uploads
    rawConfig.log_level = log_level
  })

  await Logger.info('api', 'system.ts', `Admin #${req.userId} updated system settings: upload_limit=${upload_limit}, max_concurrent_uploads=${max_concurrent_uploads}, log_level=${log_level}`)

  res.json({
    upload_limit,
    max_concurrent_uploads,
    log_level,
    message: t('Upload settings saved without restarting the service.')
  })
})

router.get('/database', authMiddleware, adminMiddleware, (_req: AuthRequest, res: Response) => {
  res.json({
    database: {
      type: config.database.type,
      sqlite: { ...config.database.sqlite },
      mysql: { ...config.database.mysql, password: config.database.mysql.password ? '******' : '' },
      postgres: { ...config.database.postgres, password: config.database.postgres.password ? '******' : '' }
    },
    status: getDatabaseStatus()
  })
})

router.put('/database', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
  const payload = req.body?.database
  if (!payload || !['sqlite', 'mysql', 'postgres'].includes(payload.type)) {
    return res.status(400).json({ error: 'Invalid database configuration' })
  }

  const nextDatabase = {
    type: payload.type,
    sqlite: {
      path: payload.sqlite?.path || config.database.sqlite.path
    },
    mysql: {
      host: payload.mysql?.host || config.database.mysql.host,
      port: Number(payload.mysql?.port || config.database.mysql.port),
      user: payload.mysql?.user || config.database.mysql.user,
      password: payload.mysql?.password === '******' ? config.database.mysql.password : (payload.mysql?.password ?? ''),
      database: payload.mysql?.database || config.database.mysql.database,
      ssl: !!payload.mysql?.ssl
    },
    postgres: {
      host: payload.postgres?.host || config.database.postgres.host,
      port: Number(payload.postgres?.port || config.database.postgres.port),
      user: payload.postgres?.user || config.database.postgres.user,
      password: payload.postgres?.password === '******' ? config.database.postgres.password : (payload.postgres?.password ?? ''),
      database: payload.postgres?.database || config.database.postgres.database,
      ssl: !!payload.postgres?.ssl
    }
  }

  updateConfigFile((rawConfig) => {
    rawConfig.database = nextDatabase
  })

  await Logger.info('api', 'system.ts', `Admin #${req.userId} updated database config type=${nextDatabase.type}`)

  res.json({
    message: 'Database configuration saved. Restart manually only when you want runtime connections to switch.',
    status: getDatabaseStatus()
  })
})

router.post('/database/test', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const payload = req.body?.database || config.database
    const database = {
      type: payload.type,
      sqlite: {
        path: payload.sqlite?.path || config.database.sqlite.path
      },
      mysql: {
        host: payload.mysql?.host || config.database.mysql.host,
        port: Number(payload.mysql?.port || config.database.mysql.port),
        user: payload.mysql?.user || config.database.mysql.user,
        password: payload.mysql?.password === '******' ? config.database.mysql.password : (payload.mysql?.password ?? ''),
        database: payload.mysql?.database || config.database.mysql.database,
        ssl: !!payload.mysql?.ssl
      },
      postgres: {
        host: payload.postgres?.host || config.database.postgres.host,
        port: Number(payload.postgres?.port || config.database.postgres.port),
        user: payload.postgres?.user || config.database.postgres.user,
        password: payload.postgres?.password === '******' ? config.database.postgres.password : (payload.postgres?.password ?? ''),
        database: payload.postgres?.database || config.database.postgres.database,
        ssl: !!payload.postgres?.ssl
      }
    } as typeof config.database

    const result = await testDatabaseConnection(database)
    await Logger.info('api', 'system.ts', `Admin #${req.userId} tested database config type=${database.type} success=${result.success}`)
    res.json({
      ...result,
      status: database.type === 'sqlite'
        ? getDatabaseStatus()
        : {
            ...getDatabaseStatus(),
            type: database.type,
            runtime: 'external',
            supported: true,
            message: result.message
          }
    })
  } catch (err) {
    await sendServerError(req, res, err, {
      source: 'api',
      fileName: 'system.ts',
      message: 'Database connection test failed'
    })
  }
})

export default router
