/**
 * @vitest-environment node
 *
 * Service Worker download script — controller.close()/error() lifecycle.
 *
 * `apps/web/public/sw-download.js` is a script-style file (not a module) and
 * runs in the Service Worker global scope, so it can't be `import`ed
 * directly. We load the source via fs and execute it inside a `vm` context
 * with stubbed SW globals (`self.addEventListener`, etc.) so the
 * REGISTER_DOWNLOAD → port.onmessage flow can be exercised in isolation.
 *
 * The race fix (2026-05-05): for downloads whose final pull satisfies
 * Content-Length, the browser stops calling `pull()`. Without the fix, the
 * END handler set `ended = true` but `pullWaiter` was null, so
 * `controller.close()` never fired and the native download manager hung
 * at 100%. The fix captures the controller in `start()` and closes the
 * stream out-of-band when END (or error) arrives without a parked pull.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

interface FakePort {
  onmessage: ((e: { data: unknown }) => void) | null;
  postMessage: (data: unknown, transfer?: unknown[]) => void;
}

interface CapturedStream {
  controller: { enqueue: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  source: { start?: (c: unknown) => void; pull?: (c: unknown) => unknown; cancel?: () => void };
}

interface SWSandbox {
  __messageHandlers: Array<(e: { data: unknown }) => void>;
  __capturedStreams: CapturedStream[];
}

/**
 * Stubbed ReadableStream that captures the underlying source (start, pull,
 * cancel) and the controller, without ever invoking pull(). This models
 * the production race precisely: browser receives all bytes via the first
 * pull, then stops. Without a stub, Node's spec-compliant ReadableStream
 * re-fires pull() to maintain highWaterMark, masking the bug.
 */
function makeStubReadableStream(captures: CapturedStream[]): typeof ReadableStream {
  return class StubReadableStream {
    constructor(source: CapturedStream['source']) {
      const controller = {
        enqueue: vi.fn(),
        close: vi.fn(),
        error: vi.fn(),
      };
      captures.push({ controller, source });
      // Mirror the real spec: start() is called synchronously after
      // construction. This is what assigns streamController in
      // sw-download.js. We deliberately do NOT call pull() — that's the
      // race we're testing.
      source.start?.(controller);
    }
  } as unknown as typeof ReadableStream;
}

/**
 * Compile sw-download.js into a fresh sandbox per test. Stubs `self` so the
 * script's `addEventListener('message', ...)` registrations land in arrays
 * we can drive from the outside. The 'fetch' handler is captured but not
 * exercised — every test here drives the message path.
 */
function loadSwIntoSandbox(): SWSandbox {
  const swPath = resolve(__dirname, '../../../public/sw-download.js');
  const src = readFileSync(swPath, 'utf-8');

  const messageHandlers: Array<(e: { data: unknown }) => void> = [];
  const capturedStreams: CapturedStream[] = [];

  const fakeSelf = {
    addEventListener(event: string, handler: (e: unknown) => void) {
      if (event === 'message') messageHandlers.push(handler as (e: { data: unknown }) => void);
    },
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn() },
  };

  const sandbox: Record<string, unknown> = {
    self: fakeSelf,
    Map,
    ReadableStream: makeStubReadableStream(capturedStreams),
    Response: vi.fn(),
    Headers: vi.fn(),
    URL,
    Uint8Array,
    ArrayBuffer,
    Error,
    setTimeout,
    clearTimeout,
    encodeURIComponent,
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);

  return {
    __messageHandlers: messageHandlers,
    __capturedStreams: capturedStreams,
  };
}

function makeFakePort(): { port: FakePort; postedToClient: unknown[] } {
  const postedToClient: unknown[] = [];
  let handler: ((e: { data: unknown }) => void) | null = null;
  const port: FakePort = {
    get onmessage() { return handler; },
    set onmessage(h) { handler = h; },
    postMessage(data: unknown) { postedToClient.push(data); },
  };
  return { port, postedToClient };
}

/** Boilerplate: register a download with the SW and return the captured
 *  stream + port shim ready for further driving. */
function registerDownload(opts: { downloadId: string; totalSize: number }): {
  sw: SWSandbox;
  captured: CapturedStream;
  port: FakePort;
  postedToClient: unknown[];
} {
  const sw = loadSwIntoSandbox();
  const onMessage = sw.__messageHandlers[0]!;
  const { port, postedToClient } = makeFakePort();
  onMessage({
    data: {
      type: 'REGISTER_DOWNLOAD',
      downloadId: opts.downloadId,
      filename: 'test.bin',
      mimeType: 'application/octet-stream',
      totalSize: opts.totalSize,
      port,
    },
  });
  return { sw, captured: sw.__capturedStreams[0]!, port, postedToClient };
}

describe('sw-download.js — stream lifecycle', () => {
  it('closes stream from END handler when browser stops calling pull() (1-chunk regression)', async () => {
    const { captured, port, postedToClient } = registerDownload({ downloadId: 'dl-1', totalSize: 4 });
    expect(postedToClient).toContainEqual({ type: 'REGISTERED' });

    // Production matches: browser pulls once to drain the only chunk, then
    // stops because Content-Length is satisfied. We mirror by pushing the
    // chunk into localQueue and invoking pull manually exactly once.
    port.onmessage!({ data: new Uint8Array([1, 2, 3, 4]) });
    captured.source.pull!(captured.controller);
    expect(captured.controller.enqueue).toHaveBeenCalledOnce();
    expect(captured.controller.enqueue).toHaveBeenCalledWith(new Uint8Array([1, 2, 3, 4]));
    expect(postedToClient).toContainEqual({ type: 'ACK' });

    // No further pull() invocation here — that is the production race.
    port.onmessage!({ data: 'END' });

    // Without the fix: pullWaiter is null, in-pull close path unreachable,
    // controller.close() never fires.
    // With the fix: END handler closes streamController directly because
    // localQueue.length === 0.
    expect(captured.controller.close).toHaveBeenCalledOnce();
  });

  it('does NOT double-close when END races with a parked pull', async () => {
    // The defensive variant of the race: END arrives after a pull has been
    // re-parked. In the buggy version the END handler would close once and
    // the woken pull would close again, throwing TypeError on the
    // already-closed controller. The streamController null-guard inside
    // the in-pull `if (ended)` branch prevents the second close.
    const { captured, port } = registerDownload({ downloadId: 'dl-2', totalSize: 4 });

    // Drain the chunk via the legitimate pull path.
    port.onmessage!({ data: new Uint8Array([1, 2, 3, 4]) });
    captured.source.pull!(captured.controller);
    expect(captured.controller.enqueue).toHaveBeenCalledOnce();

    // Browser pulls again (consumed the chunk → desiredSize > 0). Queue
    // is empty, so pullWaiter is parked.
    captured.source.pull!(captured.controller);
    expect(captured.controller.close).not.toHaveBeenCalled();

    // END arrives. The handler closes directly *and* wakes the parked pull.
    port.onmessage!({ data: 'END' });

    // close() must be called exactly once across both paths.
    expect(captured.controller.close).toHaveBeenCalledOnce();
  });

  it('errors stream from out-of-band error message when no pull is parked', async () => {
    // Mirror of the END fix for the error path. If the client posts
    // { error: ... } and no pull is currently parked, the in-pull
    // `controller.error()` branch is unreachable. The fix surfaces the
    // error directly so the consumer sees a rejected stream.
    const { captured, port } = registerDownload({ downloadId: 'dl-3', totalSize: 4 });

    // No pull has been invoked — pullWaiter is null.
    port.onmessage!({ data: { error: 'upstream decrypt failed' } });

    expect(captured.controller.error).toHaveBeenCalledOnce();
    const [err] = captured.controller.error.mock.calls[0]!;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('upstream decrypt failed');

    // Late pull must not error a second time.
    captured.source.pull!(captured.controller);
    expect(captured.controller.error).toHaveBeenCalledOnce();
  });

  it('cancel handler null-guards streamController against late END', async () => {
    // Browser cancels the download (user closed tab, etc.). The cancel()
    // callback nulls streamController. A late END message must not call
    // close() again.
    const { captured, port } = registerDownload({ downloadId: 'dl-4', totalSize: 4 });

    captured.source.cancel!();

    // No pull has been invoked, no chunks delivered. END arrives late.
    port.onmessage!({ data: 'END' });

    expect(captured.controller.close).not.toHaveBeenCalled();
  });

  it('multi-chunk download still closes via the in-pull path (no regression)', async () => {
    // The happy multi-chunk path: each chunk is enqueued via pull, then
    // END arrives after a pull is parked → woken → tryDeliver sees
    // ended=true and closes via the in-pull branch. No out-of-band close
    // should fire because by the time END arrives, pullWaiter is parked.
    const { captured, port } = registerDownload({ downloadId: 'dl-5', totalSize: 12 });

    const chunks = [
      new Uint8Array([1, 2, 3, 4]),
      new Uint8Array([5, 6, 7, 8]),
      new Uint8Array([9, 10, 11, 12]),
    ];

    for (const chunk of chunks) {
      port.onmessage!({ data: chunk });
      captured.source.pull!(captured.controller);
    }
    expect(captured.controller.enqueue).toHaveBeenCalledTimes(3);

    // Queue empty, browser pulls once more — pullWaiter parks.
    captured.source.pull!(captured.controller);
    expect(captured.controller.close).not.toHaveBeenCalled();

    // END wakes the parked pull. Close fires exactly once (via the
    // in-pull branch, but the out-of-band branch also runs and is a
    // no-op thanks to the null-guard in `if (ended)`).
    port.onmessage!({ data: 'END' });
    expect(captured.controller.close).toHaveBeenCalledOnce();
  });
});
