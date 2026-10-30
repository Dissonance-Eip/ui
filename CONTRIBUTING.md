# Contributing to Dissonance UI

The full contribution guide for every Dissonance repository lives in the docs
repository: [Contributing to Dissonance](https://github.com/Dissonance-Eip/docs/blob/main/CONTRIBUTING.md).

The short version for this repository:

- Start from an issue and branch from it.
- Branch from `dev` and open your pull request against `dev`, not `main`.
- Before pushing, run `npm run lint`, `npm run format:check`, `npm test` and
  `npm run build`.

## Pre-commit hook

`npm install` (or `npm ci`) installs a git pre-commit hook through
[husky](https://typicode.github.io/husky/) and
[lint-staged](https://github.com/lint-staged/lint-staged). There is no extra
setup step. On every `git commit` the hook works on the staged files only:

- `.js`, `.mjs` and `.cjs` files: `eslint --fix`, then `prettier --write`.
- Every other file Prettier knows how to format: `prettier --write`.

It uses the same `eslint.config.js`, `.prettierrc.json` and `.prettierignore`
as `npm run lint` and `npm run format`. Fixed files are added back to the
commit, and changes you have not staged are left alone. If ESLint still
reports an error it cannot fix, the commit is stopped and the errors are
printed. Fix them and commit again.

The hook never runs or changes tests. Run `npm test` yourself; CI runs the
full checks on every push.

In an emergency you can skip the hook with `git commit --no-verify`. CI will
still reject lint or format errors, so fix them in a follow-up commit.

Found a security problem? Do not open a public issue; follow the
[security policy](https://github.com/Dissonance-Eip/docs/blob/main/.github/SECURITY.md).
