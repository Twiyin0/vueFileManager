import { Router, Response } from 'express'
import config, { updateConfigFile } from '../../config'
import { authMiddleware, adminMiddleware, AuthRequest } from '../../middleware/auth'
import { getDatabaseStatus, testDatabaseConnection } from '../../services/database'
import { sendServerError } from './shared'

const router = Router()

router.get('/upload-limit', authMiddleware, adminMiddleware, (_req: AuthRequest, res: Response) => {
  res.json({ upload_limit: config.upload_limit })
})

router.put('/upload-limit', authMiddleware, adminMiddleware, (req: AuthRequest, res: Response) => {
  const { upload_limit } = req.body
  if (typeof upload_limit !== 'number' || upload_limit < 1 || upload_limit > 10240) {
    return res.status(400).json({ error: '上传限制必须在 1 到 10240 MB 之间' })
  }

  config.upload_limit = upload_limit
  updateConfigFile((rawConfig) => {
    rawConfig.upload_limit = upload_limit
  })

  res.json({ upload_limit, message: '上传限制已更新，重启后完全生效' })
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
    return res.status(400).json({ error: '无效的数据库配置' })
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
    message: '数据库配置已保存，重启后会按新配置加载',
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
            message: `${result.message}。当前业务数据仍运行在 SQLite，完整切换还需要迁移数据访问层。`
          }
    })
  } catch (err) {
    sendServerError(res, err)
  }
})

export default router
