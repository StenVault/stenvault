/**
 * Pushback buffer over a ReadableStream reader.
 *
 * `fetch().body` (and R2 range responses, and File.stream()) yield
 * arbitrarily-sized chunks that don't align to whatever framing the
 * consumer wants to read. BufferedStreamReader hides that: `readExact(n)`
 * returns exactly `n` bytes or throws on truncation; `readRemaining()`
 * drains the stream into one buffer.
 *
 * Lives in @stenvault/aead-stream so both vault CVEF and Public Send
 * consume the same byte-stream primitive without reaching into each
 * other's code. No crypto here — just buffering.
 */
export class BufferedStreamReader {
    private reader: ReadableStreamDefaultReader<Uint8Array>;
    private buffer: Uint8Array;
    private bufferOffset: number;
    private done: boolean;

    constructor(reader: ReadableStreamDefaultReader<Uint8Array>, initialBuffer?: Uint8Array) {
        this.reader = reader;
        this.buffer = initialBuffer ?? new Uint8Array(0);
        this.bufferOffset = 0;
        this.done = false;
    }

    /** Read exactly `n` bytes from the stream, buffering across chunk boundaries. */
    async readExact(n: number): Promise<Uint8Array> {
        const result = new Uint8Array(n);
        let filled = 0;

        const available = this.buffer.length - this.bufferOffset;
        if (available > 0) {
            const toCopy = Math.min(available, n);
            result.set(this.buffer.subarray(this.bufferOffset, this.bufferOffset + toCopy), 0);
            this.bufferOffset += toCopy;
            filled += toCopy;

            if (this.bufferOffset >= this.buffer.length) {
                this.buffer = new Uint8Array(0);
                this.bufferOffset = 0;
            }
        }

        while (filled < n) {
            if (this.done) {
                throw new Error(`Unexpected end of stream: needed ${n} bytes, got ${filled}`);
            }

            const { done, value } = await this.reader.read();
            if (done) {
                this.done = true;
                if (filled < n) {
                    throw new Error(`Unexpected end of stream: needed ${n} bytes, got ${filled}`);
                }
                break;
            }

            const needed = n - filled;
            if (value.byteLength <= needed) {
                result.set(value, filled);
                filled += value.byteLength;
            } else {
                result.set(value.subarray(0, needed), filled);
                filled += needed;
                this.buffer = value.subarray(needed);
                this.bufferOffset = 0;
            }
        }

        return result;
    }

    /** Read all remaining bytes from the stream into a single Uint8Array. */
    async readRemaining(): Promise<Uint8Array> {
        const chunks: Uint8Array[] = [];
        let total = 0;

        const available = this.buffer.length - this.bufferOffset;
        if (available > 0) {
            chunks.push(this.buffer.subarray(this.bufferOffset, this.buffer.length));
            total += available;
            this.buffer = new Uint8Array(0);
            this.bufferOffset = 0;
        }

        while (!this.done) {
            const { done, value } = await this.reader.read();
            if (done) {
                this.done = true;
                break;
            }
            chunks.push(value);
            total += value.byteLength;
        }

        const result = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
            result.set(chunk, offset);
            offset += chunk.byteLength;
        }
        return result;
    }
}
