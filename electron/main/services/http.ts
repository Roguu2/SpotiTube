export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    readonly body: string
  ) {
    super(`HTTP ${status} for ${new URL(url).pathname}${body ? `: ${body.slice(0, 200)}` : ''}`)
    this.name = 'HttpError'
  }
}

export interface FetchJsonOptions extends Omit<RequestInit, 'signal'> {
  timeoutMs?: number
  /** Retries for 429 and 5xx responses, honouring Retry-After. */
  retries?: number
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

export async function fetchJson<T>(url: string, options: FetchJsonOptions = {}): Promise<T> {
  const { timeoutMs = 15_000, retries = 2, ...init } = options

  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })

    if (response.ok) {
      if (response.status === 204) return undefined as T
      return (await response.json()) as T
    }

    const retryable = response.status === 429 || response.status >= 500
    if (retryable && attempt < retries) {
      const retryAfter = Number(response.headers.get('retry-after'))
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt)
      continue
    }

    throw new HttpError(response.status, url, await response.text().catch(() => ''))
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
