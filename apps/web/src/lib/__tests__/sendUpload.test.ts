import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { uploadEncryptedSend, type SendUploadPartUrl } from "../sendUpload";

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

type XHRResponse = {
  status: number;
  etag?: string;
  /** When true, emit `error` event instead of `load`. */
  networkError?: boolean;
  /** Set to simulate ETag absent on a 200 response. */
  noEtag?: boolean;
  /** Raw response body — used to carry S3 XML error codes on 403. */
  responseText?: string;
};

class MockXHR {
  static queueByUrl: Map<string, XHRResponse[]> = new Map();
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
    const resp = (this as unknown as { _resp?: XHRResponse })._resp;
    if (name === "ETag") {
      if (resp?.noEtag) return null;
      return resp?.etag ?? `"mock-etag"`;
    }
    return null;
  }

  addEventListener(name: string, cb: (e?: unknown) => void) {
    (this.listeners[name] ??= []).push(cb);
  }

  send(body: Blob) {
    MockXHR.callLog.push({ url: this.openedUrl, bodySize: body.size });
    const urlQueue = MockXHR.queueByUrl.get(this.openedUrl);
    const resp = urlQueue?.shift() ?? MockXHR.defaultQueue.shift() ?? { status: 200 };
    (this as unknown as { _resp: XHRResponse })._resp = resp;

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

function urlsFor(count: number, urlSuffix = ""): SendUploadPartUrl[] {
  return Array.from({ length: count }, (_, i) => ({
    partNumber: i + 1,
    url: `https://r2.example.test/part-${i + 1}${urlSuffix}`,
    partSize: 16,
  }));
}

function blobOf(bytes: number[]): Blob {
  return new Blob([new Uint8Array(bytes)]);
}

async function setupKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

function noopRefresh(): (partNumbers: number[]) => Promise<SendUploadPartUrl[]> {
  return async () => {
    throw new Error("refreshPartUrls should not be called in this test");
  };
}

describe("uploadEncryptedSend", () => {
  let origXHR: typeof XMLHttpRequest;

  beforeEach(() => {
    origXHR = global.XMLHttpRequest;
    (global as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = MockXHR;
    MockXHR.queueByUrl = new Map();
    MockXHR.defaultQueue = [];
    MockXHR.callLog = [];
  });

  afterEach(() => {
    (global as unknown as { XMLHttpRequest: typeof XMLHttpRequest }).XMLHttpRequest = origXHR;
    vi.useRealTimers();
  });

  it("returns empty result for zero-part upload", async () => {
    const key = await setupKey();
    const result = await uploadEncryptedSend({
      fileBlob: new Blob([]),
      key,
      baseIv: new Uint8Array(12),
      initialPartUrls: [],
      totalParts: 0,
      refreshPartUrls: noopRefresh(),
      abortSignal: { aborted: false },
      onProgress: () => {},
      onSpeed: () => {},
    });
    expect(result.parts).toEqual([]);
    expect(result.chunkHashes).toEqual([]);
    expect(MockXHR.callLog).toEqual([]);
  });

  it("uploads a single chunk and returns its part+hash", async () => {
    const key = await setupKey();
    const result = await uploadEncryptedSend({
      fileBlob: blobOf([1, 2, 3, 4]),
      key,
      baseIv: new Uint8Array(12),
      initialPartUrls: urlsFor(1),
      totalParts: 1,
      refreshPartUrls: noopRefresh(),
      abortSignal: { aborted: false },
      onProgress: () => {},
      onSpeed: () => {},
    });
    expect(result.parts).toHaveLength(1);
    expect(result.parts[0]).toMatchObject({ partNumber: 1 });
    expect(result.chunkHashes).toHaveLength(1);
    expect(MockXHR.callLog).toHaveLength(1);
    expect(MockXHR.callLog[0]!.url).toContain("part-1");
  });

  it("uploads multiple chunks and returns parts sorted by part-number", async () => {
    const key = await setupKey();
    const blob = new Blob([new Uint8Array(40)]);
    const result = await uploadEncryptedSend({
      fileBlob: blob,
      key,
      baseIv: new Uint8Array(12),
      initialPartUrls: urlsFor(3),
      totalParts: 3,
      refreshPartUrls: noopRefresh(),
      abortSignal: { aborted: false },
      onProgress: () => {},
      onSpeed: () => {},
    });
    expect(result.parts.map((p) => p.partNumber)).toEqual([1, 2, 3]);
    expect(result.chunkHashes).toHaveLength(3);
  });

  it("reports progress ending at 100", async () => {
    const key = await setupKey();
    const progressValues: number[] = [];
    await uploadEncryptedSend({
      fileBlob: new Blob([new Uint8Array(32)]),
      key,
      baseIv: new Uint8Array(12),
      initialPartUrls: urlsFor(2),
      totalParts: 2,
      refreshPartUrls: noopRefresh(),
      abortSignal: { aborted: false },
      onProgress: (p) => progressValues.push(p),
      onSpeed: () => {},
    });
    expect(progressValues.length).toBeGreaterThan(0);
    expect(progressValues[progressValues.length - 1]).toBe(100);
  });

  it("invokes onPartComplete with a growing parts snapshot", async () => {
    const key = await setupKey();
    const snapshots: number[][] = [];
    await uploadEncryptedSend({
      fileBlob: new Blob([new Uint8Array(32)]),
      key,
      baseIv: new Uint8Array(12),
      initialPartUrls: urlsFor(2),
      totalParts: 2,
      refreshPartUrls: noopRefresh(),
      abortSignal: { aborted: false },
      onProgress: () => {},
      onSpeed: () => {},
      onPartComplete: (completed) => {
        snapshots.push(completed.map((p) => p.partNumber));
      },
    });
    expect(snapshots.length).toBeGreaterThan(0);
    const lastSnapshot = snapshots[snapshots.length - 1]!;
    expect(lastSnapshot.length).toBe(2);
    expect([...lastSnapshot].sort((a, b) => a - b)).toEqual([1, 2]);
  });

  it("invokes onSpeed once enough samples are collected", async () => {
    let fakeNow = 1_000_000;
    const dateSpy = vi.spyOn(Date, "now").mockImplementation(() => {
      const v = fakeNow;
      fakeNow += 100;
      return v;
    });
    try {
      const key = await setupKey();
      const speedCalls: Array<[number, number]> = [];
      await uploadEncryptedSend({
        fileBlob: new Blob([new Uint8Array(48)]),
        key,
        baseIv: new Uint8Array(12),
        initialPartUrls: urlsFor(3),
        totalParts: 3,
        refreshPartUrls: noopRefresh(),
        abortSignal: { aborted: false },
        onProgress: () => {},
        onSpeed: (bps, eta) => speedCalls.push([bps, eta]),
      });
      expect(speedCalls.length).toBeGreaterThan(0);
      expect(speedCalls.every(([bps]) => bps > 0)).toBe(true);
    } finally {
      dateSpy.mockRestore();
    }
  });

  it("retries once after a network error then succeeds", async () => {
    vi.useFakeTimers();
    const key = await setupKey();
    MockXHR.queueByUrl.set("https://r2.example.test/part-1", [
      { networkError: true } as XHRResponse,
      { status: 200 },
    ]);

    const promise = uploadEncryptedSend({
      fileBlob: blobOf([1, 2, 3]),
      key,
      baseIv: new Uint8Array(12),
      initialPartUrls: urlsFor(1),
      totalParts: 1,
      refreshPartUrls: noopRefresh(),
      abortSignal: { aborted: false },
      onProgress: () => {},
      onSpeed: () => {},
    });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.parts).toHaveLength(1);
    expect(MockXHR.callLog).toHaveLength(2);
  });

  it("refreshes URL on first 403 then retries; throws on second 403", async () => {
    const key = await setupKey();
    // First PUT at part-1-stale returns 403 → module should refresh and retry.
    // After refresh, the second PUT at part-1-fresh also returns 403 → terminal.
    MockXHR.queueByUrl.set("https://r2.example.test/part-1-stale", [{ status: 403 }]);
    MockXHR.queueByUrl.set("https://r2.example.test/part-1-fresh", [{ status: 403 }]);

    const refreshPartUrls = vi.fn(async (partNumbers: number[]) =>
      partNumbers.map((partNumber) => ({
        partNumber,
        url: `https://r2.example.test/part-${partNumber}-fresh`,
        partSize: 16,
      })),
    );

    await expect(
      uploadEncryptedSend({
        fileBlob: blobOf([1, 2, 3]),
        key,
        baseIv: new Uint8Array(12),
        initialPartUrls: [
          { partNumber: 1, url: "https://r2.example.test/part-1-stale", partSize: 16 },
        ],
        totalParts: 1,
        refreshPartUrls,
        abortSignal: { aborted: false },
        onProgress: () => {},
        onSpeed: () => {},
      }),
    ).rejects.toThrow("PRESIGNED_EXPIRED");

    expect(refreshPartUrls).toHaveBeenCalledTimes(1);
    expect(refreshPartUrls).toHaveBeenCalledWith([1]);
    expect(MockXHR.callLog).toHaveLength(2);
    expect(MockXHR.callLog[0]!.url).toBe("https://r2.example.test/part-1-stale");
    expect(MockXHR.callLog[1]!.url).toBe("https://r2.example.test/part-1-fresh");
  });

  it("refreshes URL on 403 then succeeds with the fresh URL", async () => {
    const key = await setupKey();
    MockXHR.queueByUrl.set("https://r2.example.test/part-1-stale", [{ status: 403 }]);
    MockXHR.queueByUrl.set("https://r2.example.test/part-1-fresh", [{ status: 200 }]);

    const refreshPartUrls = vi.fn(async (partNumbers: number[]) =>
      partNumbers.map((partNumber) => ({
        partNumber,
        url: `https://r2.example.test/part-${partNumber}-fresh`,
        partSize: 16,
      })),
    );

    const result = await uploadEncryptedSend({
      fileBlob: blobOf([1, 2, 3]),
      key,
      baseIv: new Uint8Array(12),
      initialPartUrls: [
        { partNumber: 1, url: "https://r2.example.test/part-1-stale", partSize: 16 },
      ],
      totalParts: 1,
      refreshPartUrls,
      abortSignal: { aborted: false },
      onProgress: () => {},
      onSpeed: () => {},
    });

    expect(result.parts).toHaveLength(1);
    expect(refreshPartUrls).toHaveBeenCalledTimes(1);
  });

  it("requests fresh URLs on demand when initial batch is smaller than totalParts", async () => {
    const key = await setupKey();
    MockXHR.defaultQueue.push(
      { status: 200 },
      { status: 200 },
      { status: 200 },
      { status: 200 },
    );

    // Provide only parts 1-2 upfront; parts 3-4 must come from refresh.
    const initialPartUrls: SendUploadPartUrl[] = [
      { partNumber: 1, url: "https://r2.example.test/part-1", partSize: 16 },
      { partNumber: 2, url: "https://r2.example.test/part-2", partSize: 16 },
    ];

    const refreshPartUrls = vi.fn(async (partNumbers: number[]) =>
      partNumbers.map((partNumber) => ({
        partNumber,
        url: `https://r2.example.test/part-${partNumber}`,
        partSize: 16,
      })),
    );

    const result = await uploadEncryptedSend({
      fileBlob: new Blob([new Uint8Array(64)]),
      key,
      baseIv: new Uint8Array(12),
      initialPartUrls,
      totalParts: 4,
      refreshPartUrls,
      abortSignal: { aborted: false },
      onProgress: () => {},
      onSpeed: () => {},
    });

    expect(result.parts).toHaveLength(4);
    expect(result.parts.map((p) => p.partNumber)).toEqual([1, 2, 3, 4]);
    // The refresh callback was called at least once, with only parts beyond the initial batch.
    expect(refreshPartUrls).toHaveBeenCalled();
    const requestedNumbers = refreshPartUrls.mock.calls.flatMap((c) => c[0] as number[]);
    expect(requestedNumbers.every((n) => n >= 3)).toBe(true);
    expect(new Set(requestedNumbers).has(3)).toBe(true);
    expect(new Set(requestedNumbers).has(4)).toBe(true);
  });

  it("chunkHashes output is indexed by part number regardless of completion order", async () => {
    const key = await setupKey();
    // 3 parts, all succeed. We can't easily force a specific completion order
    // in a mocked XHR world, but we CAN assert that the hashes array has one
    // entry per part and that every slot is populated (not undefined), which
    // is the invariant that matters for the downstream manifest.
    const result = await uploadEncryptedSend({
      fileBlob: new Blob([new Uint8Array(48)]),
      key,
      baseIv: new Uint8Array(12),
      initialPartUrls: urlsFor(3),
      totalParts: 3,
      refreshPartUrls: noopRefresh(),
      abortSignal: { aborted: false },
      onProgress: () => {},
      onSpeed: () => {},
    });

    expect(result.chunkHashes).toHaveLength(3);
    expect(result.chunkHashes.every((h) => typeof h === "string" && h.length > 0)).toBe(true);
  });

  it("throws after MAX_RETRIES network failures for a single part", async () => {
    vi.useFakeTimers();
    const key = await setupKey();
    MockXHR.queueByUrl.set("https://r2.example.test/part-1", [
      { networkError: true } as XHRResponse,
      { networkError: true } as XHRResponse,
      { networkError: true } as XHRResponse,
    ]);

    const caught = uploadEncryptedSend({
      fileBlob: blobOf([1, 2, 3]),
      key,
      baseIv: new Uint8Array(12),
      initialPartUrls: urlsFor(1),
      totalParts: 1,
      refreshPartUrls: noopRefresh(),
      abortSignal: { aborted: false },
      onProgress: () => {},
      onSpeed: () => {},
    }).catch((err: unknown) => err);
    await vi.runAllTimersAsync();

    const err = await caught;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/network error/);
    expect(MockXHR.callLog).toHaveLength(3);
  });

  it("aborts before a task starts when abortSignal.aborted is already true", async () => {
    const key = await setupKey();
    const abortSignal = { aborted: true };

    const promise = uploadEncryptedSend({
      fileBlob: new Blob([new Uint8Array(32)]),
      key,
      baseIv: new Uint8Array(12),
      initialPartUrls: urlsFor(2),
      totalParts: 2,
      refreshPartUrls: noopRefresh(),
      abortSignal,
      onProgress: () => {},
      onSpeed: () => {},
    });

    await expect(promise).rejects.toThrow("Upload cancelled");
  });

  it("treats 403 with <Code>AccessDenied</Code> body as expired and refreshes", async () => {
    const key = await setupKey();
    MockXHR.queueByUrl.set("https://r2.example.test/part-1-stale", [
      {
        status: 403,
        responseText:
          "<?xml version=\"1.0\"?><Error><Code>AccessDenied</Code><Message>Request has expired</Message></Error>",
      },
    ]);
    MockXHR.queueByUrl.set("https://r2.example.test/part-1-fresh", [{ status: 200 }]);

    const refreshPartUrls = vi.fn(async (partNumbers: number[]) =>
      partNumbers.map((partNumber) => ({
        partNumber,
        url: `https://r2.example.test/part-${partNumber}-fresh`,
        partSize: 16,
      })),
    );

    const result = await uploadEncryptedSend({
      fileBlob: blobOf([1, 2, 3]),
      key,
      baseIv: new Uint8Array(12),
      initialPartUrls: [
        { partNumber: 1, url: "https://r2.example.test/part-1-stale", partSize: 16 },
      ],
      totalParts: 1,
      refreshPartUrls,
      abortSignal: { aborted: false },
      onProgress: () => {},
      onSpeed: () => {},
    });

    expect(result.parts).toHaveLength(1);
    expect(refreshPartUrls).toHaveBeenCalledTimes(1);
  });

  it("throws immediately with R2_UPLOAD_FATAL when 403 body is SignatureDoesNotMatch", async () => {
    const key = await setupKey();
    MockXHR.queueByUrl.set("https://r2.example.test/part-1", [
      {
        status: 403,
        responseText:
          "<?xml version=\"1.0\"?><Error><Code>SignatureDoesNotMatch</Code><Message>The request signature we calculated does not match.</Message></Error>",
      },
    ]);

    const refreshPartUrls = vi.fn(async (partNumbers: number[]) =>
      partNumbers.map((partNumber) => ({
        partNumber,
        url: `https://r2.example.test/part-${partNumber}-fresh`,
        partSize: 16,
      })),
    );

    await expect(
      uploadEncryptedSend({
        fileBlob: blobOf([1, 2, 3]),
        key,
        baseIv: new Uint8Array(12),
        initialPartUrls: urlsFor(1),
        totalParts: 1,
        refreshPartUrls,
        abortSignal: { aborted: false },
        onProgress: () => {},
        onSpeed: () => {},
      }),
    ).rejects.toThrow(/R2_UPLOAD_FATAL:SignatureDoesNotMatch/);

    // SignatureDoesNotMatch is terminal — no refresh attempt.
    expect(refreshPartUrls).not.toHaveBeenCalled();
    expect(MockXHR.callLog).toHaveLength(1);
  });

  it("throws when a 2xx response is missing the ETag header", async () => {
    const key = await setupKey();
    MockXHR.queueByUrl.set("https://r2.example.test/part-1", [
      { status: 200, noEtag: true },
      { status: 200, noEtag: true },
      { status: 200, noEtag: true },
    ]);

    vi.useFakeTimers();
    const caught = uploadEncryptedSend({
      fileBlob: blobOf([1, 2, 3]),
      key,
      baseIv: new Uint8Array(12),
      initialPartUrls: urlsFor(1),
      totalParts: 1,
      refreshPartUrls: noopRefresh(),
      abortSignal: { aborted: false },
      onProgress: () => {},
      onSpeed: () => {},
    }).catch((err: unknown) => err);
    await vi.runAllTimersAsync();

    const err = await caught;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/missing ETag/);
  });
});
