import { describe, it, expect } from "vitest";
import { runWithConcurrency } from "../uploadConcurrency";

describe("runWithConcurrency", () => {
  it("returns an empty array for an empty task list", async () => {
    const result = await runWithConcurrency([], 3);
    expect(result).toEqual([]);
  });

  it("preserves input order in the output array", async () => {
    const tasks = [
      () => delayed(30, "a"),
      () => delayed(5, "b"),
      () => delayed(15, "c"),
      () => delayed(1, "d"),
    ];
    const result = await runWithConcurrency(tasks, 2);
    expect(result).toEqual(["a", "b", "c", "d"]);
  });

  it("never runs more than maxConcurrent tasks at once", async () => {
    let inFlight = 0;
    let peak = 0;
    const tasks = Array.from({ length: 12 }, (_, i) => async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await delay(20);
      inFlight--;
      return i;
    });

    const result = await runWithConcurrency(tasks, 3);
    expect(result).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(peak).toBe(3);
  });

  it("handles maxConcurrent greater than the task count cleanly", async () => {
    const tasks = [() => delayed(5, 1), () => delayed(5, 2)];
    const result = await runWithConcurrency(tasks, 10);
    expect(result).toEqual([1, 2]);
  });

  it("rejects with the first task error", async () => {
    const tasks = [
      async () => {
        throw new Error("boom");
      },
      async () => "ok",
    ];
    await expect(runWithConcurrency(tasks, 2)).rejects.toThrow("boom");
  });

  it("stops scheduling new tasks after the first error", async () => {
    let started = 0;
    const tasks = Array.from({ length: 5 }, (_, i) => async () => {
      started++;
      if (i === 0) throw new Error("boom");
      return i;
    });

    await expect(runWithConcurrency(tasks, 1)).rejects.toThrow("boom");
    // With maxConcurrent=1, tasks run strictly serially — after i=0 fails,
    // no further tasks should ever start.
    expect(started).toBe(1);
  });

  it("throws on non-positive maxConcurrent", async () => {
    await expect(runWithConcurrency([() => Promise.resolve(1)], 0)).rejects.toThrow();
    await expect(runWithConcurrency([() => Promise.resolve(1)], -1)).rejects.toThrow();
  });
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function delayed<T>(ms: number, value: T): Promise<T> {
  return delay(ms).then(() => value);
}
