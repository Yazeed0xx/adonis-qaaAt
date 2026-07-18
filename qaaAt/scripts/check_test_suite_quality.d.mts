export interface TestSource {
  path: string
  source: string
}

export interface TestSuiteViolation {
  path: string
  line: number
  rule: string
  message: string
}

export function findTestSuiteViolations(files: TestSource[]): TestSuiteViolation[]
