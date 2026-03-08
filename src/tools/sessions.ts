import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { RybbitClient, truncateResponse } from "../client.js";
import {
  analyticsInputSchema,
  paginationSchema,
  siteIdSchema,
} from "../schemas.js";

interface SessionSummary {
  sessionId: string;
  userId?: string;
  device?: string;
  country?: string;
  city?: string;
  pagesVisited: number;
  duration?: number;
  bounced: boolean;
  [key: string]: unknown;
}

interface SessionDetail {
  sessionId: string;
  userId?: string;
  traits?: Record<string, unknown>;
  device?: string;
  browser?: string;
  os?: string;
  country?: string;
  region?: string;
  city?: string;
  events: unknown[];
  [key: string]: unknown;
}

export function registerSessionsTools(
  server: McpServer,
  client: RybbitClient
): void {
  server.registerTool(
    "rybbit_list_sessions",
    {
      title: "List Sessions",
      description:
        "List sessions for a site with filtering and pagination. Returns session ID, user info, device, location, pages visited, duration, bounce status, and IP address (if site has trackIp enabled). Supports client-side IP filtering.",
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
        destructiveHint: false,
      },
      inputSchema: {
        ...analyticsInputSchema,
        ...paginationSchema,
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
    },
    async (args) => {
      try {
        const { siteId, page, limit, ip, identifiedOnly, minDuration, ...rest } = args as {
          siteId: string;
          page?: number;
          limit?: number;
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

          return {
            content: [
              {
                type: "text" as const,
                text: truncateResponse({ data: allSessions, filteredBy: `ip=${ip}`, scannedPages: fetchPage }),
              },
            ],
          };
        }

        const data = await client.get<SessionSummary[]>(
          `/sites/${siteId}/sessions`,
          params
        );

        return {
          content: [
            {
              type: "text" as const,
              text: truncateResponse(data),
            },
          ],
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
    "rybbit_get_session",
    {
      title: "Session Detail",
      description:
        "Get detailed session information including all page views, events, user traits, device info, location, and full event timeline. Use rybbit_list_sessions first to find session IDs.",
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
        destructiveHint: false,
      },
      inputSchema: {
        siteId: siteIdSchema,
        sessionId: z.string().describe("Session ID to retrieve"),
      },
    },
    async (args) => {
      try {
        const { siteId, sessionId } = args as {
          siteId: string;
          sessionId: string;
        };

        const data = await client.get<SessionDetail>(
          `/sites/${siteId}/sessions/${sessionId}`
        );

        return {
          content: [
            {
              type: "text" as const,
              text: truncateResponse(data),
            },
          ],
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
