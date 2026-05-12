import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { RybbitClient, truncateResponse } from "../client.js";
import { analyticsInputSchema, bucketSchema, paginationSchema, siteIdSchema } from "../schemas.js";

interface OverviewMetrics {
  sessions?: number;
  pageviews?: number;
  users?: number;
  pagesPerSession?: number;
  bounceRate?: number;
  avgSessionDuration?: number;
  [key: string]: unknown;
}

interface TimeseriesDataPoint {
  time: string;
  [key: string]: unknown;
}

// Output schemas
// Backend returns `{ count: 117 }`. The MCP wrapper previously assumed a bare
// number — when the upstream changed shape, output validation rejected the
// result. We now normalize to `{ liveUsers: <number> }` regardless of upstream
// shape and accept either bare number or `{ count }`.
const liveUsersOutput = {
  liveUsers: z.number().describe("Current live/active user count (normalized from upstream {count} envelope)"),
};

const overviewOutput = {
  sessions: z.number().optional(),
  pageviews: z.number().optional(),
  users: z.number().optional(),
  pagesPerSession: z.number().optional(),
  bounceRate: z.number().optional(),
  avgSessionDuration: z.number().optional(),
};

const overviewTimeseriesOutput = {
  data: z
    .array(
      z
        .object({
          time: z.string().optional(),
        })
        .passthrough()
    )
    .describe("Time-bucketed overview metrics"),
};

const sessionLocationsOutput = {
  data: z
    .array(
      z
        .object({
          lat: z.number().optional(),
          lon: z.number().optional(),
          city: z.string().optional(),
          country: z.string().optional(),
          sessions: z.number().optional(),
        })
        .passthrough()
    )
    .optional()
    .describe("Geographic session locations"),
};

export function registerOverviewTools(
  server: McpServer,
  client: RybbitClient
): void {
  server.registerTool(
    "rybbit_live_users",
    {
      title: "Live User Count",
      description:
        "Get the current number of live/active users on a site in real-time",
      inputSchema: {
        siteId: siteIdSchema,
      },
      outputSchema: liveUsersOutput,
      _meta: {
        "openai/toolInvocation/invoking": "Reading live users…",
        "openai/toolInvocation/invoked": "Live users loaded",
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        // Backend returns either a bare number (old) or `{ count: N }` (new).
        // Normalize to a number so structuredContent matches outputSchema.
        const raw = await client.get<unknown>(
          `/sites/${args.siteId}/live-user-count`
        );
        let count = 0;
        if (typeof raw === "number") {
          count = raw;
        } else if (raw && typeof raw === "object" && "count" in raw) {
          const c = (raw as { count: unknown }).count;
          count = typeof c === "number" ? c : Number(c) || 0;
        } else if (raw && typeof raw === "object" && "liveUsers" in raw) {
          const c = (raw as { liveUsers: unknown }).liveUsers;
          count = typeof c === "number" ? c : Number(c) || 0;
        }

        const result = { liveUsers: count };

        return {
          structuredContent: result as unknown as Record<string, unknown>,
          content: [
            {
              type: "text" as const,
              text: truncateResponse(result),
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
    "rybbit_get_overview",
    {
      title: "Site Overview",
      description:
        "Get aggregated overview metrics for a site: sessions, pageviews, unique users, pages per session, bounce rate, and average session duration. Supports date range and filters.",
      inputSchema: {
        ...analyticsInputSchema,
      },
      outputSchema: overviewOutput,
      _meta: {
        "openai/toolInvocation/invoking": "Querying overview…",
        "openai/toolInvocation/invoked": "Overview loaded",
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const params = client.buildAnalyticsParams({
          startDate: args.startDate,
          endDate: args.endDate,
          timeZone: args.timeZone,
          filters: args.filters,
          pastMinutesStart: args.pastMinutesStart,
          pastMinutesEnd: args.pastMinutesEnd,
        });

        const data = await client.get<OverviewMetrics>(
          `/sites/${args.siteId}/overview`,
          params
        );

        return {
          structuredContent: data as unknown as Record<string, unknown>,
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
    "rybbit_get_overview_timeseries",
    {
      title: "Overview Time Series",
      description:
        "Get overview metrics as time-series data with configurable time buckets (minute, hour, day, week, month). Returns arrays of data points for charting trends.",
      inputSchema: {
        ...analyticsInputSchema,
        bucket: bucketSchema,
      },
      outputSchema: overviewTimeseriesOutput,
      _meta: {
        "openai/toolInvocation/invoking": "Querying timeseries…",
        "openai/toolInvocation/invoked": "Timeseries loaded",
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const params = client.buildAnalyticsParams({
          startDate: args.startDate,
          endDate: args.endDate,
          timeZone: args.timeZone,
          filters: args.filters,
          pastMinutesStart: args.pastMinutesStart,
          pastMinutesEnd: args.pastMinutesEnd,
          bucket: args.bucket,
        });

        const data = await client.get<TimeseriesDataPoint[]>(
          `/sites/${args.siteId}/overview-bucketed`,
          params
        );

        const wrapped = { data };

        return {
          structuredContent: wrapped as unknown as Record<string, unknown>,
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
    "rybbit_get_session_locations",
    {
      title: "Session Locations",
      description:
        "Get geographic session location data with coordinates. Returns latitude, longitude, city, country, and session count for map visualization and geographic analysis.",
      inputSchema: {
        ...analyticsInputSchema,
        ...paginationSchema,
      },
      outputSchema: sessionLocationsOutput,
      _meta: {
        "openai/toolInvocation/invoking": "Loading locations…",
        "openai/toolInvocation/invoked": "Locations loaded",
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const params = client.buildAnalyticsParams(args);

        const data = await client.get(
          `/sites/${args.siteId}/session-locations`,
          params
        );

        const wrapped = Array.isArray(data) ? { data } : (data as Record<string, unknown>);

        return {
          structuredContent: wrapped as unknown as Record<string, unknown>,
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
