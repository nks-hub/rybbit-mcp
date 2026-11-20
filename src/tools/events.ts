import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { FilterParam, QueryParams, RybbitClient, pageRows, unwrapRows } from "../client.js";
import { jsonResult, output } from "../response.js";
import { analyticsInputSchema, bucketSchema, limitSchema, paginationSchema } from "../schemas.js";

interface EventRow {
  event_name?: string;
  type?: string;
  [key: string]: unknown;
}

interface EventsCursor {
  hasMore?: boolean;
  oldestTimestamp?: string | null;
  oldestCursor?: string | null;
}

interface EventsApiResponse {
  data: EventRow[];
  cursor?: EventsCursor;
}

// Output schemas
const eventRowShape = z
  .object({
    event_name: z.string().optional(),
    type: z.string().optional(),
    properties: z.string().optional().describe("Raw property JSON, present only when it could not be parsed"),
    properties_parsed: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Event properties as an object"),
  })
  .passthrough();

const listEventsOutput = {
  data: z.array(eventRowShape).optional(),
  cursor: z
    .object({
      hasMore: z.boolean().optional(),
      oldestTimestamp: z.string().nullish(),
      oldestCursor: z.string().nullish().describe("Pass as beforeCursor to get the next older page"),
    })
    .passthrough()
    .optional()
    .describe("Absent when afterTimestamp is used"),
};

/**
 * Replaces the raw `properties` JSON string with the parsed `properties_parsed`
 * object, in place. A string that is not valid JSON is left as it is.
 */
function attachParsedProperties(rows: EventRow[] | undefined): void {
  if (!rows) return;
  for (const row of rows) {
    const raw = row.properties;
    if (typeof raw !== "string" || raw === "" || raw === "{}") continue;
    try {
      row.properties_parsed = JSON.parse(raw) as Record<string, unknown>;
      delete row.properties;
    } catch {
      // not JSON: the raw string stays
    }
  }
}

/**
 * Schema for the event_aggregate / event_user_leaderboard new tools.
 * Output shape: `{ groups: [{ key: string, count: number, ...extras }], scanned, hitCount, hasMore }`.
 */
const eventAggregateOutput = {
  groups: z
    .array(
      z
        .object({
          key: z.string().describe("Group key — joined values from groupBy fields"),
          count: z.number().describe("Number of events in this group"),
          first_seen: z.string().optional(),
          last_seen: z.string().optional(),
          sessions: z.number().optional(),
          extras: z.record(z.string(), z.unknown()).optional().describe("Per-group dimension values"),
        })
        .passthrough()
    )
    .describe("Grouped event counts, sorted by count DESC by default"),
  scanned: z.number().describe("Total events scanned across pagination"),
  hitCount: z.number().describe("Events matching eventName / property filters"),
  hasMore: z.boolean().describe("True if scan was capped by maxScan and more data exists"),
  windowStart: z.string().optional(),
  windowEnd: z.string().optional(),
};

const eventNamesOutput = {
  data: z
    .array(
      z
        .object({
          eventName: z.string().nullish(),
          count: z.number().nullish(),
        })
        .passthrough()
    )
    .optional(),
};

const eventPropertiesOutput = {
  data: z
    .array(
      z
        .object({
          propertyKey: z.string().nullish(),
          propertyValue: z.union([z.string(), z.number(), z.boolean()]).nullish(),
          count: z.number().nullish(),
        })
        .passthrough()
    )
    .optional()
    .describe("Property key/value pairs, most frequent first"),
  totalCount: z.number().optional().describe("Key/value pairs in the range, across all pages"),
};

const eventTimeseriesOutput = {
  data: z
    .array(
      z
        .object({
          time: z.string().nullish(),
          event_name: z.string().nullish(),
          event_count: z.number().nullish(),
        })
        .passthrough()
    )
    .optional(),
};

const outboundLinksOutput = {
  data: z
    .array(
      z
        .object({
          url: z.string().optional(),
          count: z.number().optional(),
          lastClicked: z.string().optional(),
        })
        .passthrough()
    )
    .describe("Outbound links, most clicked first"),
  totalCount: z.number().optional().describe("Links in the range, across all pages (the server reports at most 1000)"),
};

const SCAN_PAGE_SIZE = 1000;
const DEFAULT_MAX_SCAN = 5000;
const SCAN_COST_NOTE =
  "Events are read in pages of 1000, roughly 0.5 s each: the default maxScan of 5000 takes about 3 s, 50000 about 20 s.";

/**
 * Adds an event_name filter. The server applies it per event, so every row of a
 * page matches and a scan does not spend its budget on other events.
 */
function withEventName(
  filters: FilterParam[] | undefined,
  eventName: string | undefined
): FilterParam[] | undefined {
  if (!eventName) return filters;
  return [...(filters ?? []), { parameter: "event_name", type: "equals", value: [eventName] }];
}

/**
 * Reads events newest first, following the keyset cursor, until `maxScan` rows
 * are collected or the range is exhausted.
 */
async function scanEvents(
  client: RybbitClient,
  siteId: string,
  baseParams: QueryParams,
  maxScan: number
): Promise<{ rows: EventRow[]; hasMore: boolean }> {
  const rows: EventRow[] = [];
  let cursor: EventsCursor | undefined;
  let hasMore = false;

  while (rows.length < maxScan) {
    const params: QueryParams = {
      ...baseParams,
      page_size: Math.min(SCAN_PAGE_SIZE, maxScan - rows.length),
    };
    if (cursor?.oldestCursor) params.before_cursor = cursor.oldestCursor;
    else if (cursor?.oldestTimestamp) params.before_timestamp = cursor.oldestTimestamp;

    const page = await client.get<EventsApiResponse>(`/sites/${siteId}/events`, params);
    const next = page?.cursor;
    // A server that ignores the cursor parameter returns the same page again.
    if (
      cursor &&
      next?.oldestCursor === cursor.oldestCursor &&
      next?.oldestTimestamp === cursor.oldestTimestamp
    ) {
      break;
    }

    const batch = page?.data ?? [];
    for (const row of batch) rows.push(row);
    hasMore = Boolean(next?.hasMore);
    if (batch.length === 0 || !hasMore || !next) break;
    cursor = next;
  }

  attachParsedProperties(rows);
  return { rows, hasMore };
}

export function registerEventsTools(server: McpServer, client: RybbitClient): void {
  server.registerTool(
    "rybbit_list_events",
    {
      title: "List Events",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false, destructiveHint: false },
      description:
        "List raw events for a site, newest first. Returns individual event records with timestamps, types, pathnames, event names, and properties. " +
        "With eventName only matching events are returned. " +
        "To page back through history pass the previous response's `cursor.oldestCursor` as beforeCursor; there is no page number.",
      inputSchema: {
        ...analyticsInputSchema,
        limit: limitSchema(10),
        eventName: z
          .string()
          .optional()
          .describe("Only return events with this exact event_name (e.g., 'ad_click')."),
        beforeCursor: z
          .string()
          .optional()
          .describe("Return the events just older than this cursor. Use cursor.oldestCursor from the previous page."),
        beforeTimestamp: z
          .string()
          .optional()
          .describe("Return events strictly older than this timestamp (UTC 'YYYY-MM-DD HH:mm:ss'). Events sharing that second are skipped, so page with beforeCursor instead."),
        afterTimestamp: z
          .string()
          .optional()
          .describe("Return events strictly newer than this timestamp (UTC 'YYYY-MM-DD HH:mm:ss'), newest first. The server looks at the latest 500 such events and returns no cursor; cannot be combined with beforeCursor/beforeTimestamp."),
      },
      outputSchema: output(listEventsOutput),
      _meta: {
        "openai/toolInvocation/invoking": "Listing events…",
        "openai/toolInvocation/invoked": "Events loaded",
      },
    },
    async (args) => {
      try {
        const { limit, eventName, beforeCursor, beforeTimestamp, afterTimestamp, ...rest } = args;
        const params = client.buildAnalyticsParams({
          ...rest,
          filters: withEventName(rest.filters, eventName),
        });
        params.page_size = limit;
        if (beforeCursor) params.before_cursor = beforeCursor;
        if (beforeTimestamp) params.before_timestamp = beforeTimestamp;
        if (afterTimestamp) params.since_timestamp = afterTimestamp;

        const data = await client.get<EventsApiResponse>(`/sites/${args.siteId}/events`, params);

        let rows = data?.data ?? [];
        if (eventName) rows = rows.filter((e) => e.event_name === eventName);
        // since_timestamp ignores page_size.
        if (afterTimestamp) rows = rows.slice(0, limit);
        attachParsedProperties(rows);

        return jsonResult({ ...data, data: rows });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );

  // The Rybbit API has no event-grouping endpoint, so this tool scans raw
  // events and groups them here. `scanned` / `hasMore` tell the caller whether
  // the scan covered the whole range.
  server.registerTool(
    "rybbit_get_event_aggregate",
    {
      title: "Event Aggregate",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false, destructiveHint: false },
      description:
        "Aggregate events by one or more dimensions (e.g. identified_user_id, traits.username, pathname, properties.room_id). " +
        "Filters by event_name and optional property filters, then groups remaining events. " +
        "Returns `{ groups: [{key, count, first_seen, last_seen, sessions, extras}], scanned, hitCount, hasMore }`. " +
        "When `hasMore: true`, the scan stopped at maxScan before the start of the range: narrow the time window or raise `maxScan`. " +
        SCAN_COST_NOTE,
      inputSchema: {
        ...analyticsInputSchema,
        eventName: z
          .string()
          .optional()
          .describe("Optional exact event_name to filter for (e.g., 'signup')."),
        groupBy: z
          .array(z.string())
          .min(1)
          .describe(
            "One or more group keys. Built-in: 'identified_user_id', 'user_id', 'pathname', 'hostname', " +
              "'country', 'browser', 'device_type', 'traits.username', 'traits.sex'. " +
              "Use 'properties.<name>' to group by an event property (e.g. 'properties.room_id')."
          ),
        propertyFilters: z
          .array(
            z.object({
              key: z.string().describe("Property key (without 'properties.' prefix)"),
              operator: z
                .enum(["equals", "not_equals", "exists", "not_exists"])
                .describe("Filter operator"),
              value: z.union([z.string(), z.number(), z.boolean()]).optional(),
            })
          )
          .optional()
          .describe("Filters applied to parsed event properties after fetch."),
        maxScan: z
          .number()
          .int()
          .min(100)
          .max(50000)
          .optional()
          .describe(`Maximum events to read, newest first (default ${DEFAULT_MAX_SCAN}).`),
        topN: z
          .number()
          .int()
          .min(1)
          .max(500)
          .optional()
          .describe("Return only the top N groups by count (default 50)."),
      },
      outputSchema: output(eventAggregateOutput),
      _meta: {
        "openai/toolInvocation/invoking": "Aggregating…",
        "openai/toolInvocation/invoked": "Aggregate ready",
      },
    },
    async (args) => {
      try {
        const topN = args.topN ?? 50;
        const baseParams = client.buildAnalyticsParams({
          ...args,
          filters: withEventName(args.filters, args.eventName),
        });
        const { rows: seen, hasMore } = await scanEvents(
          client,
          args.siteId,
          baseParams,
          args.maxScan ?? DEFAULT_MAX_SCAN
        );

        // Filter scanned events down to matches.
        const filtered = seen.filter((row) => {
          if (args.eventName && row.event_name !== args.eventName) return false;
          if (args.propertyFilters?.length) {
            const props = (row as { properties_parsed?: Record<string, unknown> }).properties_parsed ?? {};
            for (const f of args.propertyFilters) {
              const v = props[f.key];
              if (f.operator === "equals" && v !== f.value) return false;
              if (f.operator === "not_equals" && v === f.value) return false;
              if (f.operator === "exists" && (v === undefined || v === null || v === "")) return false;
              if (f.operator === "not_exists" && v !== undefined && v !== null && v !== "") return false;
            }
          }
          return true;
        });

        // Resolve groupBy keys for each row → string.
        const resolveKey = (row: EventRow, dim: string): string => {
          if (dim.startsWith("traits.")) {
            const t = (row as { traits?: Record<string, unknown> | null }).traits ?? {};
            return String(t?.[dim.slice("traits.".length)] ?? "");
          }
          if (dim.startsWith("properties.")) {
            const p = (row as { properties_parsed?: Record<string, unknown> }).properties_parsed ?? {};
            return String(p[dim.slice("properties.".length)] ?? "");
          }
          return String((row as Record<string, unknown>)[dim] ?? "");
        };

        interface Bucket {
          key: string;
          count: number;
          sessions: Set<string>;
          first_seen?: string;
          last_seen?: string;
          extras: Record<string, unknown>;
        }
        const buckets = new Map<string, Bucket>();
        for (const row of filtered) {
          const keyParts = args.groupBy.map((dim) => resolveKey(row, dim));
          const compositeKey = keyParts.join("|");
          let bucket = buckets.get(compositeKey);
          if (!bucket) {
            const extras: Record<string, unknown> = {};
            args.groupBy.forEach((dim, i) => (extras[dim] = keyParts[i]));
            bucket = {
              key: compositeKey,
              count: 0,
              sessions: new Set(),
              extras,
            };
            buckets.set(compositeKey, bucket);
          }
          bucket.count++;
          const sid = (row as { session_id?: string }).session_id;
          if (sid) bucket.sessions.add(sid);
          const ts = (row as { timestamp?: string }).timestamp;
          if (ts) {
            if (!bucket.first_seen || ts < bucket.first_seen) bucket.first_seen = ts;
            if (!bucket.last_seen || ts > bucket.last_seen) bucket.last_seen = ts;
          }
        }

        const groups = [...buckets.values()]
          .sort((a, b) => b.count - a.count)
          .slice(0, topN)
          .map((b) => ({
            key: b.key,
            count: b.count,
            sessions: b.sessions.size,
            first_seen: b.first_seen,
            last_seen: b.last_seen,
            extras: b.extras,
          }));

        const result = {
          groups,
          scanned: seen.length,
          hitCount: filtered.length,
          hasMore,
          windowStart: filtered[filtered.length - 1]?.timestamp as string | undefined,
          windowEnd: filtered[0]?.timestamp as string | undefined,
        };

        return jsonResult(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "rybbit_get_event_user_leaderboard",
    {
      title: "Event User Leaderboard",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false, destructiveHint: false },
      description:
        "Returns the top users for a given event (e.g. who triggered the most message_sent, who clicked the most ad_click). " +
        "Groups by identified_user_id + traits.username. Answers questions like 'who sent the most messages today'. " +
        "By default only identified users are ranked; when that leaves events out, `note` says how many and how to include them. " +
        SCAN_COST_NOTE,
      inputSchema: {
        ...analyticsInputSchema,
        eventName: z.string().describe("Event name to rank users by (e.g. 'message_sent', 'signup', 'ad_click')."),
        topN: z.number().int().min(1).max(200).optional().describe("Top N users (default 25)."),
        maxScan: z
          .number()
          .int()
          .min(100)
          .max(50000)
          .optional()
          .describe(`Maximum events to read, newest first (default ${DEFAULT_MAX_SCAN}).`),
        identifiedOnly: z
          .boolean()
          .optional()
          .describe("If true (default), exclude anonymous users without identified_user_id. Set false on sites that do not identify users."),
      },
      outputSchema: output(eventAggregateOutput),
      _meta: {
        "openai/toolInvocation/invoking": "Ranking users…",
        "openai/toolInvocation/invoked": "Leaderboard ready",
      },
    },
    async (args) => {
      try {
        const identifiedOnly = args.identifiedOnly !== false;
        const topN = args.topN ?? 25;
        const baseParams = client.buildAnalyticsParams({
          ...args,
          filters: withEventName(args.filters, args.eventName),
        });
        const { rows: seen, hasMore } = await scanEvents(
          client,
          args.siteId,
          baseParams,
          args.maxScan ?? DEFAULT_MAX_SCAN
        );

        const matching = seen.filter((row) => row.event_name === args.eventName);
        const identified = matching.filter((row) => row.identified_user_id);
        const filtered = identifiedOnly ? identified : matching;
        const anonymous = matching.length - identified.length;

        interface Bucket {
          identified_user_id: string;
          user_id: string;
          username: string;
          count: number;
          sessions: Set<string>;
          first_seen?: string;
          last_seen?: string;
        }
        const buckets = new Map<string, Bucket>();
        for (const row of filtered) {
          const r = row as {
            identified_user_id?: string;
            user_id?: string;
            traits?: Record<string, unknown> | null;
            session_id?: string;
            timestamp?: string;
          };
          const iid = r.identified_user_id ?? "";
          const compositeKey = iid || r.user_id || "anon";
          let bucket = buckets.get(compositeKey);
          if (!bucket) {
            bucket = {
              identified_user_id: iid,
              user_id: r.user_id ?? "",
              username: String(r.traits?.username ?? ""),
              count: 0,
              sessions: new Set(),
            };
            buckets.set(compositeKey, bucket);
          }
          bucket.count++;
          if (r.session_id) bucket.sessions.add(r.session_id);
          // Prefer non-empty username if it appears later in scan
          if (!bucket.username && r.traits?.username) bucket.username = String(r.traits.username);
          if (r.timestamp) {
            if (!bucket.first_seen || r.timestamp < bucket.first_seen) bucket.first_seen = r.timestamp;
            if (!bucket.last_seen || r.timestamp > bucket.last_seen) bucket.last_seen = r.timestamp;
          }
        }

        const groups = [...buckets.values()]
          .sort((a, b) => b.count - a.count)
          .slice(0, topN)
          .map((b) => ({
            key: b.identified_user_id || b.user_id,
            count: b.count,
            sessions: b.sessions.size,
            first_seen: b.first_seen,
            last_seen: b.last_seen,
            extras: {
              identified_user_id: b.identified_user_id,
              user_id: b.user_id,
              username: b.username,
            },
          }));

        const result = {
          groups,
          scanned: seen.length,
          hitCount: filtered.length,
          hasMore,
          windowStart: filtered[filtered.length - 1]?.timestamp as string | undefined,
          windowEnd: filtered[0]?.timestamp as string | undefined,
          ...(identifiedOnly && anonymous > 0
            ? {
                note: `${anonymous} matching events came from visitors without an identified_user_id and were left out. Pass identifiedOnly=false to rank them by device user_id.`,
              }
            : {}),
        };

        return jsonResult(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "rybbit_get_event_names",
    {
      title: "Event Names",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false, destructiveHint: false },
      description:
        "Get all custom event names and their occurrence counts for a site. Useful for discovering what events are being tracked.",
      inputSchema: {
        ...analyticsInputSchema,
      },
      outputSchema: output(eventNamesOutput),
      _meta: {
        "openai/toolInvocation/invoking": "Loading event names…",
        "openai/toolInvocation/invoked": "Event names loaded",
      },
    },
    async (args) => {
      try {
        const params = client.buildAnalyticsParams(args);
        const data = await client.get(`/sites/${args.siteId}/events/names`, params);
        const wrapped = Array.isArray(data) ? { data } : (data as Record<string, unknown>);
        return jsonResult(wrapped);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "rybbit_get_event_properties",
    {
      title: "Event Properties",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false, destructiveHint: false },
      description:
        "Get property breakdowns for a specific custom event. Returns the distinct property key/value pairs with counts, most frequent first, 100 per page; `totalCount` says how many there are.",
      inputSchema: {
        ...analyticsInputSchema,
        eventName: z.string().describe("Event name to get properties for"),
        ...paginationSchema(100),
      },
      outputSchema: output(eventPropertiesOutput),
      _meta: {
        "openai/toolInvocation/invoking": "Loading properties…",
        "openai/toolInvocation/invoked": "Properties loaded",
      },
    },
    async (args) => {
      try {
        const { page, limit, ...rest } = args;
        const params = client.buildAnalyticsParams(rest);
        params.event_name = args.eventName;
        const data = await client.get(`/sites/${args.siteId}/events/properties`, params);
        // The endpoint returns every key/value pair and has no limit parameter.
        const rows = unwrapRows(data).rows.sort((a, b) => Number(b.count) - Number(a.count));
        return jsonResult(pageRows(rows, page, limit));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "rybbit_get_event_timeseries",
    {
      title: "Event Time Series",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false, destructiveHint: false },
      description:
        "Get custom event counts as time-series data, one row per event name and day unless another bucket is given. Useful for analyzing event trends over time.",
      inputSchema: {
        ...analyticsInputSchema,
        bucket: bucketSchema,
      },
      outputSchema: output(eventTimeseriesOutput),
      _meta: {
        "openai/toolInvocation/invoking": "Querying timeseries…",
        "openai/toolInvocation/invoked": "Timeseries loaded",
      },
    },
    async (args) => {
      try {
        const params = client.buildAnalyticsParams(args);
        const data = await client.get(`/sites/${args.siteId}/events/time-series`, params);
        const wrapped = Array.isArray(data) ? { data } : (data as Record<string, unknown>);
        return jsonResult(wrapped);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "rybbit_get_outbound_links",
    {
      title: "Outbound Links",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false, destructiveHint: false },
      description:
        "Get outbound link clicks tracked on the site. Shows which external URLs users are clicking and how often, most clicked first. " +
        "Returns 100 links per page by default; `totalCount` says how many there are.",
      inputSchema: {
        ...analyticsInputSchema,
        ...paginationSchema(100),
      },
      outputSchema: output(outboundLinksOutput),
      _meta: {
        "openai/toolInvocation/invoking": "Loading links…",
        "openai/toolInvocation/invoked": "Links loaded",
      },
    },
    async (args) => {
      try {
        const { page, limit, ...rest } = args;
        const params = client.buildAnalyticsParams(rest);
        const data = await client.get(`/sites/${args.siteId}/events/outbound`, params);
        // The endpoint returns up to 1000 links and has no limit parameter.
        const rows = unwrapRows(data).rows.sort((a, b) => Number(b.count) - Number(a.count));
        return jsonResult(pageRows(rows, page, limit));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );
}
