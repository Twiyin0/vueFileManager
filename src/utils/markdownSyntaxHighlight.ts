import { highlightTree, tagHighlighter, tags } from '@lezer/highlight'
import type { Language, LanguageSupport } from '@codemirror/language'
import { StreamLanguage } from '@codemirror/language'
import { javascript, jsxLanguage, tsxLanguage, typescriptLanguage } from '@codemirror/lang-javascript'
import { htmlLanguage } from '@codemirror/lang-html'
import { cssLanguage } from '@codemirror/lang-css'
import { jsonLanguage } from '@codemirror/lang-json'
import { xmlLanguage } from '@codemirror/lang-xml'
import { yamlLanguage } from '@codemirror/lang-yaml'
import { pythonLanguage } from '@codemirror/lang-python'
import { javaLanguage } from '@codemirror/lang-java'
import { goLanguage } from '@codemirror/lang-go'
import { rustLanguage } from '@codemirror/lang-rust'
import { StandardSQL } from '@codemirror/lang-sql'
import { markdownLanguage } from '@codemirror/lang-markdown'
import { phpLanguage } from '@codemirror/lang-php'
import { cppLanguage } from '@codemirror/lang-cpp'
import { shell } from '@codemirror/legacy-modes/mode/shell'
import { powerShell } from '@codemirror/legacy-modes/mode/powershell'

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function getLanguage(source: Language | LanguageSupport) {
  if ('language' in source) return source.language
  return source
}

function getParser(source: Language | LanguageSupport) {
  return getLanguage(source).parser
}

const shellLanguage = StreamLanguage.define(shell)
const powerShellLanguage = StreamLanguage.define(powerShell)

const languageAliases: Record<string, string> = {
  cjs: 'js',
  mjs: 'js',
  javascript: 'js',
  jsx: 'jsx',
  typescript: 'ts',
  tsx: 'tsx',
  vue: 'html',
  htm: 'html',
  xhtml: 'html',
  scss: 'css',
  less: 'css',
  json5: 'json',
  yml: 'yaml',
  shell: 'sh',
  bash: 'sh',
  zsh: 'sh',
  sh: 'sh',
  powershell: 'ps1',
  ps: 'ps1',
  py: 'py',
  golang: 'go',
  rs: 'rs',
  md: 'md',
  markdown: 'md',
  c: 'cpp',
  cxx: 'cpp',
  h: 'cpp',
  hpp: 'cpp',
}

const parserByLanguage = new Map<string, ReturnType<typeof getParser>>([
  ['js', getParser(javascript())],
  ['jsx', jsxLanguage.parser],
  ['ts', typescriptLanguage.parser],
  ['tsx', tsxLanguage.parser],
  ['html', htmlLanguage.parser],
  ['css', cssLanguage.parser],
  ['json', jsonLanguage.parser],
  ['xml', xmlLanguage.parser],
  ['yaml', yamlLanguage.parser],
  ['py', pythonLanguage.parser],
  ['java', javaLanguage.parser],
  ['go', goLanguage.parser],
  ['rs', rustLanguage.parser],
  ['sql', StandardSQL.language.parser],
  ['md', markdownLanguage.parser],
  ['php', phpLanguage.parser],
  ['cpp', cppLanguage.parser],
  ['sh', shellLanguage.parser],
  ['ps1', powerShellLanguage.parser],
])

const tokenHighlighter = tagHighlighter([
  { tag: [tags.keyword, tags.operatorKeyword, tags.controlKeyword, tags.definitionKeyword, tags.moduleKeyword], class: 'tok-keyword' },
  { tag: [tags.typeName, tags.className, tags.namespace], class: 'tok-type' },
  { tag: tags.macroName, class: 'tok-preproc' },
  { tag: tags.variableName, class: 'tok-variable' },
  { tag: tags.definition(tags.variableName), class: 'tok-variable-def' },
  { tag: [tags.standard(tags.variableName), tags.special(tags.variableName), tags.self], class: 'tok-builtin' },
  { tag: tags.propertyName, class: 'tok-property' },
  { tag: tags.attributeName, class: 'tok-attribute' },
  { tag: tags.tagName, class: 'tok-tag' },
  { tag: [tags.atom, tags.bool, tags.null], class: 'tok-constant' },
  { tag: [tags.number, tags.integer, tags.float], class: 'tok-number' },
  { tag: tags.string, class: 'tok-string' },
  { tag: tags.special(tags.string), class: 'tok-string-special' },
  { tag: tags.regexp, class: 'tok-regexp' },
  { tag: tags.escape, class: 'tok-escape' },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], class: 'tok-comment' },
  { tag: tags.docComment, class: 'tok-comment-doc' },
  { tag: [tags.meta, tags.processingInstruction], class: 'tok-meta' },
  { tag: tags.annotation, class: 'tok-annotation' },
  { tag: tags.punctuation, class: 'tok-punctuation' },
  { tag: [tags.bracket, tags.angleBracket, tags.squareBracket, tags.paren], class: 'tok-bracket' },
  { tag: [tags.separator, tags.contentSeparator], class: 'tok-separator' },
  { tag: [tags.operator, tags.compareOperator, tags.logicOperator, tags.arithmeticOperator, tags.bitwiseOperator], class: 'tok-operator' },
], { all: 'tok' })

function normalizeLanguage(lang: string) {
  const normalized = lang.trim().toLowerCase()
  return languageAliases[normalized] || normalized
}

function getLanguageLabel(lang: string) {
  if (!lang) return 'text'
  const normalized = normalizeLanguage(lang)
  return normalized.toUpperCase()
}

export function getCodeLanguageLabel(lang?: string | null) {
  return getLanguageLabel(lang || '')
}

export function highlightMarkdownCode(code: string, lang?: string | null) {
  const normalized = normalizeLanguage(lang || '')
  const parser = parserByLanguage.get(normalized)
  if (!parser) {
    return escapeHtml(code)
  }

  const tree = parser.parse(code)
  let html = ''
  let pos = 0

  highlightTree(tree, tokenHighlighter, (from, to, classes) => {
    if (from > pos) {
      html += escapeHtml(code.slice(pos, from))
    }
    const content = escapeHtml(code.slice(from, to))
    html += classes ? `<span class="${classes}">${content}</span>` : content
    pos = to
  })

  if (pos < code.length) {
    html += escapeHtml(code.slice(pos))
  }

  return html
}
