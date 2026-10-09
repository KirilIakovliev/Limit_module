import { useQuery } from '@tanstack/react-query';
import { client, group, health, limits, meta, searchClients } from './endpoints';
import { queryKeys } from './keys';

export function useHealth() {
  return useQuery({ queryKey: queryKeys.health, queryFn: ({ signal }) => health(signal) });
}

export function useMeta() {
  return useQuery({ queryKey: queryKeys.meta, queryFn: ({ signal }) => meta(signal) });
}

export function useSearch(q: string) {
  const query = q.trim();
  return useQuery({
    queryKey: queryKeys.search(query),
    queryFn: ({ signal }) => searchClients(query, signal),
    enabled: query.length >= 3,
  });
}

export function useClient(inn: string) {
  const value = inn.trim();
  return useQuery({
    queryKey: queryKeys.client(value),
    queryFn: ({ signal }) => client(value, signal),
    enabled: value.length > 0,
  });
}

export function useLimits(inn: string) {
  const value = inn.trim();
  return useQuery({
    queryKey: queryKeys.limits(value),
    queryFn: ({ signal }) => limits(value, signal),
    enabled: value.length > 0,
  });
}

export function useGroup(crmId: string, enabled = false) {
  const value = crmId.trim();
  return useQuery({
    queryKey: queryKeys.group(value),
    queryFn: ({ signal }) => group(value, signal),
    enabled: enabled && value.length > 0,
  });
}
