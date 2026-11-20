import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { RybbitClient, unwrapRows } from "../client.js";
import { jsonResult, output } from "../response.js";
import { analyticsInputSchema, bucketSchema } from "../schemas.js";

const dimensionSchema = z
  .enum(["overview", "pathname", "browser", "operating_system"])
  .optional()
  .describe(
    "Break down performance by dimension. Default: overview (aggregated)"
  );

// Output schemas
const VITALS = ["lcp", "cls", "inp", "fcp", "ttfb"];
const VITAL_FIELDS = ["p50", "p75", "p90", "p99", "count", "good", "poor"];

const performanceOutput = {
  // Overview (dimension=overview or unset): <vital>_p50..p99 percentiles, <vital>_count
  // samples and how many of them rate good / poor. null means no samples in range.
  ...Object.fromEntries(
    VITALS.flatMap((vital) => VITAL_FIELDS.map((field) => [`${vital}_${field}`, z.number().nullish()]))
  ),
  total_performance_events: z.number().nullish(),
  // Dimension breakdown rows (when dimension=pathname/browser/operating_system)
  data: z
    .array(
      z.record(z.unknown())
    )
    .optional()
    .describe("Per-dimension rows when dimension!=overview"),
  totalCount: z.number().optional().describe("Total rows across all pages"),
};

const performanceTimeseriesOutput = {
  data: z
    .array(
      z
        .object({
          time: z.string().nullish(),
          event_count: z.number().nullish(),
        })
        .passthrough()
    )
    .describe("Time-bucketed performance metrics"),
};

export function registerPerformanceTools(
  server: McpServer,
  client: RybbitClient
): void {
  server.registerTool(
    "rybbit_get_performance",
    {
      title: "Web Vitals",
      description:
        "Get Core Web Vitals performance metrics (LCP, CLS, INP, FCP, TTFB) with p50, p75, p90, p99 percentiles plus sample counts and how many rate good / poor. Optionally break down by page path, browser, or OS.",
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
        destructiveHint: false,
      },
      inputSchema: {
        ...analyticsInputSchema,
        dimension: dimensionSchema,
      },
      outputSchema: output(performanceOutput),
      _meta: {
        "openai/toolInvocation/invoking": "Loading web vitals…",
        "openai/toolInvocation/invoked": "Web vitals loaded",
      },
    },
    async (args) => {
      try {
        const { siteId, dimension, ...rest } = args as {
          siteId: string;
          dimension?: "overview" | "pathname" | "browser" | "operating_system";
          startDate?: string;
          endDate?: string;
          timeZone?: string;
          filters?: Array<{
            parameter: string;
            type: string;
            value: (string | number)[];
          }>;
          pastMinutesStart?: number;
          pastMinutesEnd?: number;
        };

        const params = client.buildAnalyticsParams(rest);

        if (
          dimension === "pathname" ||
          dimension === "browser" ||
          dimension === "operating_system"
        ) {
          params.dimension = dimension;
          const data = await client.get<unknown>(
            `/sites/${siteId}/performance/by-dimension`,
            params
          );
          const { rows, totalCount } = unwrapRows(data);
          const wrapped = { data: rows, ...(totalCount !== undefined ? { totalCount } : {}) };
          return jsonResult(wrapped);
        }

        const raw = await client.get<{ data?: Record<string, unknown> }>(
          `/sites/${siteId}/performance/overview`,
          params
        );
        // v2.6 nests the percentiles under `data`; null means no samples in range
        const data = raw?.data ?? raw;
        return jsonResult(data);
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
    "rybbit_get_performance_timeseries",
    {
      title: "Web Vitals Time Series",
      description:
        "Get Core Web Vitals performance metrics as time-series data for trend analysis.",
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
        destructiveHint: false,
      },
      inputSchema: {
        ...analyticsInputSchema,
        bucket: bucketSchema,
      },
      outputSchema: output(performanceTimeseriesOutput),
      _meta: {
        "openai/toolInvocation/invoking": "Querying timeseries…",
        "openai/toolInvocation/invoked": "Timeseries loaded",
      },
    },
    async (args) => {
      try {
        const { siteId, bucket, ...rest } = args as {
          siteId: string;
          bucket?: string;
          startDate?: string;
          endDate?: string;
          timeZone?: string;
          filters?: Array<{
            parameter: string;
            type: string;
            value: (string | number)[];
          }>;
          pastMinutesStart?: number;
          pastMinutesEnd?: number;
        };

        const params = client.buildAnalyticsParams({ ...rest, bucket });

        const data = await client.get<unknown>(
          `/sites/${siteId}/performance/time-series`,
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
}
