import { describe, it, expect } from 'vitest';
import {
  canProcess,
  DEFAULT_PERTURBATION,
  buildProcessingOptions,
} from '../renderer/utils/processingOptions.js';

describe('buildProcessingOptions & canProcess', () => {
  describe('DEFAULT_PERTURBATION', () => {
    it('is 0.8', () => {
      expect(DEFAULT_PERTURBATION).toBe(0.8);
    });
  });

  describe('buildProcessingOptions', () => {
    it('sends the safe default strength with explicitly selected modes', () => {
      const modes = ['white_noise', 'pink_noise'];
      const options = buildProcessingOptions(modes);

      expect(options).toEqual({ modes, perturbation: 0.8 });
    });

    it('returns null when modes is empty', () => {
      expect(buildProcessingOptions([])).toBeNull();
    });

    it('returns null when modes is undefined', () => {
      expect(buildProcessingOptions(undefined)).toBeNull();
    });

    it('preserves the mode list in the returned options', () => {
      const modes = ['spectral_gate', 'pink_noise'];
      const options = buildProcessingOptions(modes);
      expect(options.modes).toEqual(modes);
    });
  });

  describe('canProcess', () => {
    it('returns true when hasFile is true and modes has entries', () => {
      expect(canProcess(true, ['white_noise'])).toBe(true);
    });

    it('returns false when hasFile is false', () => {
      expect(canProcess(false, ['white_noise'])).toBe(false);
    });

    it('returns false when modes is empty', () => {
      expect(canProcess(true, [])).toBe(false);
    });

    it('returns false when modes is undefined', () => {
      expect(canProcess(true, undefined)).toBe(false);
    });

    it('returns false when hasFile is undefined', () => {
      expect(canProcess(undefined, ['white_noise'])).toBe(false);
    });
  });
});
