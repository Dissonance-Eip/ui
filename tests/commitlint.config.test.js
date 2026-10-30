/**
 * Tests for the commit message format enforced by commitlint.config.js.
 *
 * Runs the real commitlint engine against sample messages so the team format
 * (`type(scope): summary (#issue)` with the agreed type list) cannot drift.
 */
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const lint = require('@commitlint/lint').default;
const load = require('@commitlint/load').default;
const config = require('../commitlint.config.js');

async function check(message) {
  const loaded = await load(config, { file: false });
  const parserOpts = loaded.parserPreset ? loaded.parserPreset.parserOpts : {};
  return lint(message, loaded.rules, { parserOpts });
}

describe('commitlint config', () => {
  it('extends the conventional config', () => {
    expect(config.extends).toContain('@commitlint/config-conventional');
  });

  it.each(['feat', 'fix', 'test', 'docs', 'refactor', 'style', 'chore', 'ci', 'build'])(
    'accepts type %s',
    async (type) => {
      const result = await check(`${type}(ui): add something (#98)`);
      expect(result.valid).toBe(true);
    }
  );

  it('accepts a message without a scope', async () => {
    expect((await check('fix: correct the export path (#98)')).valid).toBe(true);
  });

  it('rejects an unknown type', async () => {
    expect((await check('wip(ui): half done (#98)')).valid).toBe(false);
  });

  it('rejects a message with no type', async () => {
    expect((await check('update stuff')).valid).toBe(false);
  });

  it('lists exactly the agreed types', () => {
    const [, , types] = config.rules['type-enum'];
    expect(types).toEqual([
      'feat',
      'fix',
      'test',
      'docs',
      'refactor',
      'style',
      'chore',
      'ci',
      'build',
    ]);
  });
});
