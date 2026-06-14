import { Router } from 'express'
import jwt from 'jsonwebtoken'
import config from '../config'
import { getAllThemes, getPluginSummaries, getThemeStyles, togglePlugin, toggleTheme } from '../plugins/loader'

export function createPublicPlatformRouter() {
  const router = Router()

  router.get('/site-config', (_req, res) => {
    res.json({
      icp_beian: config.site?.icp_beian || '',
      police_beian: config.site?.police_beian || '',
      smtp_enabled: config.smtp?.enabled || false,
      themes_enabled: config.plugins?.enabled || false,
      plugins_enabled: config.plugins?.enabled || false,
      webdav_enabled: true
    })
  })

  router.get('/themes/styles', (_req, res) => {
    res.json({ styles: getThemeStyles() })
  })

  router.get('/themes/list', (_req, res) => {
    res.json({ themes: getAllThemes() })
  })

  router.get('/plugins/list', (_req, res) => {
    res.json({ plugins: getPluginSummaries() })
  })

  router.put('/plugins/:name/toggle', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '')
    if (!token) return res.status(401).json({ error: '未登录' })

    try {
      jwt.verify(token, config.server.jwt_secret)
    } catch {
      return res.status(401).json({ error: 'Token 无效' })
    }

    const { name } = req.params
    const { enabled } = req.body
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled 必须为布尔值' })
    }

    const success = togglePlugin(name, enabled)
    if (!success) return res.status(404).json({ error: '插件不存在' })

    res.json({
      message: enabled ? '插件已启用，重启服务后生效' : '插件已禁用，重启服务后生效'
    })
  })

  router.put('/themes/:name/toggle', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '')
    if (!token) return res.status(401).json({ error: '未登录' })

    try {
      jwt.verify(token, config.server.jwt_secret)
    } catch {
      return res.status(401).json({ error: 'Token 无效' })
    }

    const { name } = req.params
    const { enabled } = req.body
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled 必须为布尔值' })
    }

    const success = toggleTheme(name, enabled)
    if (!success) return res.status(404).json({ error: '主题不存在' })

    res.json({
      message: enabled ? '主题已启用，重启服务后生效' : '主题已禁用，重启服务后生效'
    })
  })

  return router
}
