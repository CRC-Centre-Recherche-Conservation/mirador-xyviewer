import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Mock console methods to keep test output clean
vi.spyOn(console, 'debug').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});

// Mock window.fetch for tests
global.fetch = vi.fn();

// jsdom does not implement scrollIntoView — stub it globally so component tests pass.
window.HTMLElement.prototype.scrollIntoView = vi.fn();

// Reset mocks between tests
beforeEach(() => {
  vi.clearAllMocks();
});
