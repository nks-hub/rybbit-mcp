import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { RybbitClient, truncateResponse } from "../client.js";
import { analyticsInputSchema, paginationSchema } from "../schemas.js";

interface ErrorName {
  name: string;
  count: number;
  [key: string]: unknown;
}

interface ErrorEvent {
  id: string;
  name: string;
  message?: string;
  stack?: string;
  [key: string]: unknown;
}

// Output schema — single union covering names, events, and timeseries shapes
const errorsOutput = {
  data: z
    .array(
      z
        .object({
          // names rows
          name: z.string().optional(),
          count: z.number().optional(),
          // event rows
          id: z.string().optional(),
          message: z.string().optional(),
          stack: z.string().optional(),
          // timeseries rows
          time: z.string().optional(),
        })
        .passthrough()
    )
    .optional()
    .describe("Error rows — shape depends on `type` input (names | events | timeseries)"),
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
          .optional()
          .describe("Time bucket for timeseries type (default: day)"),
      },
      outputSchema: errorsOutput,
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
          const data = await client.get<unknown[]>(
            `/sites/${siteId}/error-bucketed`,
            params
          );
          const wrapped = Array.isArray(data) ? { data } : (data as Record<string, unknown>);
          return {
            structuredContent: wrapped as unknown as Record<string, unknown>,
            content: [{ type: "text" as const, text: truncateResponse(data) }],
          };
        }

        if (type === "events") {
          if (!errorMessage) {
            return {
              content: [{ type: "text" as const, text: "Error: errorMessage is required for type='events'. Use type='names' first to discover error messages, then pass one to errorMessage." }],
              isError: true,
            };
          }
          params.errorMessage = errorMessage;
          const data = await client.get<ErrorEvent[]>(
            `/sites/${siteId}/error-events`,
            params
          );
          const wrapped = Array.isArray(data) ? { data } : (data as Record<string, unknown>);
          return {
            structuredContent: wrapped as unknown as Record<string, unknown>,
            content: [{ type: "text" as const, text: truncateResponse(data) }],
          };
        }

        const data = await client.get<ErrorName[]>(
          `/sites/${siteId}/error-names`,
          params
        );
        const wrapped = Array.isArray(data) ? { data } : (data as Record<string, unknown>);
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
