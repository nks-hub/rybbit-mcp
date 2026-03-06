import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { RybbitClient } from "../client.js";
import { analyticsInputSchema, bucketSchema, siteIdSchema } from "../schemas.js";

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

export function registerOverviewTools(
  server: McpServer,
  client: RybbitClient
): void {
  server.registerTool(
    "rybbit_live_users",
    {
      description:
        "Get the current number of live/active users on a site in real-time",
      inputSchema: {
        siteId: siteIdSchema,
      },
    },
    async (args) => {
      try {
        const count = await client.get<number>(
          `/sites/${args.siteId}/live-user-count`
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ liveUsers: count }, null, 2),
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
      description:
        "Get aggregated overview metrics for a site: sessions, pageviews, unique users, pages per session, bounce rate, and average session duration. Supports date range and filters.",
      inputSchema: {
        ...analyticsInputSchema,
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
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(data, null, 2),
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
      description:
        "Get overview metrics as time-series data with configurable time buckets (minute, hour, day, week, month). Returns arrays of data points for charting trends.",
      inputSchema: {
        ...analyticsInputSchema,
        bucket: bucketSchema,
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

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(data, null, 2),
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
