/**
 * Today's URL vocabulary and limits.
 *
 * In `src/config` rather than beside the queries because client components
 * need these values and the query layer is `server-only`. Nothing here
 * describes data — Today stores none.
 */

/** The one search param the page takes. Everything else is derived. */
export const TODAY_DATE_PARAM = "date";

/** How far ahead the "Up next" preview looks, and how much of it it shows. */
export const UPCOMING_WINDOW_DAYS = 7;
export const UPCOMING_PREVIEW_COUNT = 5;

/** How many dateless tasks the secondary section offers before linking out. */
export const UNSCHEDULED_PREVIEW_COUNT = 5;

/**
 * How many days either side of today the arrows will go.
 *
 * A bound, not a preference: the page reads a date from a URL, and "any day
 * in history" is an unbounded surface for no benefit. A year each way covers
 * review and planning; beyond that the calendar is the right tool.
 */
export const MAX_DAY_OFFSET = 365;
