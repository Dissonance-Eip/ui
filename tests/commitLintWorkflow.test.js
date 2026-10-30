/**
 * Tests for the commit message CI job and local hook wiring.
 *
 * Checks the workflow lints every commit from the PR base to head with full
 * history, and that the husky hook is wired through the prepare script.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('commit lint workflow', () => {
  const workflow = read('.github/workflows/commit-lint.yml');

  it('runs on pull requests', () => {
    expect(workflow).toMatch(/^on:\n {2}pull_request:/m);
  });

  it('fetches full history', () => {
    expect(workflow).toMatch(/fetch-depth: 0/);
  });

  it('lints from the PR base to the PR head', () => {
    expect(workflow).toContain('github.event.pull_request.base.sha');
    expect(workflow).toContain('github.event.pull_request.head.sha');
    expect(workflow).toMatch(/commitlint/);
  });
});

describe('local commit-msg hook', () => {
  it('is installed through the prepare script', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.scripts.prepare).toBe('husky');
  });

  it('runs commitlint on the message file', () => {
    expect(read('.husky/commit-msg')).toContain('commitlint --edit "$1"');
  });
});
