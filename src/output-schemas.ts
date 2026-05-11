/**
 * Shared Zod output schemas for MCP tool responses.
 *
 * Apps SDK requires every tool to declare its response shape via `outputSchema`
 * (so models can reason about results before invocation) and to return
 * `structuredContent` matching that shape. These schemas are intentionally
 * permissive (`passthrough()` on objects, `z.unknown()` on opaque payloads)
 * because the underlying Rybbit API often returns extra fields we don't model.
 */

import { z } from "zod";

/** Generic "data wrapper" response — most analytics endpoints return { data: [...] } */
export const dataWrapperOutput = {
  data: z.array(z.record(z.unknown())).optional().describe("Result rows"),
};

/** Plain array of records — wrapped under `data` for structuredContent compatibility */
export const arrayResultOutput = {
  data: z.array(z.record(z.unknown())).describe("Result rows"),
};

/** Pagination cursor info that some endpoints emit */
export const cursorOutput = {
  cursor: z
    .object({
      hasMore: z.boolean(),
      oldestTimestamp: z.string().nullable(),
    })
    .passthrough()
    .optional()
    .describe("Cursor for the next page of results"),
};

/** Generic success / message response */
export const successOutput = {
  success: z.boolean().optional(),
  message: z.string().optional(),
};
