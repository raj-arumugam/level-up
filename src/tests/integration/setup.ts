import dotenv from 'dotenv';
import { testDb } from './testDatabase';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-integration-tests';
process.env.JWT_EXPIRES_IN = '24h';

// Use test database URL
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/portfolio_tracker_test';

// Mock console methods to reduce noise in tests
const originalConsole = global.console;
global.console = {
  ...originalConsole,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
};

// Global test timeout
jest.setTimeout(30000);

// Global setup and teardown
beforeAll(async () => {
  try {
    await testDb.setupTestDatabase();
  } catch (error) {
    console.error('Failed to setup test database:', error);
    throw error;
  }
});

afterAll(async () => {
  try {
    await testDb.teardownTestDatabase();
  } catch (error) {
    console.error('Failed to teardown test database:', error);
  }
});

// Add custom matchers
expect.extend({
  toBeOneOf(received: any, expected: any[]) {
    const pass = expected.includes(received);
    if (pass) {
      return {
        message: () => `expected ${received} not to be one of ${expected}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be one of ${expected}`,
        pass: false,
      };
    }
  },
});

// Declare custom matcher types
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeOneOf(expected: any[]): R;
    }
  }
}

export {};