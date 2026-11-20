import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { RybbitClient, unwrapRows } from "../client.js";
import { jsonResult, output } from "../response.js";
import { analyticsInputSchema, paginationSchema } from "../schemas.js";

/** The error endpoints nest rows one level deeper once `page` is sent. */
function rowsResult(raw: unknown) {
  const { rows, totalCount } = unwrapRows(raw);
  return jsonResult({ data: rows, ...(totalCount !== undefined ? { totalCount } : {}) });
}

// Output schema — single union covering names, events, and timeseries shapes
const errorsOutput = {
  data: z
    .array(
      z
        .object({
          // names rows
          value: z.string().nullish().describe("Error message; pass it as errorMessage"),
          errorName: z.string().nullish(),
          count: z.number().nullish(),
          sessionCount: z.number().nullish(),
          // event rows
          timestamp: z.string().nullish(),
          message: z.string().nullish(),
          stack: z.string().nullish(),
          // timeseries rows
          time: z.string().nullish(),
          error_count: z.number().nullish(),
        })
        .passthrough()
    )
    .optional()
    .describe("Error rows — shape depends on `type` input (names | events | timeseries)"),
  totalCount: z.number().optional().describe("Rows across all pages, when the server reports it"),
};

export function registerErrorsTools(
  server: McpServer,
  client: RybbitClient
): void {
  server.registerTool(
    "rybbit_get_errors",
    {
      title: "Error Tracking",
      description:
        "Get error tracking data. Workflow: (1) type='names' to see error types and counts, (2) type='events' with errorMessage to see individual instances with stack traces, (3) type='timeseries' with errorMessage to see trends over time.",
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
        destructiveHint: false,
      },
      inputSchema: {
        ...analyticsInputSchema,
        ...paginationSchema,
        type: z
          .enum(["names", "events", "timeseries"])
          .optional()
          .describe(
            "'names' for error type summary with counts, 'events' for individual error instances with stack traces, 'timeseries' for error count trends over time for a specific error. Default: names"
          ),
        errorMessage: z
          .string()
          .optional()
          .describe("Error message filter (required for type='events' and type='timeseries'). Use type='names' first to discover error messages."),
        bucket: z
          .enum(["minute", "five_minutes", "hour", "day", "week", "month"])
          // The time-series endpoint answers 500 when no bucket is sent.
          .default("day")
          .describe("Time bucket for type='timeseries'"),
      },
      outputSchema: output(errorsOutput),
      _meta: {
        "openai/toolInvocation/invoking": "Loading errors…",
        "openai/toolInvocation/invoked": "Errors loaded",
      },
    },
    async (args) => {
      try {
        const { siteId, type, errorMessage, bucket, page, limit, ...rest } = args as {
          siteId: string;
          type?: "names" | "events" | "timeseries";
          errorMessage?: string;
          bucket?: string;
          page?: number;
          limit?: number;
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

        const params = client.buildAnalyticsParams({ ...rest, page, limit, bucket });

        if (type === "timeseries") {
          if (!errorMessage) {
            return {
              content: [{ type: "text" as const, text: "Error: errorMessage is required for type='timeseries'. Use type='names' first to discover error messages, then pass one to errorMessage." }],
              isError: true,
            };
          }
          params.errorMessage = errorMessage;
          return rowsResult(await client.get(`/sites/${siteId}/errors/time-series`, params));
        }

        if (type === "events") {
          if (!errorMessage) {
            return {
              content: [{ type: "text" as const, text: "Error: errorMessage is required for type='events'. Use type='names' first to discover error messages, then pass one to errorMessage." }],
              isError: true,
            };
          }
          params.errorMessage = errorMessage;
          return rowsResult(await client.get(`/sites/${siteId}/errors/events`, params));
        }

        return rowsResult(await client.get(`/sites/${siteId}/errors/names`, params));
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
