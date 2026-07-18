import { readdir, readFile } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const testsRoot = resolve(projectRoot, 'tests')

const rules = [
  {
    name: 'focused-or-disabled-test',
    pattern: /\.(?:only|skip|todo|pin)\s*\(|\b(?:test|suite)\.(?:only|skip|todo)\b/,
    message: 'Focused, skipped, pinned, and todo tests are forbidden in the committed suite',
  },
  {
    name: 'migration-internals',
    pattern: /(?:#database\/migrations|database\/migrations|migration_preflight|BaseSchema)/,
    message: 'Tests must assert database behavior, not import migration implementation details',
  },
  {
    name: 'explicit-any',
    pattern: /\bas\s+any\b|:\s*any\b|<any>/,
    message: 'Tests must use an explicit contract instead of any',
  },
]

export function findTestSuiteViolations(files) {
  const violations = []

  for (const file of files) {
    const normalized = file.path.split(sep).join('/')
    const lines = file.source.split(/\r?\n/)

    for (const rule of rules) {
      lines.forEach((line, index) => {
        if (rule.pattern.test(line)) {
          violations.push({
            path: normalized,
            line: index + 1,
            rule: rule.name,
            message: rule.message,
          })
        }
      })
    }

    if (
      normalized.includes('/functional/') &&
      normalized.split('/functional/')[1] &&
      !normalized.split('/functional/')[1].includes('/') &&
      !normalized.endsWith('/functional/foundation.spec.ts')
    ) {
      violations.push({
        path: normalized,
        line: 1,
        rule: 'root-functional-monolith',
        message: 'Functional specifications must live under a bounded feature directory',
      })
    }

    if (
      file.source.includes('@adonisjs/core/services/test_utils') &&
      !normalized.endsWith('/tests/bootstrap.ts') &&
      !normalized.endsWith('/tests/support/database.ts')
    ) {
      violations.push({
        path: normalized,
        line: lines.findIndex((line) => line.includes('@adonisjs/core/services/test_utils')) + 1,
        rule: 'database-boundary-bypass',
        message: 'Use the guarded database isolation helpers from tests/support/database',
      })
    }
  }

  return violations
}

async function collectTypeScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await collectTypeScriptFiles(path)))
    else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push({ path, source: await readFile(path, 'utf8') })
    }
  }

  return files
}

async function main() {
  const violations = findTestSuiteViolations(await collectTypeScriptFiles(testsRoot))
  if (!violations.length) {
    console.log('Test-suite quality checks passed')
    return
  }

  for (const violation of violations) {
    console.error(
      `${relative(projectRoot, violation.path)}:${violation.line} [${violation.rule}] ${violation.message}`
    )
  }
  process.exitCode = 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}
