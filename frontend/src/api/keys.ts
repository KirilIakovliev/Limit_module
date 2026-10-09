export const queryKeys = {
  health: ['health'] as const,
  meta: ['meta'] as const,
  search: (q: string) => ['clients', 'search', q] as const,
  client: (inn: string) => ['clients', 'card', inn] as const,
  limits: (inn: string) => ['clients', 'limits', inn] as const,
  group: (crmId: string) => ['groups', crmId] as const,
};
