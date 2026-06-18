import { Router } from 'express'
import jwt from 'jsonwebtoken'
import config from '../config'
import { getAllThemes, getPluginSummaries, getThemeStyles, togglePlugin, toggleTheme } from '../plugins/loader'
import { getRequestTranslator } from '../services/server-i18n'

export function createPublicPlatformRouter() {
  const router = Router()

  router.get('/site-config', (_req, res) => {
    res.json({
      icp_beian: config.site?.icp_beian || '',
      police_beian: config.site?.police_beian || '',
      smtp_enabled: config.smtp?.enabled || false,
      registration_enabled: config.allow_user_registration,
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
    const t = getRequestTranslator(req)
    const token = req.headers.authorization?.replace('Bearer ', '')
    if (!token) return res.status(401).json({ error: t('auth.notSignedIn', 'Not signed in') })

    try {
      jwt.verify(token, config.server.jwt_secret)
    } catch {
      return res.status(401).json({ error: t('auth.invalidToken', 'Invalid token') })
    }

    const { name } = req.params
    const { enabled } = req.body
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: t('common.enabledMustBeBoolean', 'enabled must be a boolean') })
    }

    const success = togglePlugin(name, enabled)
    if (!success) return res.status(404).json({ error: t('platform.pluginNotFound', 'Plugin not found') })

    res.json({
      message: enabled ? 'platform.pluginEnabledAfterRestart' : 'platform.pluginDisabledAfterRestart'
    })
  })

  router.put('/themes/:name/toggle', (req, res) => {
    const t = getRequestTranslator(req)
    const token = req.headers.authorization?.replace('Bearer ', '')
    if (!token) return res.status(401).json({ error: t('auth.notSignedIn', 'Not signed in') })

    try {
      jwt.verify(token, config.server.jwt_secret)
    } catch {
      return res.status(401).json({ error: t('auth.invalidToken', 'Invalid token') })
    }

    const { name } = req.params
    const { enabled } = req.body
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: t('common.enabledMustBeBoolean', 'enabled must be a boolean') })
    }

    const success = toggleTheme(name, enabled)
    if (!success) return res.status(404).json({ error: t('platform.themeNotFound', 'Theme not found') })

    res.json({
      message: enabled ? 'platform.themeEnabledAfterRestart' : 'platform.themeDisabledAfterRestart'
    })
  })

  return router
}
