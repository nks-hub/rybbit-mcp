import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { RybbitClient, unwrapRows } from "../client.js";
import { jsonResult, output } from "../response.js";
import {
  analyticsInputSchema,
  metricParameterSchema,
  paginationSchema,
} from "../schemas.js";

// Output schemas
const metricOutput = {
  data: z
    .array(
      z
        .object({
          value: z.string().nullish(),
          count: z.number().nullish().describe("Sessions"),
          percentage: z.number().nullish(),
          pageviews: z.number().nullish(),
          pageviews_percentage: z.number().nullish(),
          bounce_rate: z.number().nullish(),
          time_on_page_seconds: z.number().nullish().describe("Page dimensions only"),
        })
        .passthrough()
    )
    .describe("Metric breakdown rows"),
  totalCount: z.number().optional().describe("Total rows across all pages"),
};

const retentionOutput = {
  data: z
    .array(
      z
        .object({
          cohort: z.string().optional(),
          size: z.number().optional(),
          periods: z.array(z.number().nullable()).optional(),
        })
        .passthrough()
    )
    .describe("Retention cohorts; periods are percentages per period, null = period not reached yet"),
  mode: z.unknown().optional(),
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
        "Get metric breakdown by dimension. Use parameter='pathname' for top pages, 'browser'/'operating_system'/'device_type' for tech stats, 'country'/'city' for geo, 'utm_source'/'utm_campaign' for marketing, 'referrer'/'channel' for traffic sources, 'entry_page'/'exit_page' for user flow. Returns rows sorted by sessions with count, percentage, pageviews and bounce_rate, 50 per page; `totalCount` says how many values there are.",
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
        destructiveHint: false,
      },
      inputSchema: {
        ...analyticsInputSchema,
        parameter: metricParameterSchema,
        ...paginationSchema(50),
      },
      outputSchema: output(metricOutput),
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

        const data = await client.get<unknown>(
          `/sites/${siteId}/metric`,
          params
        );

        const { rows, totalCount } = unwrapRows(data);
        const wrapped = { data: rows, ...(totalCount !== undefined ? { totalCount } : {}) };

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
      outputSchema: output(retentionOutput),
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

        const data = await client.get<unknown>(
          `/sites/${siteId}/retention`,
          params
        );

        // v2.6 returns { data: { cohorts: { "<date>": { size, percentages } }, mode, ... } }
        const payload = (data as { data?: Record<string, unknown> })?.data;
        const cohorts = payload?.cohorts as
          | Record<string, { size?: number; percentages?: (number | null)[] }>
          | undefined;
        const wrapped = cohorts
          ? {
              data: Object.entries(cohorts).map(([cohort, c]) => ({
                cohort,
                size: c.size,
                periods: c.percentages ?? [],
              })),
              mode: payload?.mode,
            }
          : { data: unwrapRows(data).rows };

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
}
