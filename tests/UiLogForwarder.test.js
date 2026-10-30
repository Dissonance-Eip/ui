import { describe, it, expect, vi, afterEach } from 'vitest';
import { UiLogForwarder } from '../ipcHandlers/UiLogForwarder.js';
import { makeIpc, makeWebContents } from './helpers/fakeElectron.js';

const UI_LOG = 'ui:log';

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
  it.each(['log', 'warn', 'error'])(
    'prints a renderer %s line at that level with [UI]',
    (level) => {
      const { send, console: spies } = setup();

      send({ level, message: 'hello' });

      expect(spies[level]).toHaveBeenCalledWith('[UI] hello');
    }
  );

  it('prints at log level when the level is missing or unknown', () => {
    const { send, console: spies } = setup();

    send({ message: 'no level' });
    send({ level: 'shout', message: 'odd level' });

    expect(spies.log).toHaveBeenCalledWith('[UI] no level');
    expect(spies.log).toHaveBeenCalledWith('[UI] odd level');
  });

  it('prints an empty line for a payload without a message', () => {
    const { send, console: spies } = setup();

    send(undefined);

    expect(spies.log).toHaveBeenCalledWith('[UI] ');
  });

  it('turns a non-string message into text', () => {
    const { send, console: spies } = setup();

    send({ level: 'warn', message: 42 });

    expect(spies.warn).toHaveBeenCalledWith('[UI] 42');
  });

  it('never throws on a message that cannot become text', () => {
    const { send, console: spies } = setup();
    const unprintable = {
      toString() {
        throw new Error('no text');
      },
    };

    expect(() => send({ message: unprintable })).not.toThrow();
    expect(spies.error).toHaveBeenCalledWith('[UI] (log forwarding failed)', expect.any(Error));
  });
});
