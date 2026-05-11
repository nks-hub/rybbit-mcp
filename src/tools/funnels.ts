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

// Output schemas
const funnelStepShape = z
  .object({
    value: z.string().optional(),
    type: z.enum(["page", "event"]).optional(),
    name: z.string().optional(),
  })
  .passthrough();

const listFunnelsOutput = {
  data: z
    .array(
      z
        .object({
          id: z.union([z.string(), z.number()]).optional(),
          name: z.string().optional(),
          steps: z.array(funnelStepShape).optional(),
        })
        .passthrough()
    )
    .describe("Saved funnels"),
};

const analyzeFunnelOutput = {
  steps: z
    .array(
      z
        .object({
          name: z.string().optional(),
          count: z.number().optional(),
          dropoff: z.number().optional(),
          dropoffRate: z.number().optional(),
        })
        .passthrough()
    )
    .optional()
    .describe("Per-step counts and dropoffs"),
};

const funnelStepSessionsOutput = {
  data: z.array(z.record(z.unknown())).optional().describe("Sessions for the step"),
};

const createFunnelOutput = {
  id: z.union([z.string(), z.number()]).optional(),
  name: z.string().optional(),
  steps: z.array(funnelStepShape).optional(),
};

const deleteFunnelOutput = {
  success: z.boolean().optional(),
  message: z.string().optional(),
};

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
        openWorldHint: false,
        destructiveHint: false,
      },
      inputSchema: {
        siteId: siteIdSchema,
      },
      outputSchema: listFunnelsOutput,
      _meta: {
        "openai/toolInvocation/invoking": "Listing funnels…",
        "openai/toolInvocation/invoked": "Funnels loaded",
      },
    },
    async (args) => {
      try {
        const { siteId } = args as { siteId: string };

        const data = await client.get<FunnelDefinition[]>(
          `/sites/${siteId}/funnels`
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

  server.registerTool(
    "rybbit_analyze_funnel",
    {
      title: "Analyze Funnel",
      description:
        "Analyze a custom funnel by defining steps (page visits or events). Returns visitor counts and drop-off rates at each step.",
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
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
      outputSchema: analyzeFunnelOutput,
      _meta: {
        "openai/toolInvocation/invoking": "Analyzing funnel…",
        "openai/toolInvocation/invoked": "Funnel analyzed",
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
    "rybbit_get_funnel_step_sessions",
    {
      title: "Funnel Step Sessions",
      description:
        "Get the sessions that reached (or dropped off at) a specific funnel step. Useful for drilling into why users drop off at a particular funnel step.",
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
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
      outputSchema: funnelStepSessionsOutput,
      _meta: {
        "openai/toolInvocation/invoking": "Loading step sessions…",
        "openai/toolInvocation/invoked": "Sessions loaded",
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

        const params = client.buildAnalyticsParams({ ...rest, page: rest.page ?? 1 });
        params.mode = mode;

        const data = await client.post(
          `/sites/${siteId}/funnels/${stepNumber}/sessions`,
          { steps },
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

  server.registerTool(
    "rybbit_create_funnel",
    {
      title: "Create Funnel",
      description:
        "Save a new named funnel definition. Steps are evaluated in order. Pass an existing funnel report ID to overwrite that funnel instead of creating a new one.",
      annotations: {
        readOnlyHint: false,
        idempotentHint: false,
        openWorldHint: false,
        destructiveHint: false,
      },
      inputSchema: {
        siteId: siteIdSchema,
        name: z.string().min(1).describe("Funnel display name"),
        steps: z
          .array(
            z.object({
              value: z.string().describe("Page path or event name"),
              type: z.enum(["page", "event"]).describe("Step type"),
              name: z.string().optional().describe("Display name for the step"),
            })
          )
          .min(2)
          .describe("Funnel steps in order (minimum 2)"),
        reportId: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Optional existing funnel report ID to overwrite (instead of creating a new one)"),
      },
      outputSchema: createFunnelOutput,
      _meta: {
        "openai/toolInvocation/invoking": "Saving funnel…",
        "openai/toolInvocation/invoked": "Funnel saved",
      },
    },
    async (args) => {
      try {
        const { siteId, ...body } = args as {
          siteId: string;
          name: string;
          steps: FunnelStep[];
          reportId?: number;
        };

        const data = await client.post(`/sites/${siteId}/funnels`, body);
        const wrapped = (data && typeof data === "object" && !Array.isArray(data))
          ? (data as Record<string, unknown>)
          : { data };
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

  server.registerTool(
    "rybbit_delete_funnel",
    {
      title: "Delete Funnel",
      description: "Permanently delete a saved funnel. This action cannot be undone.",
      annotations: {
        readOnlyHint: false,
        idempotentHint: true,
        openWorldHint: false,
        destructiveHint: true,
      },
      inputSchema: {
        siteId: siteIdSchema,
        funnelId: z
          .union([z.string(), z.number()])
          .describe("Funnel ID to delete (from rybbit_list_funnels)"),
      },
      outputSchema: deleteFunnelOutput,
      _meta: {
        "openai/toolInvocation/invoking": "Deleting funnel…",
        "openai/toolInvocation/invoked": "Funnel deleted",
      },
    },
    async (args) => {
      try {
        const { siteId, funnelId } = args as { siteId: string; funnelId: string | number };
        const data = await client.delete(`/sites/${siteId}/funnels/${funnelId}`);
        const wrapped = (data && typeof data === "object" && !Array.isArray(data))
          ? (data as Record<string, unknown>)
          : { success: true };
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
