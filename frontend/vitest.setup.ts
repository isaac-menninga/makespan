import '@testing-library/jest-dom/vitest'

// Node's native `Request` (unlike a browser) has no document to resolve a
// relative URL against, so `new Request('/api/presets')` throws under
// Vitest even though the same call works fine in the real app. openapi-fetch
// always constructs a `Request` internally, so give relative paths a stable
// origin to resolve against in tests.
const OriginalRequest = globalThis.Request
class TestRequest extends OriginalRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    if (typeof input === 'string' && input.startsWith('/')) {
      super(`http://localhost${input}`, init)
    } else {
      super(input, init)
    }
  }
}
globalThis.Request = TestRequest as unknown as typeof Request
