import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { RybbitClient, truncateResponse } from "../client.js";
import { analyticsInputSchema, bucketSchema, paginationSchema } from "../schemas.js";

interface EventRow {
  event_name?: string;
  type?: string;
  [key: string]: unknown;
}

interface EventsApiResponse {
  data: EventRow[];
  cursor?: { hasMore: boolean; oldestTimestamp: string | null };
}

// Output schemas
const eventRowShape = z
  .object({
    event_name: z.string().optional(),
    type: z.string().optional(),
    properties: z.string().optional().describe("Raw JSON-encoded property bag"),
    properties_parsed: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Same as `properties`, parsed into an object (added by MCP wrapper)"),
  })
  .passthrough();

const listEventsOutput = {
  data: z.array(eventRowShape).optional(),
  cursor: z
    .object({
      hasMore: z.boolean(),
      oldestTimestamp: z.string().nullable(),
    })
    .passthrough()
    .optional(),
};

/**
 * Parse the raw `properties` JSON string into `properties_parsed`. Mutates
 * each row in place. Kept lenient — invalid JSON just leaves the field unset.
 */
function attachParsedProperties(rows: EventRow[] | undefined): void {
  if (!rows) return;
  for (const row of rows) {
    const raw = row.properties;
    if (typeof raw !== "string" || raw === "" || raw === "{}") continue;
    try {
      row.properties_parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // ignore — leave properties_parsed unset
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
          event_name: z.string().optional(),
          count: z.number().optional(),
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
          key: z.string().optional(),
          value: z.union([z.string(), z.number(), z.boolean()]).optional(),
          count: z.number().optional(),
        })
        .passthrough()
    )
    .optional(),
};

const eventTimeseriesOutput = {
  data: z
    .array(
      z
        .object({
          time: z.string().optional(),
          count: z.number().optional(),
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
          clicks: z.number().optional(),
        })
        .passthrough()
    )
    .optional(),
};

export function registerEventsTools(server: McpServer, client: RybbitClient): void {
  server.registerTool(
    "rybbit_list_events",
    {
      title: "List Events",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false, destructiveHint: false },
      description:
        "List raw events for a site with filtering and pagination. Returns individual event records with timestamps, types, pathnames, event names, and properties. " +
        "When filtering by event_name, only matching events are returned (not entire sessions). " +
        "Use beforeTimestamp from a previous response's `cursor.oldestTimestamp` to paginate backwards through history.",
      inputSchema: {
        ...analyticsInputSchema,
        ...paginationSchema,
        eventName: z
          .string()
          .optional()
          .describe("Filter to only return events with this exact event_name (e.g., 'ad_click'). More precise than using the filters array which returns entire sessions."),
        beforeTimestamp: z
          .string()
          .optional()
          .describe("Return events strictly older than this timestamp (UTC 'YYYY-MM-DD HH:mm:ss'). Use cursor.oldestTimestamp from previous page."),
        afterTimestamp: z
          .string()
          .optional()
          .describe("Return events strictly newer than this timestamp (UTC). Mirrors beforeTimestamp for forward pagination."),
      },
      outputSchema: listEventsOutput,
      _meta: {
        "openai/toolInvocation/invoking": "Listing events…",
        "openai/toolInvocation/invoked": "Events loaded",
      },
    },
    async (args) => {
      try {
        const params = client.buildAnalyticsParams(args) as Record<string, unknown>;
        // Pass cursor through to backend if it accepts them; harmless if it
        // ignores unknown query params.
        if (args.beforeTimestamp) params.beforeTimestamp = args.beforeTimestamp;
        if (args.afterTimestamp) params.afterTimestamp = args.afterTimestamp;
        const data = await client.get<EventsApiResponse>(
          `/sites/${args.siteId}/events`,
          params as Record<string, string | number | boolean | undefined>
        );

        // Post-filter: if eventName specified, filter to only matching events
        // (backend's filter array is session-scoped not event-scoped).
        if (args.eventName && data?.data) {
          data.data = data.data.filter((e) => e.event_name === args.eventName);
        }

        // Parse the `properties` JSON-string into `properties_parsed` for
        // model consumption. Raw `properties` is kept for backward compat.
        attachParsedProperties(data?.data);

        return {
          structuredContent: data as unknown as Record<string, unknown>,
          content: [{ type: "text" as const, text: truncateResponse(data) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );

  // ---------------------------------------------------------------------
  // rybbit_get_event_aggregate
  //
  // Generic in-MCP aggregation over `/sites/:id/events`. Iterates the
  // cursor (oldestTimestamp) up to `maxScan` events, optionally filters by
  // event_name + property filters, then groups by one or more dimensions
  // and returns counts sorted DESC.
  //
  // This compensates for the Rybbit backend not exposing a native
  // event-grouping endpoint. It is honest about its limitation via
  // `scanned` / `hasMore` so the caller can widen the time window or
  // shrink the page count if needed.
  // ---------------------------------------------------------------------
  server.registerTool(
    "rybbit_get_event_aggregate",
    {
      title: "Event Aggregate",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false, destructiveHint: false },
      description:
        "Aggregate events by one or more dimensions (e.g. identified_user_id, traits.username, pathname, properties.room_id). " +
        "Filters by event_name and optional property filters, then groups remaining events. " +
        "Returns `{ groups: [{key, count, first_seen, last_seen, sessions, extras}], scanned, hitCount, hasMore }`. " +
        "When `hasMore: true`, the scan was capped — narrow the time window or raise `maxScan` for more accuracy.",
      inputSchema: {
        ...analyticsInputSchema,
        eventName: z
          .string()
          .optional()
          .describe("Optional exact event_name to filter for (e.g., 'pm_sent')."),
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
          .describe("Maximum events to scan from the backend (default 5000)."),
        topN: z
          .number()
          .int()
          .min(1)
          .max(500)
          .optional()
          .describe("Return only the top N groups by count (default 50)."),
      },
      outputSchema: eventAggregateOutput,
      _meta: {
        "openai/toolInvocation/invoking": "Aggregating…",
        "openai/toolInvocation/invoked": "Aggregate ready",
      },
    },
    async (args) => {
      try {
        const maxScan = args.maxScan ?? 5000;
        const topN = args.topN ?? 50;
        const pageSize = 200;
        // Pre-narrow at the upstream by injecting an event_name filter when
        // requested. The backend's filter array is session-scoped (returns
        // ALL events from sessions containing a match) — not perfect, but
        // dramatically reduces the scan compared to no filter at all.
        const argsWithFilter = args.eventName
          ? {
              ...args,
              filters: [
                ...(args.filters ?? []),
                { parameter: "event_name", type: "equals", value: [args.eventName] },
              ],
            }
          : args;
        const baseParams = client.buildAnalyticsParams(argsWithFilter) as Record<string, unknown>;

        const seen: EventRow[] = [];
        let cursor: string | undefined;
        let hasMore = false;

        while (seen.length < maxScan) {
          const params: Record<string, unknown> = { ...baseParams, limit: pageSize };
          if (cursor) params.beforeTimestamp = cursor;
          const page = await client.get<EventsApiResponse>(
            `/sites/${args.siteId}/events`,
            params as Record<string, string | number | boolean | undefined>
          );
          const rows = page?.data ?? [];
          if (rows.length === 0) break;
          attachParsedProperties(rows);
          for (const r of rows) seen.push(r);
          if (page.cursor && page.cursor.hasMore && page.cursor.oldestTimestamp) {
            cursor = page.cursor.oldestTimestamp;
            hasMore = page.cursor.hasMore;
          } else {
            hasMore = false;
            break;
          }
          // Don't exit on rows.length < pageSize — backend may return fewer
          // than requested even when more data exists (it caps internally).
          // Rely solely on cursor.hasMore, which was already checked above.
        }

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

        return {
          structuredContent: result as unknown as Record<string, unknown>,
          content: [{ type: "text" as const, text: truncateResponse(result) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );

  // ---------------------------------------------------------------------
  // rybbit_get_event_user_leaderboard
  //
  // Thin convenience wrapper over `rybbit_get_event_aggregate` that groups
  // by (identified_user_id, traits.username) and returns the top senders /
  // clickers / actors for a given event.
  // ---------------------------------------------------------------------
  server.registerTool(
    "rybbit_get_event_user_leaderboard",
    {
      title: "Event User Leaderboard",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false, destructiveHint: false },
      description:
        "Returns the top users for a given event (e.g. who sent the most pm_sent, who clicked the most ad_click). " +
        "Groups by identified_user_id + traits.username. Answers questions like 'kdo dnes poslal nejvíc vzkazů'.",
      inputSchema: {
        ...analyticsInputSchema,
        eventName: z.string().describe("Event name to rank users by (e.g. 'pm_sent', 'chat_v2_message_sent', 'ad_click')."),
        topN: z.number().int().min(1).max(200).optional().describe("Top N users (default 25)."),
        maxScan: z.number().int().min(100).max(50000).optional().describe("Maximum events to scan (default 5000)."),
        identifiedOnly: z
          .boolean()
          .optional()
          .describe("If true (default), exclude anonymous users without identified_user_id."),
      },
      outputSchema: eventAggregateOutput,
      _meta: {
        "openai/toolInvocation/invoking": "Ranking users…",
        "openai/toolInvocation/invoked": "Leaderboard ready",
      },
    },
    async (args) => {
      try {
        const identifiedOnly = args.identifiedOnly !== false;
        const maxScan = args.maxScan ?? 5000;
        const topN = args.topN ?? 25;
        const pageSize = 200;
        const baseParams = client.buildAnalyticsParams(args) as Record<string, unknown>;

        const seen: EventRow[] = [];
        let cursor: string | undefined;
        let hasMore = false;
        while (seen.length < maxScan) {
          const params: Record<string, unknown> = { ...baseParams, limit: pageSize };
          if (cursor) params.beforeTimestamp = cursor;
          const page = await client.get<EventsApiResponse>(
            `/sites/${args.siteId}/events`,
            params as Record<string, string | number | boolean | undefined>
          );
          const rows = page?.data ?? [];
          if (rows.length === 0) break;
          attachParsedProperties(rows);
          for (const r of rows) seen.push(r);
          if (page.cursor?.hasMore && page.cursor.oldestTimestamp) {
            cursor = page.cursor.oldestTimestamp;
            hasMore = page.cursor.hasMore;
          } else {
            hasMore = false;
            break;
          }
          // Don't exit on rows.length < pageSize — backend may return fewer
          // than requested even when more data exists (it caps internally).
          // Rely solely on cursor.hasMore, which was already checked above.
        }

        const filtered = seen.filter((row) => {
          if (row.event_name !== args.eventName) return false;
          if (identifiedOnly) {
            const uid = (row as { identified_user_id?: string }).identified_user_id;
            if (!uid || uid === "") return false;
          }
          return true;
        });

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
        };

        return {
          structuredContent: result as unknown as Record<string, unknown>,
          content: [{ type: "text" as const, text: truncateResponse(result) }],
        };
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
      outputSchema: eventNamesOutput,
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
        return {
          structuredContent: wrapped as unknown as Record<string, unknown>,
          content: [{ type: "text" as const, text: truncateResponse(data) }],
        };
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
        "Get property breakdowns for a specific custom event. Returns the distinct property keys and values with counts.",
      inputSchema: {
        ...analyticsInputSchema,
        eventName: z.string().describe("Event name to get properties for"),
      },
      outputSchema: eventPropertiesOutput,
      _meta: {
        "openai/toolInvocation/invoking": "Loading properties…",
        "openai/toolInvocation/invoked": "Properties loaded",
      },
    },
    async (args) => {
      try {
        const params = client.buildAnalyticsParams(args);
        params.event_name = args.eventName;
        const data = await client.get(`/sites/${args.siteId}/events/properties`, params);
        const wrapped = Array.isArray(data) ? { data } : (data as Record<string, unknown>);
        return {
          structuredContent: wrapped as unknown as Record<string, unknown>,
          content: [{ type: "text" as const, text: truncateResponse(data) }],
        };
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
        "Get custom event counts as time-series data with configurable buckets. Useful for analyzing event trends over time.",
      inputSchema: {
        ...analyticsInputSchema,
        bucket: bucketSchema,
      },
      outputSchema: eventTimeseriesOutput,
      _meta: {
        "openai/toolInvocation/invoking": "Querying timeseries…",
        "openai/toolInvocation/invoked": "Timeseries loaded",
      },
    },
    async (args) => {
      try {
        const params = client.buildAnalyticsParams(args);
        const data = await client.get(`/sites/${args.siteId}/events/bucketed`, params);
        const wrapped = Array.isArray(data) ? { data } : (data as Record<string, unknown>);
        return {
          structuredContent: wrapped as unknown as Record<string, unknown>,
          content: [{ type: "text" as const, text: truncateResponse(data) }],
        };
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
        "Get outbound link clicks tracked on the site. Shows which external URLs users are clicking and how often.",
      inputSchema: {
        ...analyticsInputSchema,
        ...paginationSchema,
      },
      outputSchema: outboundLinksOutput,
      _meta: {
        "openai/toolInvocation/invoking": "Loading links…",
        "openai/toolInvocation/invoked": "Links loaded",
      },
    },
    async (args) => {
      try {
        const params = client.buildAnalyticsParams(args);
        const data = await client.get(`/sites/${args.siteId}/events/outbound`, params);
        const wrapped = Array.isArray(data) ? { data } : (data as Record<string, unknown>);
        return {
          structuredContent: wrapped as unknown as Record<string, unknown>,
          content: [{ type: "text" as const, text: truncateResponse(data) }],
        };
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
