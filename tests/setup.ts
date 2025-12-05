/**
 * Global test setup - mocks and environment configuration
 */

import { vi, beforeEach, afterEach } from 'vitest';

// Mock environment variables
process.env['ADO_PAT'] = 'test-pat-token';
process.env['ADO_ORGANIZATION'] = 'test-org';
process.env['ADO_PROJECT'] = 'test-project';
process.env['ADO_SYNC_LOG_LEVEL'] = 'silent';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  copyFile: vi.fn(),
  access: vi.fn(),
  mkdir: vi.fn(),
  stat: vi.fn(),
  constants: {
    R_OK: 4,
    W_OK: 2,
    X_OK: 1,
    F_OK: 0,
  },
}));

// Mock keytar
vi.mock('keytar', () => ({
  getPassword: vi.fn(),
  setPassword: vi.fn(),
  deletePassword: vi.fn(),
}));

// Mock axios
vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
    })),
  },
}));

// Mock consola to suppress output during tests
vi.mock('consola', () => ({
  consola: {
    debug: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    box: vi.fn(),
    level: 0,
  },
  createConsola: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    box: vi.fn(),
    level: 0,
  })),
}));

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
});

// Cleanup after each test
afterEach(() => {
  vi.restoreAllMocks();
});
