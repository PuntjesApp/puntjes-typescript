import type { PaginationMeta } from './generated/types.gen.js';

export interface Page<T> {
  data: T[];
  meta: PaginationMeta;
}

/**
 * Walks a paginated call page by page from page 1, until the last page in its meta, or until the server answers a page
 * other than the one asked for.
 */
export async function* paginate<T>(fetchPage: (page: number) => Promise<Page<T>>): AsyncGenerator<T> {
  for (let page = 1; ; page++) {
    const { data, meta } = await fetchPage(page);
    if (meta.current_page !== page) {
      return;
    }

    yield* data;

    if (page >= meta.last_page) {
      return;
    }
  }
}
