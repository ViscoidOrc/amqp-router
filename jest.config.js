module.exports = {
  verbose: !!process.env.VERBOSE,
  testPathIgnorePatterns: ['/node_modules/'],
  testRunner: 'jest-circus/runner',
  testEnvironment: 'node',
  reporters: ['default', 'jest-junit'],
  bail: false,
};
