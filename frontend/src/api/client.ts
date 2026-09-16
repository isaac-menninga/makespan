import createClient from 'openapi-fetch'
import type { paths } from './schema'

export const apiClient = createClient<paths>({
  baseUrl: '',
  // Resolve `fetch` at call time (rather than capturing `globalThis.fetch`
  // once here) so tests can swap it in with `vi.stubGlobal('fetch', ...)`
  // after this module has already been imported.
  fetch: (...args) => globalThis.fetch(...args),
})
