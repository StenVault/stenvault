import { describe, it, expect } from 'vitest';
import { isItemActive } from '../sidebarActiveState';

describe('isItemActive', () => {
  describe('pathname mismatch', () => {
    it('returns false when pathname does not match', () => {
      expect(isItemActive('/drive', '/home', '')).toBe(false);
    });

    it('returns false when filtered item is on a different page', () => {
      expect(isItemActive('/drive?filter=favorites', '/home', '?filter=favorites')).toBe(false);
    });
  });

  describe('item without filter on /drive', () => {
    const itemPath = '/drive';

    it('is active when URL has no filter', () => {
      expect(isItemActive(itemPath, '/drive', '')).toBe(true);
    });

    it('is active when URL has filter=all', () => {
      expect(isItemActive(itemPath, '/drive', '?filter=all')).toBe(true);
    });

    it('is NOT active when URL has filter=favorites', () => {
      expect(isItemActive(itemPath, '/drive', '?filter=favorites')).toBe(false);
    });

    it('is NOT active when URL has filter=trash', () => {
      expect(isItemActive(itemPath, '/drive', '?filter=trash')).toBe(false);
    });

    it('ignores unrelated query params', () => {
      expect(isItemActive(itemPath, '/drive', '?folderId=abc')).toBe(true);
    });
  });

  describe('item with filter (Favorites/Shared/Trash)', () => {
    it('Favorites is active when URL has filter=favorites', () => {
      expect(isItemActive('/drive?filter=favorites', '/drive', '?filter=favorites')).toBe(true);
    });

    it('Favorites is NOT active when URL has filter=trash', () => {
      expect(isItemActive('/drive?filter=favorites', '/drive', '?filter=trash')).toBe(false);
    });

    it('Favorites is NOT active when URL has no filter', () => {
      expect(isItemActive('/drive?filter=favorites', '/drive', '')).toBe(false);
    });

    it('Favorites is NOT active when URL has filter=all', () => {
      expect(isItemActive('/drive?filter=favorites', '/drive', '?filter=all')).toBe(false);
    });

    it('Trash is active when URL has filter=trash', () => {
      expect(isItemActive('/drive?filter=trash', '/drive', '?filter=trash')).toBe(true);
    });

    it('Shared is active when URL has filter=shared with extra params', () => {
      expect(isItemActive('/drive?filter=shared', '/drive', '?filter=shared&q=foo')).toBe(true);
    });
  });
});
