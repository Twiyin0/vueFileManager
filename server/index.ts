import { createServerApp, startServer } from './app/server'

const app = createServerApp()
startServer(app)

export default app
