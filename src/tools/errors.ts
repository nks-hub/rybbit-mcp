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
        openWorldHint: true,
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
          return {
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
          return {
            content: [{ type: "text" as const, text: truncateResponse(data) }],
          };
        }

        const data = await client.get<ErrorName[]>(
          `/sites/${siteId}/error-names`,
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
