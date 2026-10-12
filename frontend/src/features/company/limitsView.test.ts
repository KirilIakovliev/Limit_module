import { describe, expect, it } from 'vitest';
import { coversDate, groupByOwner, visibleLimits, type LimitRow } from './limitsView';

function row(patch: Partial<LimitRow> & Pick<LimitRow, 'owner' | 'product'>): LimitRow {
  return {
    status_code: 'active',
    is_exceeded: false,
    start_date: '2025-09-12',
    end_date: '2026-09-11',
    ...patch,
  };
}

describe('limitsView', () => {
  it('склеивает только соседний блок владельца', () => {
    const blocks = groupByOwner([
      row({ owner: 'Инвестиционный блок', product: 'А' }),
      row({ owner: 'Инвестиционный блок', product: 'Б' }),
      row({ owner: 'Корпоративный блок', product: 'В' }),
      row({ owner: 'Инвестиционный блок', product: 'Г' }),
    ]);
    expect(blocks.map((block) => [block.owner, block.items.length])).toEqual([
      ['Инвестиционный блок', 2],
      ['Корпоративный блок', 1],
      ['Инвестиционный блок', 1],
    ]);
  });

  it('отбирает лимиты по дате и прячет закрытые', () => {
    const rows = [
      row({ owner: 'Инвестиционный блок', product: 'МБК', end_date: '2026-09-11' }),
      row({ owner: 'Инвестиционный блок', product: 'Архив', status_code: 'inactive', end_date: '2026-03-11' }),
    ];
    expect(visibleLimits(rows, '2026-10-12', true, '2026-10-12').map((item) => item.product)).toEqual(['МБК', 'Архив']);
    expect(visibleLimits(rows, '2026-10-01', true, '2026-10-12').map((item) => item.product)).toEqual([]);
    expect(visibleLimits(rows, '2026-06-01', true, '2026-10-12').map((item) => item.product)).toEqual(['МБК']);
    expect(visibleLimits(rows, '2026-02-01', false, '2026-10-12').map((item) => item.product)).toEqual(['МБК']);
    expect(visibleLimits(rows, '2026-02-01', true, '2026-10-12').map((item) => item.product)).toEqual(['МБК', 'Архив']);
    expect(coversDate(row({ owner: '—', product: 'Без конца', end_date: null }), '2026-12-01', '2026-10-12')).toBe(true);
  });
});
