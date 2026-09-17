import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { hydrateSpec } from './transform'
import { validateDraft } from './validate'

type FixtureCase = { description: string; problem: unknown; shouldBeValid: boolean }

const fixturesPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../tests/fixtures/problem-validation-cases.json',
)
const cases: FixtureCase[] = JSON.parse(readFileSync(fixturesPath, 'utf-8'))

describe('validateDraft matches the shared backend fixtures', () => {
  for (const testCase of cases) {
    it(testCase.description, () => {
      const draft = {
        name: 'Fixture',
        ...hydrateSpec(testCase.problem as Parameters<typeof hydrateSpec>[0]),
      }
      expect(validateDraft(draft).isValid).toBe(testCase.shouldBeValid)
    })
  }
})
