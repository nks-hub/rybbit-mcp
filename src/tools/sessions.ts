import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { RybbitClient, pageRows, unwrapRows } from "../client.js";
import { jsonResult, output } from "../response.js";
import {
  analyticsInputSchema,
  limitSchema,
  paginationSchema,
  siteIdSchema,
} from "../schemas.js";

// Output schemas
const sessionSummaryShape = z
  .object({
    session_id: z.string().nullish(),
    user_id: z.string().nullish().describe("Device hash"),
    identified_user_id: z.string().nullish().describe("App-provided user ID, empty for anonymous visitors"),
    session_start: z.string().nullish(),
    session_end: z.string().nullish(),
    session_duration: z.number().nullish().describe("Seconds"),
    entry_page: z.string().nullish(),
    exit_page: z.string().nullish(),
    pageviews: z.number().nullish(),
    events: z.number().nullish(),
    country: z.string().nullish(),
    device_type: z.string().nullish(),
  })
  .passthrough();

const listSessionsOutput = {
  data: z.array(sessionSummaryShape).optional().describe("Sessions"),
  totalCount: z.number().optional().describe("Sessions matching the ip filter, across all pages"),
  filteredBy: z.string().optional().describe("Client-side filter applied (e.g. ip=...)"),
  scannedPages: z.number().optional().describe("Pages scanned when filtering client-side"),
};

const sessionDetailOutput = {
  session: sessionSummaryShape.optional().describe("Session summary: ids, device, location, start/end, counters"),
  events: z
    .array(
      z
        .object({
          timestamp: z.string().nullish(),
          type: z.string().nullish().describe("pageview, custom_event, outbound, ..."),
          pathname: z.string().nullish(),
          event_name: z.string().nullish(),
          props: z.record(z.unknown()).nullish(),
        })
        .passthrough()
    )
    .optional()
    .describe("Event timeline, oldest first"),
  pagination: z
    .object({
      total: z.number().optional().describe("Events in the session"),
      limit: z.number().optional(),
      offset: z.number().optional(),
      hasMore: z.boolean().optional(),
    })
    .passthrough()
    .optional(),
};

export function registerSessionsTools(
  server: McpServer,
  client: RybbitClient
): void {
  server.registerTool(
    "rybbit_list_sessions",
    {
      title: "List Sessions",
      description:
        "List sessions for a site with filtering and pagination, newest first. Each row has session_id, user ids, device, location, entry/exit page, pageviews, session_duration (seconds) and ip (if the site has trackIp enabled). Supports client-side IP filtering.",
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
        destructiveHint: false,
      },
      inputSchema: {
        ...analyticsInputSchema,
        ...paginationSchema(10),
        ip: z
          .string()
          .optional()
          .describe("Filter sessions by IP address (exact or partial match, client-side). Requires site to have trackIp enabled."),
        identifiedOnly: z
          .boolean()
          .optional()
          .describe("Only return sessions from identified users. Default: false."),
        minDuration: z
          .number()
          .optional()
          .describe("Minimum session duration in seconds."),
      },
      outputSchema: output(listSessionsOutput),
      _meta: {
        "openai/toolInvocation/invoking": "Listing sessions…",
        "openai/toolInvocation/invoked": "Sessions loaded",
      },
    },
    async (args) => {
      try {
        const { siteId, page, limit, ip, identifiedOnly, minDuration, ...rest } = args as {
          siteId: string;
          page: number;
          limit: number;
          ip?: string;
          identifiedOnly?: boolean;
          minDuration?: number;
          startDate?: string;
          endDate?: string;
          timeZone?: string;
          filters?: Array<{ parameter: string; type: string; value: (string | number)[] }>;
          pastMinutesStart?: number;
          pastMinutesEnd?: number;
        };

        const params = client.buildAnalyticsParams({ ...rest, page, limit });
        if (identifiedOnly) params.identified_only = "true";
        if (minDuration !== undefined) params.min_duration = String(minDuration);

        if (ip) {
          // IP filtering: fetch multiple pages and filter client-side
          const allSessions: Record<string, unknown>[] = [];
          let fetchPage = 1;
          const batchSize = 200;
          const maxSessions = 2000;
          const ipLower = ip.toLowerCase();

          while (allSessions.length < maxSessions) {
            const batchParams = { ...params, page: String(fetchPage), limit: String(batchSize) };
            const batch = await client.get<{ data: Record<string, unknown>[] }>(
              `/sites/${siteId}/sessions`,
              batchParams
            );
            const rows = batch?.data ?? (Array.isArray(batch) ? batch : []);
            if (rows.length === 0) break;

            for (const s of rows) {
              const sessionIp = String(s.ip || "");
              if (sessionIp && sessionIp.toLowerCase().includes(ipLower)) {
                allSessions.push(s);
              }
            }
            if (rows.length < batchSize) break;
            fetchPage++;
          }

          return jsonResult({
            ...pageRows(allSessions, page, limit),
            filteredBy: `ip=${ip}`,
            scannedPages: fetchPage,
          });
        }

        const data = await client.get<unknown>(`/sites/${siteId}/sessions`, params);

        return jsonResult({ data: unwrapRows(data).rows });
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
    "rybbit_get_session",
    {
      title: "Session Detail",
      description:
        "Get one session: `session` (device, location, counters) and `events`, its timeline of page views and events, oldest first, 25 per call (page with offset). Use rybbit_list_sessions first to find session IDs.",
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
        destructiveHint: false,
      },
      inputSchema: {
        siteId: siteIdSchema,
        sessionId: z.string().describe("Session ID to retrieve"),
        limit: limitSchema(25).describe("Events per call; `pagination.total` says how many the session has"),
        offset: z.number().int().min(0).default(0).describe("Events to skip, for paging through a long session"),
      },
      outputSchema: output(sessionDetailOutput),
      _meta: {
        "openai/toolInvocation/invoking": "Loading session…",
        "openai/toolInvocation/invoked": "Session loaded",
      },
    },
    async (args) => {
      try {
        const { siteId, sessionId, limit, offset } = args;

        const raw = await client.get<{ data?: Record<string, unknown> }>(
          `/sites/${siteId}/sessions/${sessionId}`,
          { limit, offset }
        );

        return jsonResult(raw?.data ?? raw);
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
