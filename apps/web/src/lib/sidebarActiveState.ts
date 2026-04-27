/**
 * Resolves whether a sidebar menu item is the active route given the current
 * URL. Sidebar items can carry a `?filter=` query (Favorites/Shared/Trash all
 * deep-link into /drive with a filter chip), so a plain pathname compare is
 * not enough.
 *
 * Rules:
 *  - Pathname must match exactly.
 *  - If the item has `?filter=X`, current `?filter` must equal X.
 *  - If the item has no filter (e.g. plain /drive), it's active when the URL
 *    has no filter or `filter=all`.
 */
export function isItemActive(itemPath: string, pathname: string, search: string): boolean {
  const [itemPathname, itemQuery] = itemPath.split('?');
  if (pathname !== itemPathname) return false;

  const itemFilter = new URLSearchParams(itemQuery ?? '').get('filter');
  const currentFilter = new URLSearchParams(search).get('filter');

  if (itemFilter) return currentFilter === itemFilter;
  return !currentFilter || currentFilter === 'all';
}
