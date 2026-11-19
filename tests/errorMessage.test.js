import { describe, it, expect } from 'vitest';
import { userErrorReason } from '../renderer/utils/errorMessage.js';

describe('userErrorReason', () => {
  it('drops the error class prefix the core reply carries', () => {
    expect(userErrorReason('Error: Failed to read audio data')).toBe('Failed to read audio data');
    expect(userErrorReason('TypeError: Input path must be a string')).toBe(
      'Input path must be a string'
    );
  });

  it('uses the message of a thrown error, without the IPC wrapper', () => {
    const err = new Error("Error invoking remote method 'core:process': Error: Failed to read WAV");

    expect(userErrorReason(err)).toBe('Failed to read WAV');
  });

  it('keeps only the first line, so no stack trace reaches the user', () => {
    expect(userErrorReason('Error: bad header\n    at parse (WavParser.cpp:62)')).toBe(
      'bad header'
    );
  });

  it('falls back to Unknown error when there is no reason', () => {
    expect(userErrorReason(undefined)).toBe('Unknown error');
    expect(userErrorReason('')).toBe('Unknown error');
    expect(userErrorReason('Error: ')).toBe('Unknown error');
  });
});
