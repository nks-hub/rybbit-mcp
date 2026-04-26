import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { FilterParam, QueryParams, RybbitClient, truncateResponse } from "../client.js";
import { analyticsInputSchema, paginationSchema, siteIdSchema } from "../schemas.js";

interface SessionRow {
  identified_user_id: string;
  user_id: string;
  session_duration: number;
  traits?: Record<string, unknown> | null;
  country?: string;
  city?: string;
  browser?: string;
  device_type?: string;
  [key: string]: unknown;
}

interface SessionsApiResponse {
  data: SessionRow[];
}

interface AggregatedUser {
  identified_user_id: string;
  user_id: string;
  total_duration: number;
  sessions: number;
  traits: Record<string, unknown> | null;
  country: string;
  city: string;
  browser: string;
  device_type: string;
}

async function fetchUsersByDuration(
  client: RybbitClient,
  siteId: string,
  args: {
    startDate?: string;
    endDate?: string;
    timeZone?: string;
    filters?: FilterParam[];
    pastMinutesStart?: number;
    pastMinutesEnd?: number;
    sortOrder?: string;
    limit?: number;
  }
): Promise<{ data: AggregatedUser[] }> {
  // Fetch sessions in batches to aggregate duration per user
  const allSessions: SessionRow[] = [];
  let page = 1;
  const batchSize = 200;
  const maxSessions = 2000;

  while (allSessions.length < maxSessions) {
    const params = client.buildAnalyticsParams({
      startDate: args.startDate,
      endDate: args.endDate,
      timeZone: args.timeZone,
      filters: args.filters,
      pastMinutesStart: args.pastMinutesStart,
      pastMinutesEnd: args.pastMinutesEnd,
      page,
      limit: batchSize,
    });
    params.identified_only = "true";

    const batch = await client.get<SessionsApiResponse>(`/sites/${siteId}/sessions`, params);
    const rows = batch?.data ?? (Array.isArray(batch) ? batch : []);
    if (rows.length === 0) break;
    allSessions.push(...(rows as SessionRow[]));
    if (rows.length < batchSize) break;
    page++;
  }

  // Aggregate duration per identified user
  const userMap = new Map<string, AggregatedUser>();
  for (const s of allSessions) {
    const uid = s.identified_user_id || s.user_id;
    if (!uid) continue;
    const existing = userMap.get(uid);
    if (existing) {
      existing.total_duration += s.session_duration ?? 0;
      existing.sessions++;
    } else {
      userMap.set(uid, {
        identified_user_id: s.identified_user_id ?? "",
        user_id: s.user_id ?? "",
        total_duration: s.session_duration ?? 0,
        sessions: 1,
        traits: (s.traits as Record<string, unknown>) ?? null,
        country: (s.country as string) ?? "",
        city: (s.city as string) ?? "",
        browser: (s.browser as string) ?? "",
        device_type: (s.device_type as string) ?? "",
      });
    }
  }

  const sorted = [...userMap.values()].sort((a, b) =>
    args.sortOrder === "asc"
      ? a.total_duration - b.total_duration
      : b.total_duration - a.total_duration
  );

  const limit = args.limit ?? 20;
  return { data: sorted.slice(0, limit) };
}

export function registerUsersTools(server: McpServer, client: RybbitClient): void {
  server.registerTool(
    "rybbit_list_users",
    {
      title: "List Users",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, destructiveHint: false },
      description:
        "List users for a site. Returns user IDs, session counts, first/last seen dates, and user traits. Supports filtering by any analytics dimension. Use 'search' param to find users by username/email/name (case-insensitive partial match).",
      inputSchema: {
        ...analyticsInputSchema,
        ...paginationSchema,
        search: z
          .string()
          .optional()
          .describe("Search users by trait value (e.g. username, email). Uses case-insensitive partial matching (ILIKE)."),
        searchField: z
          .enum(["username", "name", "email", "user_id"])
          .optional()
          .describe("Which field to search in (default: 'username'). Only used when 'search' is provided."),
        identifiedOnly: z
          .boolean()
          .optional()
          .describe("Only return identified users (users with identified_user_id). Default: false."),
        sortBy: z
          .enum(["first_seen", "last_seen", "pageviews", "sessions", "events", "duration"])
          .optional()
          .describe("Sort field (default: 'last_seen'). 'duration' sorts by total time spent (aggregated from sessions, requires date range)."),
        sortOrder: z
          .enum(["asc", "desc"])
          .optional()
          .describe("Sort direction (default: 'desc')"),
      },
    },
    async (args) => {
      try {
        if (args.sortBy === "duration") {
          const data = await fetchUsersByDuration(client, args.siteId, {
            startDate: args.startDate,
            endDate: args.endDate,
            timeZone: args.timeZone,
            filters: args.filters,
            pastMinutesStart: args.pastMinutesStart,
            pastMinutesEnd: args.pastMinutesEnd,
            sortOrder: args.sortOrder,
            limit: args.limit,
          });
          return {
            content: [{ type: "text" as const, text: truncateResponse(data) }],
          };
        }

        // Workaround: event_name filter crashes the backend getUsers endpoint
        // (applies session-level subquery to CTE outer query where session_id doesn't exist).
        // Strip it from filters and add a warning.
        const safeFilters = args.filters?.filter(
          (f) => f.parameter !== "event_name"
        );
        const hadEventFilter = safeFilters?.length !== args.filters?.length;
        const safeArgs = { ...args, filters: safeFilters };

        const params = client.buildAnalyticsParams(safeArgs);
        if (args.search) params.search = args.search;
        if (args.searchField) params.search_field = args.searchField;
        if (args.identifiedOnly) params.identified_only = "true";
        if (args.sortBy) params.sort_by = args.sortBy;
        if (args.sortOrder) params.sort_order = args.sortOrder;
        const data = await client.get(`/sites/${args.siteId}/users`, params);

        const warning = hadEventFilter
          ? "\n\nNote: event_name filter was removed (not supported for user listing due to backend limitation). Use rybbit_get_user_event_breakdown to find users by specific events."
          : "";

        return {
          content: [{ type: "text" as const, text: truncateResponse(data) + warning }],
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
    "rybbit_get_user",
    {
      title: "User Detail",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, destructiveHint: false },
      description:
        "Get detailed information about a specific user including their traits, session history, and activity summary.",
      inputSchema: {
        siteId: siteIdSchema,
        userId: z.string().describe("User ID (identified_user_id or internal user ID)"),
      },
    },
    async (args) => {
      try {
        const data = await client.get(`/sites/${args.siteId}/users/${args.userId}`);
        return {
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
    "rybbit_get_user_traits",
    {
      title: "User Traits",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, destructiveHint: false },
      description:
        "Get user trait keys, values, or find users by trait. mode='keys' lists all trait keys. mode='values' (default when key is provided) returns distinct values for a trait key. mode='users' finds users matching a specific trait key+value pair (case-insensitive).",
      inputSchema: {
        siteId: siteIdSchema,
        mode: z
          .enum(["keys", "values", "users"])
          .optional()
          .describe("'keys' to list trait keys, 'values' to get values for a key, 'users' to find users by trait. Default: 'keys' if no key provided, 'values' if key is provided."),
        key: z
          .string()
          .optional()
          .describe(
            "Trait key (required for 'values' and 'users' modes)"
          ),
        value: z
          .string()
          .optional()
          .describe("Trait value (required for 'users' mode)"),
        limit: z.number().optional().describe("Max results to return"),
      },
    },
    async (args) => {
      try {
        let data: unknown;
        const resolvedMode = args.mode ?? (args.key ? "values" : "keys");

        if (resolvedMode === "users") {
          // API does exact (case-sensitive) match, so resolve the correct case first
          let resolvedValue = args.value;
          if (args.key && args.value) {
            const valuesData = await client.get<{ values: { value: string }[] }>(
              `/sites/${args.siteId}/user-traits/values`,
              { key: args.key, limit: 1000 }
            );
            const match = valuesData.values?.find(
              (v) => v.value.toLowerCase() === args.value!.toLowerCase()
            );
            if (match) resolvedValue = match.value;
          }
          const params: Record<string, string | number> = {};
          if (args.key !== undefined) params.key = args.key;
          if (resolvedValue !== undefined) params.value = resolvedValue;
          if (args.limit !== undefined) params.limit = args.limit;
          data = await client.get(`/sites/${args.siteId}/user-traits/users`, params);
        } else if (resolvedMode === "values" && args.key !== undefined) {
          const params: Record<string, string | number> = { key: args.key };
          if (args.limit !== undefined) params.limit = args.limit;
          data = await client.get(`/sites/${args.siteId}/user-traits/values`, params);
        } else {
          data = await client.get(`/sites/${args.siteId}/user-traits/keys`);
        }
        return {
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

  // Tool: Get per-user event breakdown
  // Workaround for missing backend aggregation — fetches events via the events
  // endpoint filtered by user_id and aggregates event counts client-side.
  server.registerTool(
    "rybbit_get_user_event_breakdown",
    {
      title: "User Event Breakdown",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, destructiveHint: false },
      description:
        "Get event count breakdown for a specific user. Shows how many times each event_name was triggered by this user. " +
        "Accepts either the Rybbit user_id (device hash) or the identified_user_id (app-provided user ID). " +
        "Useful for analyzing per-user behavior like ad_click, chat_message_sent, etc.",
      inputSchema: {
        ...analyticsInputSchema,
        userId: z.string().describe("User ID — either Rybbit device hash (user_id) or app-provided ID (identified_user_id). Both are checked."),
      },
    },
    async (args) => {
      try {
        // Build filters with user_id (backend checks both user_id and identified_user_id)
        const userFilter: FilterParam = {
          parameter: "user_id",
          type: "equals",
          value: [args.userId],
        };
        const filters = [...(args.filters ?? []), userFilter];
        const safeArgs = { ...args, filters };

        // Fetch event names endpoint — it already returns counts per event_name,
        // and the user_id filter will scope it to this user.
        const params = client.buildAnalyticsParams(safeArgs);
        const data = await client.get(`/sites/${args.siteId}/events/names`, params);

        return {
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
    "rybbit_get_user_session_count",
    {
      title: "User Session Count",
      description:
        "Get the per-day session count for a single user across the requested time range. Useful for plotting user engagement intensity (calendar heatmap or sparkline).",
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
        destructiveHint: false,
      },
      inputSchema: {
        siteId: siteIdSchema,
        userId: z.string().describe("User ID — either identified_user_id or device hash user_id"),
        startDate: z.string().optional().describe("Start date (YYYY-MM-DD)"),
        endDate: z.string().optional().describe("End date (YYYY-MM-DD)"),
        timeZone: z.string().optional().describe("IANA timezone (default UTC)"),
        pastMinutesStart: z.number().optional(),
        pastMinutesEnd: z.number().optional(),
      },
    },
    async (args) => {
      try {
        const { siteId, userId, ...rest } = args as {
          siteId: string;
          userId: string;
          startDate?: string;
          endDate?: string;
          timeZone?: string;
          pastMinutesStart?: number;
          pastMinutesEnd?: number;
        };

        const params: QueryParams = {
          ...client.buildAnalyticsParams(rest),
          userId,
        };

        const data = await client.get(
          `/sites/${siteId}/users/session-count`,
          params
        );

        return {
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
