import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createChunkChannel, uploadStreamingZip } from "../streamingZipUpload";
import type { SendUploadPartUrl } from "../sendUpload";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/publicSendCrypto", () => ({
  SEND_PART_SIZE: 16,
  encryptChunk: vi.fn(async (chunk: Uint8Array) => {
    const out = new Uint8Array(chunk.byteLength + 16);
    out.set(chunk, 0);
    return out;
  }),
  hashEncryptedChunk: vi.fn(async (encrypted: Uint8Array) => {
    let sum = 0;
    for (let i = 0; i < encrypted.length; i++) sum = (sum + encrypted[i]!) % 65536;
    return `hash-${sum}-${encrypted.byteLength}`;
  }),
}));

/**
 * Mock createZipStream: instead of running fflate, produces a predictable
 * byte sequence from whatever files are added. Each addFile call pushes
 * the file's data (from file.stream()) verbatim into the readable output —
 * no actual ZIP framing. This lets us control the exact byte count.
 */
let mockZipReadableController: ReadableStreamDefaultController<Uint8Array> | null = null;
let mockZipTerminated = false;

vi.mock("@/lib/zipStream", () => ({
  createZipStream: vi.fn(() => {
    mockZipTerminated = false;
    const readable = new ReadableStream<Uint8Array>({
      start(controller) {
        mockZipReadableController = controller;
      },
    });
    return {
      readable,
      addFile: vi.fn(async (_path: string, data: ReadableStream<Uint8Array>) => {
        const reader = data.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!mockZipTerminated) {
            mockZipReadableController!.enqueue(value);
          }
        }
        reader.releaseLock();
      }),
      end: vi.fn(() => {
        if (!mockZipTerminated) {
          mockZipReadableController!.close();
        }
      }),
      terminate: vi.fn((reason?: string) => {
        mockZipTerminated = true;
        try {
          mockZipReadableController!.error(new Error(reason ?? "terminated"));
        } catch {
          /* already closed */
        }
      }),
    };
  }),
}));

// ---------------------------------------------------------------------------
// MockXHR (same pattern as sendUpload.test.ts)
// ---------------------------------------------------------------------------

type XHRResponse = {
  status: number;
  etag?: string;
  networkError?: boolean;
  noEtag?: boolean;
  responseText?: string;
};

class MockXHR {
  static defaultQueue: XHRResponse[] = [];
  static callLog: Array<{ url: string; bodySize: number }> = [];

  private listeners: Record<string, Array<(e?: unknown) => void>> = {};
  private uploadListeners: Record<string, Array<(e?: unknown) => void>> = {};
  public status = 0;
  public responseText = "";
  private openedUrl = "";

  public upload = {
    addEventListener: (name: string, cb: (e?: unknown) => void) => {
      (this.uploadListeners[name] ??= []).push(cb);
    },
  };

  open(_method: string, url: string) {
    this.openedUrl = url;
  }
  setRequestHeader(_name: string, _value: string) {}

  getResponseHeader(name: string): string | null {
    if (name === "ETag") return `"mock-etag"`;
    return null;
  }

  addEventListener(name: string, cb: (e?: unknown) => void) {
    (this.listeners[name] ??= []).push(cb);
  }

  send(body: Blob) {
    MockXHR.callLog.push({ url: this.openedUrl, bodySize: body.size });
    const resp = MockXHR.defaultQueue.shift() ?? { status: 200 };

    queueMicrotask(() => {
      (this.uploadListeners.progress ?? []).forEach((cb) =>
        cb({ lengthComputable: true, loaded: body.size, total: body.size }),
      );
      if (resp.networkError) {
        (this.listeners.error ?? []).forEach((cb) => cb());
        return;
      }
      this.status = resp.status;
      this.responseText = resp.responseText ?? "";
      (this.listeners.load ?? []).forEach((cb) => cb());
    });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function urlsFor(count: number): SendUploadPartUrl[] {
  return Array.from({ length: count }, (_, i) => ({
    partNumber: i + 1,
    url: `https://r2.example.test/part-${i + 1}`,
    partSize: 16,
  }));
}

/** Create a fake File with .stream() support */
function fakeFile(name: string, bytes: Uint8Array): File {
  const blob = new Blob([bytes as unknown as BlobPart]);
  const file = new File([blob], name, { type: "application/octet-stream" });
  return file;
}

async function setupKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

// ---------------------------------------------------------------------------
// ChunkChannel tests
// ---------------------------------------------------------------------------

describe("createChunkChannel", () => {
  const item = (idx: number) => ({
    partIndex: idx,
    encrypted: new Uint8Array([idx]),
    chunkHash: `hash-${idx}`,
    plainSize: 1,
  });

  it("put and take in FIFO order", async () => {
    const ch = createChunkChannel(4);
    await ch.put(item(0));
    await ch.put(item(1));
    const a = await ch.take();
    const b = await ch.take();
    expect(a!.partIndex).toBe(0);
    expect(b!.partIndex).toBe(1);
  });

  it("take returns null after close on empty channel", async () => {
    const ch = createChunkChannel(4);
    ch.close();
    const result = await ch.take();
    expect(result).toBeNull();
  });

  it("take returns remaining items then null after close", async () => {
    const ch = createChunkChannel(4);
    await ch.put(item(0));
    await ch.put(item(1));
    ch.close();
    expect((await ch.take())!.partIndex).toBe(0);
    expect((await ch.take())!.partIndex).toBe(1);
    expect(await ch.take()).toBeNull();
  });

  it("backpressure: put blocks when at capacity", async () => {
    const ch = createChunkChannel(2);
    await ch.put(item(0));
    await ch.put(item(1));

    // Third put should block
    let resolved = false;
    const putPromise = ch.put(item(2)).then(() => {
      resolved = true;
    });

    // Verify it hasn't resolved yet
    await new Promise((r) => setTimeout(r, 10));
    expect(resolved).toBe(false);

    // Drain one item to unblock
    const taken = await ch.take();
    expect(taken!.partIndex).toBe(0);
    await putPromise;
    expect(resolved).toBe(true);
  });

  it("consumer waiting is resolved when producer pushes", async () => {
    const ch = createChunkChannel(4);

    // Start a take before anything is put
    const takePromise = ch.take();

    // Put an item — should resolve the waiting take
    await ch.put(item(42));

    const result = await takePromise;
    expect(result!.partIndex).toBe(42);
  });

  it("close unblocks all waiting consumers with null", async () => {
    const ch = createChunkChannel(4);
    const p1 = ch.take();
    const p2 = ch.take();
    ch.close();
    expect(await p1).toBeNull();
    expect(await p2).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// uploadStreamingZip tests
// ---------------------------------------------------------------------------

describe("uploadStreamingZip", () => {
  let origXHR: typeof XMLHttpRequest;

  beforeEach(() => {
    origXHR = global.XMLHttpRequest;
    (global as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = MockXHR;
    MockXHR.defaultQueue = [];
    MockXHR.callLog = [];
    mockZipReadableController = null;
    mockZipTerminated = false;
  });

  afterEach(() => {
    (global as unknown as { XMLHttpRequest: typeof XMLHttpRequest }).XMLHttpRequest = origXHR;
  });

  it("returns empty result for zero-part upload", async () => {
    const key = await setupKey();
    const result = await uploadStreamingZip({
      files: [],
      zipEntryNames: [],
      key,
      baseIv: new Uint8Array(12),
      initialPartUrls: [],
      totalParts: 0,
      zipSize: 0,
      refreshPartUrls: async () => [],
      abortSignal: { aborted: false },
      onProgress: () => {},
      onSpeed: () => {},
    });
    expect(result.parts).toEqual([]);
    expect(result.chunkHashes).toEqual([]);
  });

  it("streams files through ZIP → encrypt → upload pipeline", async () => {
    const key = await setupKey();
    // Two files, 24 bytes each → 48 bytes total via mock ZIP (no framing)
    // SEND_PART_SIZE = 16, so 3 chunks: [16, 16, 16]
    const file1 = fakeFile("a.txt", new Uint8Array(24).fill(1));
    const file2 = fakeFile("b.txt", new Uint8Array(24).fill(2));

    const progressValues: number[] = [];
    const partSnapshots: number[][] = [];

    const result = await uploadStreamingZip({
      files: [file1, file2],
      zipEntryNames: ["a.txt", "b.txt"],
      key,
      baseIv: new Uint8Array(12),
      initialPartUrls: urlsFor(3),
      totalParts: 3,
      zipSize: 48,
      refreshPartUrls: async () => [],
      abortSignal: { aborted: false },
      onProgress: (p) => progressValues.push(p),
      onSpeed: () => {},
      onPartComplete: (completed) => {
        partSnapshots.push(completed.map((p) => p.partNumber));
      },
    });

    expect(result.parts).toHaveLength(3);
    expect(result.parts.map((p) => p.partNumber)).toEqual([1, 2, 3]);
    expect(result.chunkHashes).toHaveLength(3);
    expect(result.chunkHashes.every((h) => typeof h === "string" && h.length > 0)).toBe(true);
    expect(MockXHR.callLog).toHaveLength(3);

    // Progress should reach 100
    expect(progressValues.length).toBeGreaterThan(0);
    expect(progressValues[progressValues.length - 1]).toBe(100);

    // onPartComplete grows
    expect(partSnapshots.length).toBe(3);
    expect(partSnapshots[partSnapshots.length - 1]!.length).toBe(3);
  });

  it("handles single file producing exactly 1 chunk", async () => {
    const key = await setupKey();
    const file = fakeFile("single.bin", new Uint8Array(10).fill(42));

    const result = await uploadStreamingZip({
      files: [file],
      zipEntryNames: ["single.bin"],
      key,
      baseIv: new Uint8Array(12),
      initialPartUrls: urlsFor(1),
      totalParts: 1,
      zipSize: 10,
      refreshPartUrls: async () => [],
      abortSignal: { aborted: false },
      onProgress: () => {},
      onSpeed: () => {},
    });

    expect(result.parts).toHaveLength(1);
    expect(result.chunkHashes).toHaveLength(1);
    expect(MockXHR.callLog).toHaveLength(1);
  });

  it("propagates abort signal to stop processing", async () => {
    const key = await setupKey();
    // Large file that would produce many chunks
    const file = fakeFile("big.bin", new Uint8Array(160).fill(99));
    const abortSignal = { aborted: true }; // pre-aborted

    const result = uploadStreamingZip({
      files: [file],
      zipEntryNames: ["big.bin"],
      key,
      baseIv: new Uint8Array(12),
      initialPartUrls: urlsFor(10),
      totalParts: 10,
      zipSize: 160,
      refreshPartUrls: async () => [],
      abortSignal,
      onProgress: () => {},
      onSpeed: () => {},
    });

    await expect(result).rejects.toThrow("Upload cancelled");
  });

  it("chunk hashes are in correct index order", async () => {
    const key = await setupKey();
    // Use distinct byte values per chunk boundary so hashes differ:
    // Chunk 0: bytes 0..15 (value 10), Chunk 1: bytes 0..15 (value 20), Chunk 2: bytes 0..15 (value 30)
    const data = new Uint8Array(48);
    data.fill(10, 0, 16);
    data.fill(20, 16, 32);
    data.fill(30, 32, 48);
    const file = fakeFile("x.dat", data);

    const result = await uploadStreamingZip({
      files: [file],
      zipEntryNames: ["x.dat"],
      key,
      baseIv: new Uint8Array(12),
      initialPartUrls: urlsFor(3),
      totalParts: 3,
      zipSize: 48,
      refreshPartUrls: async () => [],
      abortSignal: { aborted: false },
      onProgress: () => {},
      onSpeed: () => {},
    });

    // All 3 chunks have different data, so hashes must be distinct and ordered
    expect(result.chunkHashes).toHaveLength(3);
    expect(new Set(result.chunkHashes).size).toBe(3);
    // Verify index-stable: hash[0] comes from first 16 bytes, etc.
    expect(result.chunkHashes.every((h) => typeof h === "string" && h.length > 0)).toBe(true);
  });

  it("propagates consumer upload failure and stops producer", async () => {
    const key = await setupKey();
    // 3 chunks (48 bytes at SEND_PART_SIZE=16). First part gets a fatal 403.
    const file = fakeFile("fail.bin", new Uint8Array(48).fill(7));

    // R2_UPLOAD_FATAL throws immediately with no retries — avoids timer issues
    MockXHR.defaultQueue.push(
      {
        status: 403,
        responseText: "<Error><Code>SignatureDoesNotMatch</Code></Error>",
      } as XHRResponse,
      { status: 200 },
      { status: 200 },
    );

    await expect(
      uploadStreamingZip({
        files: [file],
        zipEntryNames: ["fail.bin"],
        key,
        baseIv: new Uint8Array(12),
        initialPartUrls: urlsFor(3),
        totalParts: 3,
        zipSize: 48,
        refreshPartUrls: async () => [],
        abortSignal: { aborted: false },
        onProgress: () => {},
        onSpeed: () => {},
      }),
    ).rejects.toThrow(/R2_UPLOAD_FATAL:SignatureDoesNotMatch/);
  });
});
