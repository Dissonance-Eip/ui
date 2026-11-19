# Contributing to Dissonance UI

The full contribution guide for every Dissonance repository lives in the docs
repository: [Contributing to Dissonance](https://github.com/Dissonance-Eip/docs/blob/main/CONTRIBUTING.md).

The short version for this repository:

- Start from an issue and branch from it.
- Branch from `main` and open your pull request against `main`. `main` is the
  only long-lived branch; see the
  [development workflow](https://github.com/Dissonance-Eip/docs/blob/main/planning/development-workflow.md).
- Before pushing, run `npm run lint`, `npm run format:check`, `npm test` and
  `npm run build`. A change to a user flow also runs `npm run test:e2e` (see the
  README's end-to-end tests section).

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

## Signing and notarizing macOS releases

Release tags (`v*`) build a macOS app that is signed with Luca's Developer ID
Application certificate and notarized by Apple, in CI only. Either maintainer
can cut a signed release by pushing a tag; nobody needs the certificate or an
Apple ID on their own machine. A tag build fails if a signing secret is
missing. A manual run of the workflow without the secrets builds an ad-hoc
signed app instead.

Local `npm run build` and `npm run dist` need no secret. They sign with a
Developer ID identity if your keychain has one, and fall back to an ad-hoc
signature otherwise. Notarization only runs when the `APPLE_API_*` variables
are set. To force an ad-hoc build on a machine that has an identity, run
`npx electron-builder --dir -c.mac.identity=-`.

### One-time setup (certificate owner)

1. **Export the certificate.** In Keychain Access, under **login → My
   Certificates**, expand "Developer ID Application: Luca Martinet
   (K27C2H5753)". Select both the certificate and its private key,
   right-click, choose **Export 2 items…**, save as `cert.p12` and set a strong
   password. Then copy it as base64:

   ```bash
   base64 -i cert.p12 | pbcopy
   ```

2. **Create an App Store Connect API key.** In
   [App Store Connect](https://appstoreconnect.apple.com/access/integrations/api),
   open **Users and Access → Integrations → Team Keys**, click **+**, name the
   key (for example "Dissonance CI") and give it the **Developer** role.
   Download the `.p8` file: Apple lets you download it only once. Note the
   **Key ID** shown in the key's row and the **Issuer ID** shown above the
   table.

3. **Add the five secrets** in ui → **Settings → Secrets and variables →
   Actions → New repository secret**:

   | Secret             | Value                                                       |
   | ------------------ | ----------------------------------------------------------- |
   | `CSC_LINK`         | the base64 text copied in step 1                            |
   | `CSC_KEY_PASSWORD` | the `.p12` password from step 1                             |
   | `APPLE_API_KEY`    | the full contents of the `.p8` file, `BEGIN`/`END` included |
   | `APPLE_API_KEY_ID` | the Key ID                                                  |
   | `APPLE_API_ISSUER` | the Issuer ID                                               |

   Then delete `cert.p12` and the `.p8` file from your disk (or move them to a
   password manager) and clear the clipboard.

4. **Check a signed build** by pushing a release candidate tag:

   ```bash
   git tag v0.1.2-rc.1 && git push origin v0.1.2-rc.1
   ```

   In the **Release App** run, the macOS job's "Verify macOS signature and
   notarization" step must pass. After downloading the `.dmg` from the
   pre-release, opening the app must not show a Gatekeeper warning, and
   `spctl -a -vvv -t exec /Applications/Dissonance.app` must report
   `source=Notarized Developer ID`.

### Rotation and expiry

- **API key:** it does not expire, but it can be revoked. To rotate it, create
  a new key, update `APPLE_API_KEY`, `APPLE_API_KEY_ID` and
  `APPLE_API_ISSUER`, then revoke the old key. Revoke it at once if it leaks.
- **Certificate:** a Developer ID Application certificate is valid for about
  five years (see its expiry date in Keychain Access). Before it expires,
  create a new one in the Apple Developer portal, export it again as in step 1
  and update `CSC_LINK` and `CSC_KEY_PASSWORD`. Releases already signed and
  notarized keep working after the certificate expires, because they carry a
  secure timestamp.

Found a security problem? Do not open a public issue; follow the
[security policy](https://github.com/Dissonance-Eip/docs/blob/main/.github/SECURITY.md).
