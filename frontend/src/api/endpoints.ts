import type { components, operations } from './schema';
import { getJson } from './http';

type Schema<Name extends keyof components['schemas']> = components['schemas'][Name];
type Health = operations['health_check_api_health_get']['responses'][200]['content']['application/json'];

const SEARCH_LIMIT = '8';

function present(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} пуст`);
  return trimmed;
}

export function health(signal?: AbortSignal) {
  return getJson<Health>('/health', signal);
}

export function meta(signal?: AbortSignal) {
  return getJson<Schema<'Meta'>>('/meta', signal);
}

export function searchClients(q: string, signal?: AbortSignal) {
  const query = q.trim();
  if (query.length < 3) throw new Error('Поиск короче 3 символов');
  const params = new URLSearchParams({ q: query, limit: SEARCH_LIMIT });
  return getJson<Schema<'ClientShort'>[]>(`/clients?${params}`, signal);
}

export function client(inn: string, signal?: AbortSignal) {
  return getJson<Schema<'ClientCard'>>(`/clients/${encodeURIComponent(present(inn, 'ИНН'))}`, signal);
}

export function limits(inn: string, signal?: AbortSignal) {
  return getJson<Schema<'LimitsResponse'>>(
    `/clients/${encodeURIComponent(present(inn, 'ИНН'))}/limits`,
    signal,
  );
}

export function group(crmId: string, signal?: AbortSignal) {
  return getJson<Schema<'GroupCard'>>(`/groups/${encodeURIComponent(present(crmId, 'crmId'))}`, signal);
}
