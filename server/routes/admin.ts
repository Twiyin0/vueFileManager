import { Router } from 'express'
import usersRouter from './admin/users'
import ipListRouter from './admin/ip-list'
import systemRouter from './admin/system'

const router = Router()

router.use(usersRouter)
router.use(ipListRouter)
router.use(systemRouter)

export default router
