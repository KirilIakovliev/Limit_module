import type { components, operations } from './schema';
import { ApiError, getJson, postJson } from './http';

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

export type ExportSection = 'info' | 'limits' | 'applications' | 'reserves';

export type ExportJob = {
  export_id: string;
  status: 'queued' | 'collecting' | 'building' | 'ready' | 'failed';
  progress: number;
  stage: string;
};

export function createExport(
  inn: string,
  body: { sections: ExportSection[]; filters: { as_of: string; today: string; show_closed: boolean } },
  signal?: AbortSignal,
) {
  return postJson<{ export_id: string }>(`/clients/${encodeURIComponent(present(inn, 'ИНН'))}/exports`, body, signal);
}

export function exportStatus(id: string, signal?: AbortSignal) {
  return getJson<ExportJob>(`/exports/${encodeURIComponent(id)}`, signal);
}

export async function downloadExport(id: string): Promise<void> {
  const response = await fetch(`/api/exports/${encodeURIComponent(id)}/download`);
  if (!response.ok) throw new ApiError(response.status, null);
  const blob = await response.blob();
  const match = /filename="?(limit_module_[0-9]{1,20}_\d{4}-\d{2}-\d{2}\.xlsx)"?/.exec(response.headers.get('Content-Disposition') ?? '');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = match?.[1] ?? 'limit_module.xlsx';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
