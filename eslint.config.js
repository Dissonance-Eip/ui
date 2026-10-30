const js = require('@eslint/js');
const globals = require('globals');

// Shared by every block: no empty blocks (catch included) and every caught
// error must be used — logged or rethrown, never silently dropped.
const strictRules = {
  'no-empty': 'error',
  'no-unused-vars': [
    'error',
    {
      argsIgnorePattern: '^_',
      caughtErrors: 'all',
    },
  ],
};

// App code logs through a logger, never console directly. The loggers
// themselves are the only console sinks.
const LOGGER_FILES = ['main/logger.js', 'renderer/infrastructure/TerminalLogger.js'];

module.exports = [
  {
    ignores: ['build/**', 'node_modules/**', 'coverage/**'],
  },
  js.configs.recommended,
  {
    files: ['renderer/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
      },
    },
    rules: { ...strictRules, 'no-console': 'error' },
  },
  {
    files: ['**/*.js'],
    ignores: ['renderer/**/*.js', 'tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: { ...strictRules, 'no-console': 'error' },
  },
  {
    files: LOGGER_FILES,
    rules: { 'no-console': 'off' },
  },
  {
    // Test files use ESM (to import renderer source) and run under Node.
    files: ['tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: strictRules,
  },
];
