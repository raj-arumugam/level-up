module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src/tests/integration'],
  testMatch: ['**/*.integration.test.ts'],
  setupFilesAfterEnv: ['<rootDir>/src/tests/integration/setup.ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
    '!src/tests/**',
  ],
  coverageDirectory: 'coverage/integration',
  coverageReporters: ['text', 'lcov', 'html'],
  testTimeout: 30000,
  maxWorkers: 1, // Run integration tests sequentially to avoid database conflicts
  forceExit: true,
  detectOpenHandles: true,
  verbose: true,
};