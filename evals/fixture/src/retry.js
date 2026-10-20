// Retry with exponential backoff and jitter.
// Jitter spreads retries out so many failing sends do not all retry at the same instant.

const JITTER_MS = 1000;

export function backoffDelay(attempt, { baseMs = 200, maxDelayMs = 10_000 } = {}) {
  const exp = Math.min(maxDelayMs, baseMs * 2 ** attempt);
  const jitter = (Math.random() - 0.5) * JITTER_MS;
  return exp + jitter;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function withRetry(fn, { attempts = 3, ...delayOpts } = {}) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      if (attempt < attempts - 1) await sleep(backoffDelay(attempt, delayOpts));
    }
  }
  throw lastError;
}
