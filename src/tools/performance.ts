import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { RybbitClient, truncateResponse } from "../client.js";
import { analyticsInputSchema, bucketSchema } from "../schemas.js";

interface PerformanceOverview {
  lcp_p50?: number;
  lcp_p75?: number;
  lcp_p90?: number;
  lcp_p99?: number;
  cls_p50?: number;
  cls_p75?: number;
  cls_p90?: number;
  cls_p99?: number;
  inp_p50?: number;
  inp_p75?: number;
  inp_p90?: number;
  inp_p99?: number;
  fcp_p50?: number;
  fcp_p75?: number;
  fcp_p90?: number;
  fcp_p99?: number;
  ttfb_p50?: number;
  ttfb_p75?: number;
  ttfb_p90?: number;
  ttfb_p99?: number;
  [key: string]: unknown;
}

interface PerformanceByDimension {
  dimension: string;
  [key: string]: unknown;
}

interface PerformanceTimeSeries {
  bucket: string;
  [key: string]: unknown;
}

const dimensionSchema = z
  .enum(["overview", "pathname", "browser", "operating_system"])
  .optional()
  .describe(
    "Break down performance by dimension. Default: overview (aggregated)"
  );

// Output schemas
const performanceOutput = {
  // Overview percentiles (when dimension=overview or unset)
  lcp_p50: z.number().optional(),
  lcp_p75: z.number().optional(),
  lcp_p90: z.number().optional(),
  lcp_p99: z.number().optional(),
  cls_p50: z.number().optional(),
  cls_p75: z.number().optional(),
  cls_p90: z.number().optional(),
  cls_p99: z.number().optional(),
  inp_p50: z.number().optional(),
  inp_p75: z.number().optional(),
  inp_p90: z.number().optional(),
  inp_p99: z.number().optional(),
  fcp_p50: z.number().optional(),
  fcp_p75: z.number().optional(),
  fcp_p90: z.number().optional(),
  fcp_p99: z.number().optional(),
  ttfb_p50: z.number().optional(),
  ttfb_p75: z.number().optional(),
  ttfb_p90: z.number().optional(),
  ttfb_p99: z.number().optional(),
  // Dimension breakdown rows (when dimension=pathname/browser/operating_system)
  data: z
    .array(
      z
        .object({
          dimension: z.string().optional(),
        })
        .passthrough()
    )
    .optional()
    .describe("Per-dimension rows when dimension!=overview"),
};

const performanceTimeseriesOutput = {
  data: z
    .array(
      z
        .object({
          bucket: z.string().optional(),
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
        "Get Core Web Vitals performance metrics (LCP, CLS, INP, FCP, TTFB) with p50, p75, p90, p99 percentiles. Optionally break down by page path, browser, or OS.",
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
      outputSchema: performanceOutput,
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
          const data = await client.get<PerformanceByDimension[]>(
            `/sites/${siteId}/performance/by-dimension`,
            params
          );
          const wrapped = { data };
          return {
            structuredContent: wrapped as unknown as Record<string, unknown>,
            content: [{ type: "text" as const, text: truncateResponse(data) }],
          };
        }

        const data = await client.get<PerformanceOverview>(
          `/sites/${siteId}/performance/overview`,
          params
        );
        return {
          structuredContent: data as unknown as Record<string, unknown>,
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
      outputSchema: performanceTimeseriesOutput,
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

        const data = await client.get<PerformanceTimeSeries[]>(
          `/sites/${siteId}/performance/time-series`,
          params
        );
        const wrapped = { data };
        return {
          structuredContent: wrapped as unknown as Record<string, unknown>,
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
