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

// jsdom (this project's test environment) doesn't implement ResizeObserver.
// This stub's observe() never fires a callback, so GanttChart falls back to
// its initial getBoundingClientRect() read (all-zero under jsdom), clamping
// to MIN_PLOT_WIDTH in every test — no per-test mocking needed since no
// existing test asserts on exact pixel positions.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver
