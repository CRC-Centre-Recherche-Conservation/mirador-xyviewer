import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock console methods to keep test output clean
vi.spyOn(console, 'debug').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});

// Mock window.fetch for tests
global.fetch = vi.fn();

// Reset mocks between tests
beforeEach(() => {
  vi.clearAllMocks();
});
