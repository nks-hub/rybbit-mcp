import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { RybbitClient, truncateResponse } from "../client.js";
import { filterSchema, paginationSchema, siteIdSchema } from "../schemas.js";

interface Goal {
  id: string | number;
  name: string;
  type: string;
  value?: string;
  conversions?: number;
  conversionRate?: number;
  [key: string]: unknown;
}

// Output schemas
const goalShape = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    name: z.string().optional(),
    type: z.string().optional(),
    value: z.string().optional(),
    conversions: z.number().optional(),
    conversionRate: z.number().optional(),
  })
  .passthrough();

const listGoalsOutput = {
  data: z.array(goalShape).describe("Goals with conversion metrics"),
};

const goalSessionsOutput = {
  data: z.array(z.record(z.unknown())).optional().describe("Sessions that hit the goal"),
};

const goalMutationOutput = {
  id: z.union([z.string(), z.number()]).optional(),
  name: z.string().optional(),
  success: z.boolean().optional(),
  message: z.string().optional(),
};

export function registerGoalsTools(
  server: McpServer,
  client: RybbitClient
): void {
  server.registerTool(
    "rybbit_list_goals",
    {
      title: "List Goals",
      description:
        "List all goals for a site with their current conversion metrics and configuration.",
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
      },
      outputSchema: listGoalsOutput,
      _meta: {
        "openai/toolInvocation/invoking": "Listing goals…",
        "openai/toolInvocation/invoked": "Goals loaded",
      },
    },
    async (args) => {
      try {
        const { siteId, ...rest } = args as {
          siteId: string;
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

        const data = await client.get<Goal[]>(
          `/sites/${siteId}/goals`,
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

  server.registerTool(
    "rybbit_get_goal_sessions",
    {
      title: "Goal Sessions",
      description:
        "Get sessions that completed a specific goal. Useful for analyzing which users and sessions triggered goal conversions.",
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
        destructiveHint: false,
      },
      inputSchema: {
        siteId: siteIdSchema,
        goalId: z
          .string()
          .describe("Goal ID to get sessions for. Use rybbit_list_goals to find goal IDs."),
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
        ...paginationSchema,
      },
      outputSchema: goalSessionsOutput,
      _meta: {
        "openai/toolInvocation/invoking": "Loading sessions…",
        "openai/toolInvocation/invoked": "Sessions loaded",
      },
    },
    async (args) => {
      try {
        const { siteId, goalId, ...rest } = args as {
          siteId: string;
          goalId: string;
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

        const data = await client.get(
          `/sites/${siteId}/goals/${goalId}/sessions`,
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

  // Shared schema for goal config payload
  const goalConfigSchema = z
    .object({
      pathPattern: z
        .string()
        .optional()
        .describe("Path pattern (required when goalType='path'). Supports wildcards like /products/*"),
      eventName: z
        .string()
        .optional()
        .describe("Event name (required when goalType='event')"),
      eventPropertyKey: z
        .string()
        .optional()
        .describe("Event property key to match (optional, must be paired with eventPropertyValue)"),
      eventPropertyValue: z
        .union([z.string(), z.number(), z.boolean()])
        .optional()
        .describe("Event property value to match (optional, must be paired with eventPropertyKey)"),
      propertyFilters: z
        .array(
          z.object({
            key: z.string(),
            value: z.union([z.string(), z.number(), z.boolean()]),
          })
        )
        .optional()
        .describe("Multiple property filters (alternative to single eventPropertyKey/Value pair)"),
    })
    .describe("Goal configuration. Use pathPattern for path goals or eventName for event goals.");

  server.registerTool(
    "rybbit_create_goal",
    {
      title: "Create Goal",
      description:
        "Create a new conversion goal for a site. Goal can be path-based (URL match) or event-based (custom event triggered).",
      annotations: {
        readOnlyHint: false,
        idempotentHint: false,
        openWorldHint: false,
        destructiveHint: false,
      },
      inputSchema: {
        siteId: siteIdSchema,
        name: z.string().optional().describe("Optional display name for the goal"),
        goalType: z.enum(["path", "event"]).describe("'path' = URL pattern, 'event' = custom event"),
        config: goalConfigSchema,
      },
      outputSchema: goalMutationOutput,
      _meta: {
        "openai/toolInvocation/invoking": "Creating goal…",
        "openai/toolInvocation/invoked": "Goal created",
      },
    },
    async (args) => {
      try {
        const { siteId, ...body } = args as {
          siteId: string;
          name?: string;
          goalType: "path" | "event";
          config: Record<string, unknown>;
        };

        const data = await client.post(`/sites/${siteId}/goals`, body);
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
    "rybbit_update_goal",
    {
      title: "Update Goal",
      description: "Update an existing goal's name, type, or configuration.",
      annotations: {
        readOnlyHint: false,
        idempotentHint: true,
        openWorldHint: false,
        destructiveHint: false,
      },
      inputSchema: {
        siteId: siteIdSchema,
        goalId: z.number().int().positive().describe("Numeric goal ID to update"),
        name: z.string().optional(),
        goalType: z.enum(["path", "event"]),
        config: goalConfigSchema,
      },
      outputSchema: goalMutationOutput,
      _meta: {
        "openai/toolInvocation/invoking": "Updating goal…",
        "openai/toolInvocation/invoked": "Goal updated",
      },
    },
    async (args) => {
      try {
        const { siteId, goalId, ...body } = args as {
          siteId: string;
          goalId: number;
          name?: string;
          goalType: "path" | "event";
          config: Record<string, unknown>;
        };

        // Server expects siteId+goalId in body too (numeric)
        const numericSiteId = parseInt(siteId, 10);
        const data = await client.put(`/sites/${siteId}/goals/${goalId}`, {
          ...body,
          goalId,
          siteId: numericSiteId,
        });
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
    "rybbit_delete_goal",
    {
      title: "Delete Goal",
      description: "Permanently delete a goal. This action cannot be undone.",
      annotations: {
        readOnlyHint: false,
        idempotentHint: true,
        openWorldHint: false,
        destructiveHint: true,
      },
      inputSchema: {
        siteId: siteIdSchema,
        goalId: z.number().int().positive().describe("Numeric goal ID to delete"),
      },
      outputSchema: goalMutationOutput,
      _meta: {
        "openai/toolInvocation/invoking": "Deleting goal…",
        "openai/toolInvocation/invoked": "Goal deleted",
      },
    },
    async (args) => {
      try {
        const { siteId, goalId } = args as { siteId: string; goalId: number };
        const data = await client.delete(`/sites/${siteId}/goals/${goalId}`);
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
