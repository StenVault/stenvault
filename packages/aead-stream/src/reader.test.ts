import { describe, it, expect } from "vitest";
import { BufferedStreamReader } from "./reader";

describe("BufferedStreamReader.readExact", () => {
    it("handles cross-boundary reads over multiple chunks", async () => {
        const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(data.slice(0, 3));
                controller.enqueue(data.slice(3, 7));
                controller.enqueue(data.slice(7, 10));
                controller.close();
            },
        });

        const reader = new BufferedStreamReader(stream.getReader());

        const first = await reader.readExact(5);
        expect(Array.from(first)).toEqual([1, 2, 3, 4, 5]);

        const second = await reader.readExact(3);
        expect(Array.from(second)).toEqual([6, 7, 8]);

        const third = await reader.readExact(2);
        expect(Array.from(third)).toEqual([9, 10]);
    });

    it("consumes an initial pre-buffer before hitting the stream", async () => {
        const initial = new Uint8Array([1, 2, 3]);
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new Uint8Array([4, 5]));
                controller.close();
            },
        });

        const reader = new BufferedStreamReader(stream.getReader(), initial);
        const result = await reader.readExact(5);
        expect(Array.from(result)).toEqual([1, 2, 3, 4, 5]);
    });

    it("throws when the stream ends before n bytes are read", async () => {
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new Uint8Array([1, 2]));
                controller.close();
            },
        });

        const reader = new BufferedStreamReader(stream.getReader());
        await expect(reader.readExact(5)).rejects.toThrow("Unexpected end of stream");
    });

    it("splits a single oversized chunk and stashes the remainder", async () => {
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
                controller.close();
            },
        });

        const reader = new BufferedStreamReader(stream.getReader());
        const first = await reader.readExact(3);
        expect(Array.from(first)).toEqual([1, 2, 3]);
        const second = await reader.readExact(5);
        expect(Array.from(second)).toEqual([4, 5, 6, 7, 8]);
    });
});

describe("BufferedStreamReader.readRemaining", () => {
    it("drains the stream including a pushback buffer", async () => {
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new Uint8Array([1, 2, 3, 4, 5]));
                controller.enqueue(new Uint8Array([6, 7, 8]));
                controller.close();
            },
        });

        const reader = new BufferedStreamReader(stream.getReader());
        await reader.readExact(2);
        const rest = await reader.readRemaining();
        expect(Array.from(rest)).toEqual([3, 4, 5, 6, 7, 8]);
    });

    it("returns an empty array on an already-drained stream", async () => {
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.close();
            },
        });
        const reader = new BufferedStreamReader(stream.getReader());
        const all = await reader.readRemaining();
        expect(all.byteLength).toBe(0);
    });
});
