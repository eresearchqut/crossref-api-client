export interface PaginateOptions {
  /** Items requested per page. Defaults to 100; Crossref allows up to 1000. */
  rows?: number;
}

interface Page<T> {
  message: {
    items?: T[];
    total_results?: number;
    next_cursor?: string;
  };
}

/**
 * Yields every item of a Crossref list endpoint using cursor paging, requesting pages lazily so the caller can stop early.
 * `fetchPage` receives the cursor and the page size to pass as `cursor` and `rows`. Cursors avoid the 10,000 item limit of `offset`.
 */
export async function* paginate<T>(
  fetchPage: (cursor: string, rows: number) => Promise<Page<T>>,
  { rows = 100 }: PaginateOptions = {},
): AsyncGenerator<T, void, undefined> {
  let cursor = '*';
  let seen = 0;
  while (true) {
    const { items = [], total_results, next_cursor } = (await fetchPage(cursor, rows)).message;
    yield* items;
    seen += items.length;
    // Crossref's documented end condition is a short page; the other checks avoid a wasted request or a loop.
    if (items.length < rows || !next_cursor || (total_results !== undefined && seen >= total_results)) {
      return;
    }
    cursor = next_cursor;
  }
}

/** Drains an async iterable into an array. */
export async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const all: T[] = [];
  for await (const item of iterable) {
    all.push(item);
  }
  return all;
}
