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
        openWorldHint: true,
        destructiveHint: false,
      },
      inputSchema: {
        ...analyticsInputSchema,
        dimension: dimensionSchema,
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
          return {
            content: [{ type: "text" as const, text: truncateResponse(data) }],
          };
        }

        const data = await client.get<PerformanceOverview>(
          `/sites/${siteId}/performance/overview`,
          params
        );
        return {
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
        openWorldHint: true,
        destructiveHint: false,
      },
      inputSchema: {
        ...analyticsInputSchema,
        bucket: bucketSchema,
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
        return {
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
