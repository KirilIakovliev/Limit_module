export class ApiError extends Error {
  readonly status: number;
  readonly detail: string | null;

  constructor(status: number, detail: string | null) {
    super(detail ?? `HTTP ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

const BASE = '/api';

function isAbort(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError';
}

async function readDetail(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    if (!body || typeof body !== 'object' || !('detail' in body)) return null;
    const detail = body.detail;
    return typeof detail === 'string' ? detail : JSON.stringify(detail);
  } catch {
    return null;
  }
}

export async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, { headers: { Accept: 'application/json' }, signal });
  } catch (error) {
    if (isAbort(error)) throw error;
    throw new ApiError(0, error instanceof Error ? error.message : 'network');
  }
  if (!response.ok) throw new ApiError(response.status, await readDetail(response));
  return response.json() as Promise<T>;
}
