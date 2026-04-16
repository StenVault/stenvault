/**
 * Run a list of async tasks with a bounded concurrency limit.
 *
 * Output preserves the input order: `results[i]` is the resolution of
 * `tasks[i]`, regardless of which task finished first. If any task rejects,
 * the first error is thrown and no further tasks are scheduled (in-flight
 * ones still run to completion, but their results are discarded).
 *
 * Intended for the Send upload path where many presigned PUT requests need
 * to run in parallel without saturating the browser's socket budget.
 */
export async function runWithConcurrency<T>(
  tasks: ReadonlyArray<() => Promise<T>>,
  maxConcurrent: number,
): Promise<T[]> {
  if (tasks.length === 0) return [];
  if (maxConcurrent < 1 || !Number.isFinite(maxConcurrent)) {
    throw new Error(`maxConcurrent must be a positive integer, got ${maxConcurrent}`);
  }

  const results = new Array<T>(tasks.length);
  let nextIndex = 0;
  let firstError: unknown = null;
  let errored = false;

  const workerCount = Math.min(maxConcurrent, tasks.length);
  const workers: Promise<void>[] = [];

  for (let w = 0; w < workerCount; w++) {
    workers.push(
      (async () => {
        while (!errored) {
          const i = nextIndex++;
          if (i >= tasks.length) return;
          try {
            results[i] = await tasks[i]!();
          } catch (err) {
            if (!errored) {
              errored = true;
              firstError = err;
            }
            return;
          }
        }
      })(),
    );
  }

  await Promise.all(workers);

  if (errored) {
    throw firstError;
  }
  return results;
}
