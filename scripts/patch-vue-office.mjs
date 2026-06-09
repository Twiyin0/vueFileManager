/**
 * vue-office/excel 补丁：启用 x-spreadsheet 底部 sheet tab 栏
 * 原因：vue-office 创建 x-spreadsheet 时漏传 showBottomBar: true
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const target = path.join(__dirname, '..', 'node_modules', '@vue-office', 'excel', 'lib', 'index.js')

if (!fs.existsSync(target)) {
  console.log('⏭️  @vue-office/excel not found, skip patch')
  process.exit(0)
}

let code = fs.readFileSync(target, 'utf8')
const needle = 'showToolbar:!1,showContextmenu:'
const replacement = 'showToolbar:!1,showBottomBar:!0,showContextmenu:'

if (code.includes(replacement)) {
  console.log('✅ @vue-office/excel already patched')
  process.exit(0)
}

if (!code.includes(needle)) {
  console.log('⚠️  @vue-office/excel pattern not found, skip patch')
  process.exit(0)
}

code = code.replace(needle, replacement)
fs.writeFileSync(target, code)
console.log('✅ @vue-office/excel patched: showBottomBar enabled')
