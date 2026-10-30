# Contributing to Dissonance UI

The full contribution guide for every Dissonance repository lives in the docs
repository: [Contributing to Dissonance](https://github.com/Dissonance-Eip/docs/blob/main/CONTRIBUTING.md).

The short version for this repository:

- Start from an issue and branch from it.
- Branch from `dev` and open your pull request against `dev`, not `main`.
- Write commit messages as `type(scope): summary (#issue)`, see
  [Commit messages](#commit-messages).
- Before pushing, run `npm run lint`, `npm run format:check`, `npm test` and
  `npm run build`.

## Commit messages

Commits follow [Conventional Commits](https://www.conventionalcommits.org):
`type(scope): summary (#issue)`, for example `fix(ui): keep the export button enabled (#98)`.
The scope is optional. Allowed types: `feat`, `fix`, `test`, `docs`, `refactor`,
`style`, `chore`, `ci`, `build`. Merge commits are not checked. See the
[full format description](https://github.com/Dissonance-Eip/docs/blob/main/CONTRIBUTING.md).

CI runs commitlint on every commit of a pull request and fails if one does not
match. `npm install` also sets up a local `commit-msg` hook (husky) that runs the
same check before the commit is created. To check by hand:

```bash
echo "fix(ui): example (#1)" | npx commitlint
```

Found a security problem? Do not open a public issue; follow the
[security policy](https://github.com/Dissonance-Eip/docs/blob/main/.github/SECURITY.md).
