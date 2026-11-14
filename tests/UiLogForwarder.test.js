import { describe, it, expect, vi, afterEach } from 'vitest';
import { UiLogForwarder } from '../ipcHandlers/UiLogForwarder.js';
import { makeIpc, makeWebContents } from './helpers/fakeElectron.js';

const UI_LOG = 'ui:log';
const DROPPED = '[UI] (invalid log payload dropped)';

afterEach(() => {
  vi.restoreAllMocks();
});

/** Registers a forwarder and silences the console levels it may write to. */
function setup() {
  const ipc = makeIpc();
  new UiLogForwarder({ ipc }).register();
  const consoleSpies = Object.fromEntries(
    ['log', 'warn', 'error'].map((level) => [
      level,
      vi.spyOn(console, level).mockImplementation(() => {}),
    ])
  );
  const send = (payload) => ipc.emitFrom(makeWebContents(), UI_LOG, payload);
  return { send, console: consoleSpies };
}

describe('UiLogForwarder', () => {
  it('prints a renderer log line with [UI]', () => {
    const { send, console: spies } = setup();

    send({ level: 'log', message: 'hello' });

    expect(spies.log).toHaveBeenCalledWith('[UI] hello');
  });

  it.each(['warn', 'error'])('prints a renderer %s line as [handled] with [UI]', (level) => {
    const { send, console: spies } = setup();

    send({ level, message: 'hello' });

    expect(spies[level]).toHaveBeenCalledWith('[handled]', '[UI] hello');
  });

  it('prints an error nothing caught in the renderer as [unhandled]', () => {
    const { send, console: spies } = setup();

    send({ level: 'unhandled', message: 'Error: boom\n    at file:///renderer/app.js:1:1' });

    expect(spies.error).toHaveBeenCalledWith(
      '[unhandled]',
      '[UI] Error: boom\n    at file:///renderer/app.js:1:1'
    );
  });

  it.each([
    ['no payload', undefined],
    ['a payload that is not an object', 'hello'],
    ['a missing level', { message: 'no level' }],
    ['an unknown level', { level: 'shout', message: 'odd level' }],
    ['a message that is not text', { level: 'warn', message: 42 }],
    ['a missing message', { level: 'log' }],
  ])('drops a payload with %s and says so', (_case, payload) => {
    const { send, console: spies } = setup();

    expect(() => send(payload)).not.toThrow();

    expect(spies.warn).toHaveBeenCalledWith('[handled]', DROPPED);
    expect(spies.log).not.toHaveBeenCalled();
    expect(spies.error).not.toHaveBeenCalled();
  });
});
