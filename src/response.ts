/**
 * Builds tool results and their output schemas.
 */

import { z } from "zod";
import { CHARACTER_LIMIT } from "./constants.js";

const cutMarkers = {
  truncated: z
    .boolean()
    .optional()
    .describe("True when rows were dropped to keep the response under the size cap"),
  note: z
    .string()
    .optional()
    .describe("Caveat about this response, e.g. how many rows were returned and how to get the rest"),
};

/**
 * Output schema for a tool: the declared fields plus the truncation markers.
 * Unknown keys pass, so a field added by a newer Rybbit server does not make
 * schema-validating clients reject the call.
 */
export function output<T extends z.ZodRawShape>(shape: T) {
  return z.object({ ...shape, ...cutMarkers }).passthrough();
}

/**
 * Drops rows from the largest top-level array until the serialized payload fits
 * `limit` characters, and says so in `truncated` / `note`.
 */
export function fitToLimit(
  payload: Record<string, unknown>,
  limit = CHARACTER_LIMIT
): Record<string, unknown> {
  const size = JSON.stringify(payload).length;
  if (size <= limit) return payload;

  let key: string | undefined;
  let rows: unknown[] = [];
  let rowsSize = 0;
  for (const [k, v] of Object.entries(payload)) {
    if (!Array.isArray(v)) continue;
    const s = JSON.stringify(v).length;
    if (s > rowsSize) [key, rows, rowsSize] = [k, v, s];
  }

  const noteRoom = 300;
  let used = size - rowsSize + noteRoom;
  let keep = 0;
  for (const row of rows) {
    used += JSON.stringify(row).length + 1;
    if (used > limit) break;
    keep++;
  }

  if (!key || keep === 0) {
    return {
      truncated: true,
      note: `The response is ${size} characters, over the ${limit} character cap, and cannot be shortened row by row. Narrow the date range or add filters. 'partial' holds the beginning of the raw JSON.`,
      partial: JSON.stringify(payload).slice(0, limit - noteRoom),
    };
  }

  const cut = `Showing ${keep} of the ${rows.length} rows in '${key}' because the full response would exceed ${limit} characters. Narrow the request to get the rest: a smaller limit and the next page, a shorter date range, a coarser bucket or filters.`;
  return {
    ...payload,
    [key]: rows.slice(0, keep),
    truncated: true,
    note: typeof payload.note === "string" ? `${payload.note} ${cut}` : cut,
  };
}

/**
 * Tool result carrying the same JSON as text and as structuredContent, so
 * clients that read only one of the two see the same data.
 */
export function jsonResult(payload: object) {
  const text = JSON.stringify(fitToLimit(payload as Record<string, unknown>));
  return {
    // Parsed back so both copies agree on what JSON drops (undefined fields).
    structuredContent: JSON.parse(text) as Record<string, unknown>,
    content: [{ type: "text" as const, text }],
  };
}
