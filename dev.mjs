import { spawn } from 'child_process'

const isWin = process.platform === 'win32'
const viteArgs = ['vite', ...process.argv.slice(2)]

const vite = spawn('npx', viteArgs, { stdio: 'inherit', shell: isWin })
const server = spawn('npx', ['tsx', 'watch', 'server/index.ts'], { stdio: 'inherit', shell: isWin })

function cleanup() {
  vite.kill()
  server.kill()
  process.exit()
}

process.on('SIGINT', cleanup)
process.on('SIGTERM', cleanup)
vite.on('close', cleanup)
server.on('close', cleanup)
