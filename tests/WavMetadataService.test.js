import { describe, it, expect, beforeEach } from 'vitest';
import { WavMetadataService } from '../renderer/services/WavMetadataService.js';

describe('WavMetadataService', () => {
  let svc;

  beforeEach(() => {
    svc = new WavMetadataService();
  });

  describe('toBasicInfo', () => {
    it('extracts the filename from the path', () => {
      const out = svc.toBasicInfo('/Users/luca/song.wav', null);
      expect(out.filename).toBe('song.wav');
    });

    it('returns null fields when audio block is missing', () => {
      const out = svc.toBasicInfo('/x.wav', null);
      expect(out.sampleRate).toBeNull();
      expect(out.channels).toBeNull();
      expect(out.durationSec).toBeNull();
      expect(out.tags).toEqual({});
    });

    it('reads sampleRate / numChannels / durationSec from audio block', () => {
      const audio = { sampleRate: 44100, numChannels: 2, durationSec: 123.45 };
      const out = svc.toBasicInfo('/x.wav', audio);
      expect(out.sampleRate).toBe(44100);
      expect(out.channels).toBe(2);
      expect(out.durationSec).toBe(123.45);
    });

    it('ignores audio fields that are the wrong type', () => {
      const audio = { sampleRate: '44100', numChannels: null, durationSec: undefined };
      const out = svc.toBasicInfo('/x.wav', audio);
      expect(out.sampleRate).toBeNull();
      expect(out.channels).toBeNull();
      expect(out.durationSec).toBeNull();
    });

    it('passes tags through unchanged', () => {
      const tags = { title: 'Hello', artist: 'Me' };
      const out = svc.toBasicInfo('/x.wav', null, tags);
      expect(out.tags).toBe(tags);
    });

    it('defaults tags to {} when omitted', () => {
      const out = svc.toBasicInfo('/x.wav', null);
      expect(out.tags).toEqual({});
    });
  });

  describe('toBasicInfoFromMetadata', () => {
    it('unwraps a normal {ok, audio, tags} response', () => {
      const resp = {
        ok: true,
        audio: { sampleRate: 48000, numChannels: 1, durationSec: 10 },
        tags: { title: 'T' },
      };
      const out = svc.toBasicInfoFromMetadata('/song.wav', resp);
      expect(out.filename).toBe('song.wav');
      expect(out.sampleRate).toBe(48000);
      expect(out.channels).toBe(1);
      expect(out.durationSec).toBe(10);
      expect(out.tags).toEqual({ title: 'T' });
    });

    it('survives a response with no audio block', () => {
      const out = svc.toBasicInfoFromMetadata('/x.wav', { ok: false });
      expect(out.sampleRate).toBeNull();
      expect(out.tags).toEqual({});
    });

    it('survives a null response entirely', () => {
      const out = svc.toBasicInfoFromMetadata('/x.wav', null);
      expect(out.filename).toBe('x.wav');
      expect(out.tags).toEqual({});
    });
  });
});
