import { describe, it, expect } from 'vitest';
import { AlertMessage } from '../renderer/components/AlertMessage.js';

const makeEl = () => ({ textContent: '', hidden: true });

describe('AlertMessage', () => {
  it('shows the message', () => {
    const el = makeEl();

    new AlertMessage(el).show('Only WAV files are supported.');

    expect(el.textContent).toBe('Only WAV files are supported.');
    expect(el.hidden).toBe(false);
  });

  it('clear() empties and hides it', () => {
    const el = makeEl();
    const alert = new AlertMessage(el);
    alert.show('Oops');

    alert.clear();

    expect(el.textContent).toBe('');
    expect(el.hidden).toBe(true);
  });

  it('does nothing without an element', () => {
    const alert = new AlertMessage(null);

    expect(() => {
      alert.show('Oops');
      alert.clear();
    }).not.toThrow();
  });
});
