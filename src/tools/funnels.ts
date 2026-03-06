import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { RybbitClient, truncateResponse } from "../client.js";
import { analyticsInputSchema, filterSchema, paginationSchema, siteIdSchema } from "../schemas.js";

interface FunnelStep {
  value: string;
  type: "page" | "event";
  name?: string;
}

interface FunnelDefinition {
  id: string | number;
  name: string;
  steps: FunnelStep[];
  [key: string]: unknown;
}

interface FunnelAnalysisResult {
  steps: Array<{
    name: string;
    count: number;
    dropoff?: number;
    dropoffRate?: number;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

export function registerFunnelsTools(
  server: McpServer,
  client: RybbitClient
): void {
  server.registerTool(
    "rybbit_list_funnels",
    {
      title: "List Funnels",
      description:
        "List all saved funnels for a site with their step definitions.",
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
        destructiveHint: false,
      },
      inputSchema: {
        siteId: siteIdSchema,
      },
    },
    async (args) => {
      try {
        const { siteId } = args as { siteId: string };

        const data = await client.get<FunnelDefinition[]>(
          `/sites/${siteId}/funnels`
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
    "rybbit_analyze_funnel",
    {
      title: "Analyze Funnel",
      description:
        "Analyze a custom funnel by defining steps (page visits or events). Returns visitor counts and drop-off rates at each step.",
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
        destructiveHint: false,
      },
      inputSchema: {
        siteId: siteIdSchema,
        startDate: z
          .string()
          .optional()
          .describe("Start date (YYYY-MM-DD)"),
        endDate: z
          .string()
          .optional()
          .describe("End date (YYYY-MM-DD)"),
        timeZone: z
          .string()
          .optional()
          .describe("IANA timezone (default UTC)"),
        filters: z
          .array(filterSchema)
          .optional()
          .describe("Filters to apply"),
        pastMinutesStart: z
          .number()
          .optional()
          .describe("Minutes ago start"),
        pastMinutesEnd: z
          .number()
          .optional()
          .describe("Minutes ago end"),
        steps: z
          .array(
            z.object({
              value: z.string().describe("Page path or event name"),
              type: z.enum(["page", "event"]).describe("Step type"),
              name: z
                .string()
                .optional()
                .describe("Display name for the step"),
            })
          )
          .min(2)
          .describe("Funnel steps to analyze (minimum 2)"),
      },
    },
    async (args) => {
      try {
        const { siteId, steps, ...rest } = args as {
          siteId: string;
          steps: FunnelStep[];
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

        const data = await client.post<FunnelAnalysisResult>(
          `/sites/${siteId}/funnels/analyze`,
          { steps },
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
    "rybbit_get_funnel_step_sessions",
    {
      title: "Funnel Step Sessions",
      description:
        "Get the sessions that reached (or dropped off at) a specific funnel step. Useful for drilling into why users drop off at a particular funnel step.",
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
        destructiveHint: false,
      },
      inputSchema: {
        siteId: siteIdSchema,
        stepNumber: z
          .number()
          .int()
          .min(1)
          .describe("The funnel step number to get sessions for (1-indexed)"),
        mode: z
          .enum(["reached", "dropped"])
          .describe("'reached' = sessions that made it to this step, 'dropped' = sessions that dropped off at this step"),
        startDate: z
          .string()
          .optional()
          .describe("Start date (YYYY-MM-DD)"),
        endDate: z
          .string()
          .optional()
          .describe("End date (YYYY-MM-DD)"),
        timeZone: z
          .string()
          .optional()
          .describe("IANA timezone (default UTC)"),
        filters: z
          .array(filterSchema)
          .optional()
          .describe("Filters to apply"),
        pastMinutesStart: z
          .number()
          .optional()
          .describe("Minutes ago start"),
        pastMinutesEnd: z
          .number()
          .optional()
          .describe("Minutes ago end"),
        steps: z
          .array(
            z.object({
              value: z.string().describe("Page path or event name"),
              type: z.enum(["page", "event"]).describe("Step type"),
              name: z
                .string()
                .optional()
                .describe("Display name for the step"),
            })
          )
          .min(2)
          .describe("The funnel steps definition (same as used in rybbit_analyze_funnel)"),
        ...paginationSchema,
      },
    },
    async (args) => {
      try {
        const { siteId, stepNumber, mode, steps, ...rest } = args as {
          siteId: string;
          stepNumber: number;
          mode: "reached" | "dropped";
          steps: FunnelStep[];
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
          page?: number;
          limit?: number;
        };

        const params = client.buildAnalyticsParams(rest);
        params.mode = mode;

        const data = await client.post(
          `/sites/${siteId}/funnels/${stepNumber}/sessions`,
          { steps },
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
