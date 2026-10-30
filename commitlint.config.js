/**
 * Commitlint configuration.
 *
 * Enforces the team commit format: `type(scope): summary (#issue)`
 * (Conventional Commits). The full description lives in the docs repository
 * CONTRIBUTING.md. Merge commits are ignored by commitlint's default ignore
 * rules, so they stay allowed.
 */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'test', 'docs', 'refactor', 'style', 'chore', 'ci', 'build'],
    ],
  },
};
