// fetch with a timeout and retries, shared by every plugin that talks HTTP.
//
// Retried: network errors, timeouts, HTTP 429 and 5xx (waiting retry_delay_seconds, doubled each time, at most
// 30 s, or the server's Retry-After). Not retried: other 4xx (a wrong token or payload will not fix itself).
// After the last attempt a failing response is returned as is (so the caller reports it), a network error is thrown.

export type HttpOptions = {
    /** Retries after the first attempt (0 = try once). */
    retries: number;
    /** Timeout of each attempt, in milliseconds. */
    timeoutMs: number;
    /** Wait before the first retry, in milliseconds (doubled each time). */
    retryDelayMs: number;
};

export const DEFAULT_HTTP: HttpOptions = { retries: 3, timeoutMs: 10_000, retryDelayMs: 1_000 };

const MAX_DELAY_MS = 30_000;

let current: HttpOptions = DEFAULT_HTTP;

/** Sets the options used when a plugin does not pass its own (called once, from the config's [http] table). */
export function setHttpOptions(options: HttpOptions): void {
    current = options;
}

function retryAfterMs(response: Response): number | undefined {
    const value = response.headers.get('retry-after');
    if (!value) {
        return undefined;
    }
    const seconds = Number(value);
    return Number.isFinite(seconds) ? seconds * 1000 : undefined;
}

/**
 * `init` may be a function so that each attempt gets fresh values (e.g. a signed request with a new
 * timestamp and nonce, which the server may refuse to see twice).
 */
export async function fetchWithRetry(
    label: string,
    url: string,
    init: RequestInit | (() => RequestInit),
    options: HttpOptions = current,
): Promise<Response> {
    const attempts = options.retries + 1;

    for (let attempt = 1; ; attempt++) {
        let waitMs = Math.min(options.retryDelayMs * 2 ** (attempt - 1), MAX_DELAY_MS);
        let reason: string;

        try {
            const base = typeof init === 'function' ? init() : init;
            const response = await fetch(url, { ...base, signal: AbortSignal.timeout(options.timeoutMs) });
            if (response.ok || (response.status < 500 && response.status !== 429)) {
                return response;
            }
            if (attempt >= attempts) {
                return response;
            }
            reason = `${response.status} ${response.statusText}`;
            waitMs = Math.min(retryAfterMs(response) ?? waitMs, MAX_DELAY_MS);
            await response.body?.cancel();
        } catch (error) {
            if (attempt >= attempts) {
                throw error;
            }
            reason = error instanceof Error ? (error.name === 'TimeoutError' ? `timeout (${options.timeoutMs} ms)` : error.message) : String(error);
        }

        console.warn(`[WARN] ${label}: ${reason}; retrying in ${waitMs} ms (attempt ${attempt + 1}/${attempts})`);
        await Bun.sleep(waitMs);
    }
}
