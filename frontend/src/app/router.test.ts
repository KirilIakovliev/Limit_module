import { describe, expect, it } from 'vitest';
import { routerBasename } from './router';

describe('routerBasename', () => {
  it('снимает слэш у /next/', () => {
    expect(routerBasename('/next/')).toBe('/next');
  });

  it('не задаёт basename для корня', () => {
    expect(routerBasename('/')).toBeUndefined();
  });
});
