import authRoutes from '../routes/auth'
import filesRoutes from '../routes/files'
import userRoutes from '../routes/user'
import adminRoutes from '../routes/admin'
import guestRoutes from '../routes/guest'
import shareRoutes from '../routes/share'
import storagePoolsRoutes from '../routes/storage-pools'
import trashRoutes from '../routes/trash'
import favouritesRoutes from '../routes/favourites'
import publicRoutes from '../routes/public'
import webdavRoutes from '../routes/webdav'
import type { RouteModule } from './types'

export const protectedRouteModules: RouteModule[] = [
  { path: '/api/auth', router: authRoutes },
  { path: '/api/files', router: filesRoutes },
  { path: '/api/user', router: userRoutes },
  { path: '/api/admin', router: adminRoutes },
  { path: '/api/guest', router: guestRoutes },
  { path: '/api/share', router: shareRoutes },
  { path: '/api/storage-pools', router: storagePoolsRoutes },
  { path: '/api/trash', router: trashRoutes },
  { path: '/api/favourites', router: favouritesRoutes },
  { path: '/dav', router: webdavRoutes }
]

export const publicRouteModules: RouteModule[] = [
  { path: '/f', router: publicRoutes }
]
