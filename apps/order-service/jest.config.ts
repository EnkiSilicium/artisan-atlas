const ONLY = process.env.JEST_ONLY as 'entities' | 'repos' | undefined;

const TEST_MATCH_ALL = ['**/*.spec.ts'];
const TEST_MATCH_ENTITIES = ['**/*.entity.spec.ts'];
const TEST_MATCH_REPOS = ['**/*.repo.spec.ts'];

export default {
  displayName: 'order-service',
  preset: '../../jest.preset',

  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/apps/order-service',
  reporters: ['default', '<rootDir>/full-error-reporter.cjs'],
  testTimeout: 60000,
  testMatch:
    ONLY === 'entities'
      ? TEST_MATCH_ENTITIES
      : ONLY === 'repos'
        ? TEST_MATCH_REPOS
        : TEST_MATCH_ALL,
};
