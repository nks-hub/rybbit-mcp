import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { RybbitClient } from "../client.js";
import {
  analyticsInputSchema,
  metricParameterSchema,
  paginationSchema,
} from "../schemas.js";

interface MetricEntry {
  value: string;
  count: number;
  percentage: number;
  bounceRate?: number;
  timeOnPage?: number;
  [key: string]: unknown;
}

interface RetentionData {
  cohort: string;
  periods: number[];
  [key: string]: unknown;
}

export function registerMetricsTools(
  server: McpServer,
  client: RybbitClient
): void {
  server.registerTool(
    "rybbit_get_metric",
    {
      description:
        "Get metric breakdown by dimension (browser, OS, country, page, referrer, UTM params, etc.). Returns sorted list with counts, percentages, and optional page-level stats like bounce rate and time on page.",
      inputSchema: {
        ...analyticsInputSchema,
        parameter: metricParameterSchema,
        ...paginationSchema,
      },
    },
    async (args) => {
      try {
        const { siteId, parameter, page, limit, ...rest } = args as {
          siteId: string;
          parameter: z.infer<typeof metricParameterSchema>;
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
        params.parameter = parameter;

        const data = await client.get<MetricEntry[]>(
          `/sites/${siteId}/metric`,
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
    "rybbit_get_retention",
    {
      description:
        "Get user retention cohort analysis showing how many users return over time periods.",
      inputSchema: {
        ...analyticsInputSchema,
      },
    },
    async (args) => {
      try {
        const { siteId, ...rest } = args as {
          siteId: string;
          startDate?: string;
          endDate?: string;
          timeZone?: string;
          filters?: Array<{ parameter: string; type: string; value: (string | number)[] }>;
          pastMinutesStart?: number;
          pastMinutesEnd?: number;
        };

        const params = client.buildAnalyticsParams(rest);

        const data = await client.get<RetentionData[]>(
          `/sites/${siteId}/retention`,
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
