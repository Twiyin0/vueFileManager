import { Router, Response } from 'express'
import config, { updateConfigFile } from '../../config'
import { authMiddleware, adminMiddleware, AuthRequest } from '../../middleware/auth'
import { getDatabaseStatus, testDatabaseConnection } from '../../services/database'
import { sendServerError } from './shared'

const router = Router()

router.get('/upload-limit', authMiddleware, adminMiddleware, (_req: AuthRequest, res: Response) => {
  res.json({
    upload_limit: config.upload_limit,
    max_concurrent_uploads: config.max_concurrent_uploads
  })
})

router.put('/upload-limit', authMiddleware, adminMiddleware, (req: AuthRequest, res: Response) => {
  const { upload_limit, max_concurrent_uploads } = req.body

  if (typeof upload_limit !== 'number' || upload_limit < 1 || upload_limit > 10240) {
    return res.status(400).json({ error: 'upload_limit must be between 1 and 10240 MB' })
  }

  if (typeof max_concurrent_uploads !== 'number' || max_concurrent_uploads < 1 || max_concurrent_uploads > 16) {
    return res.status(400).json({ error: 'max_concurrent_uploads must be between 1 and 16' })
  }

  config.upload_limit = upload_limit
  config.max_concurrent_uploads = max_concurrent_uploads

  updateConfigFile((rawConfig) => {
    rawConfig.upload_limit = upload_limit
    rawConfig.max_concurrent_uploads = max_concurrent_uploads
  })

  res.json({
    upload_limit,
    max_concurrent_uploads,
    message: 'Upload settings saved without restarting the service.'
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

router.put('/database', authMiddleware, adminMiddleware, (req: AuthRequest, res: Response) => {
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
    sendServerError(res, err)
  }
})

export default router
