import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { RybbitClient, truncateResponse } from "../client.js";
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

// Output schemas
const metricOutput = {
  data: z
    .array(
      z
        .object({
          value: z.string().optional(),
          count: z.number().optional(),
          percentage: z.number().optional(),
          bounceRate: z.number().optional(),
          timeOnPage: z.number().optional(),
        })
        .passthrough()
    )
    .describe("Metric breakdown rows"),
};

const retentionOutput = {
  data: z
    .array(
      z
        .object({
          cohort: z.string().optional(),
          periods: z.array(z.number()).optional(),
        })
        .passthrough()
    )
    .describe("Retention cohorts"),
};

export function registerMetricsTools(
  server: McpServer,
  client: RybbitClient
): void {
  server.registerTool(
    "rybbit_get_metric",
    {
      title: "Metric Breakdown",
      description:
        "Get metric breakdown by dimension. Use parameter='pathname' for top pages, 'browser'/'operating_system'/'device_type' for tech stats, 'country'/'city' for geo, 'utm_source'/'utm_campaign' for marketing, 'referrer'/'channel' for traffic sources, 'entry_page'/'exit_page' for user flow. Returns sorted list with counts, percentages, bounce rate, and session duration.",
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
        destructiveHint: false,
      },
      inputSchema: {
        ...analyticsInputSchema,
        parameter: metricParameterSchema,
        ...paginationSchema,
      },
      outputSchema: metricOutput,
      _meta: {
        "openai/toolInvocation/invoking": "Querying metric…",
        "openai/toolInvocation/invoked": "Metric loaded",
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
    "rybbit_get_retention",
    {
      title: "User Retention",
      description:
        "Get user retention cohort analysis showing how many users return over time periods.",
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
        destructiveHint: false,
      },
      inputSchema: {
        ...analyticsInputSchema,
      },
      outputSchema: retentionOutput,
      _meta: {
        "openai/toolInvocation/invoking": "Loading retention…",
        "openai/toolInvocation/invoked": "Retention loaded",
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
}
