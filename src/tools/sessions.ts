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
        "List sessions for a site with filtering and pagination. Returns session ID, user info, device, location, pages visited, duration, and bounce status.",
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
        destructiveHint: false,
      },
      inputSchema: {
        ...analyticsInputSchema,
        ...paginationSchema,
      },
    },
    async (args) => {
      try {
        const { siteId, page, limit, ...rest } = args as {
          siteId: string;
          page?: number;
          limit?: number;
          startDate?: string;
          endDate?: string;
          timeZone?: string;
          filters?: Array<{ parameter: string; type: string; value: (string | number)[] }>;
          pastMinutesStart?: number;
          pastMinutesEnd?: number;
        };

        const params = client.buildAnalyticsParams({ ...rest, page, limit });

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
