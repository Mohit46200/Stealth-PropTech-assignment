// Typed client for the bill splitter API. Every call has a timeout and every failure
// becomes an ApiError, so components never have to deal with raw fetch errors.

export type Member = { id: string; homeId: string; name: string }
export type Home = { id: string; name: string }
export type HomeWithMembers = Home & { members: Member[] }
export type Share = { id: string; memberId: string; amountCents: number; paidAt: string | null }
export type Bill = {
  id: string
  homeId: string
  title: string
  totalCents: number
  shares: Share[]
}
export type Balance = { memberId: string; name: string; outstandingCents: number }

const REQUEST_TIMEOUT_MS = 10_000

export class ApiError extends Error {
  /** `status` is 0 when the request never got an answer (offline, timeout). */
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST'
  body?: unknown
  headers?: Record<string, string>
  signal?: AbortSignal
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout

  let response: Response
  try {
    response = await fetch(path, {
      method: options.method ?? 'GET',
      headers: { 'content-type': 'application/json', ...options.headers },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal,
    })
  } catch (error) {
    if (timeout.aborted) throw new ApiError(0, 'The server took too long to answer. Try again.')
    if (options.signal?.aborted) throw error
    throw new ApiError(0, 'Could not reach the server. Check your connection.')
  }

  const payload = await readJson(response)
  if (!response.ok) {
    throw new ApiError(response.status, errorMessage(payload, response.status))
  }
  return payload as T
}

// A 500 from a proxy can be HTML, so a body that is not JSON must not crash the page.
async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function errorMessage(payload: unknown, status: number): string {
  if (
    typeof payload === 'object' &&
    payload !== null &&
    'error' in payload &&
    typeof payload.error === 'string'
  ) {
    return payload.error
  }
  return status >= 500 ? 'The server had a problem. Try again.' : `Request failed (${status})`
}

export const api = {
  createHome: (name: string) => request<Home>('/api/homes', { method: 'POST', body: { name } }),

  getHome: (homeId: string, signal?: AbortSignal) =>
    request<HomeWithMembers>(`/api/homes/${encodeURIComponent(homeId)}`, { signal }),

  addMember: (homeId: string, name: string) =>
    request<Member>(`/api/homes/${encodeURIComponent(homeId)}/members`, {
      method: 'POST',
      body: { name },
    }),

  listBills: (homeId: string, signal?: AbortSignal) =>
    request<{ bills: Bill[] }>(`/api/homes/${encodeURIComponent(homeId)}/bills`, { signal }),

  createBill: (homeId: string, title: string, totalCents: number) =>
    request<Bill>(`/api/homes/${encodeURIComponent(homeId)}/bills`, {
      method: 'POST',
      body: { title, totalCents },
    }),

  payShare: (billId: string, shareId: string, idempotencyKey: string) =>
    request<Share>(
      `/api/bills/${encodeURIComponent(billId)}/shares/${encodeURIComponent(shareId)}/pay`,
      { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey } },
    ),

  getBalances: (homeId: string, signal?: AbortSignal) =>
    request<{ balances: Balance[] }>(`/api/homes/${encodeURIComponent(homeId)}/balances`, {
      signal,
    }),
}

export const queryKeys = {
  home: (homeId: string) => ['home', homeId] as const,
  bills: (homeId: string) => ['home', homeId, 'bills'] as const,
  balances: (homeId: string) => ['home', homeId, 'balances'] as const,
}
