import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { RybbitClient, truncateResponse } from "../client.js";
import { analyticsInputSchema, paginationSchema, siteIdSchema } from "../schemas.js";

export function registerUsersTools(server: McpServer, client: RybbitClient): void {
  server.registerTool(
    "rybbit_list_users",
    {
      title: "List Users",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, destructiveHint: false },
      description:
        "List identified users for a site. Returns user IDs, session counts, first/last seen dates, and user traits. Supports filtering by any analytics dimension.",
      inputSchema: {
        ...analyticsInputSchema,
        ...paginationSchema,
      },
    },
    async (args) => {
      try {
        const params = client.buildAnalyticsParams(args);
        const data = await client.get(`/sites/${args.siteId}/users`, params);
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
    "rybbit_get_user",
    {
      title: "User Detail",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, destructiveHint: false },
      description:
        "Get detailed information about a specific user including their traits, session history, and activity summary.",
      inputSchema: {
        siteId: siteIdSchema,
        userId: z.string().describe("User ID (identified_user_id or internal user ID)"),
      },
    },
    async (args) => {
      try {
        const data = await client.get(`/sites/${args.siteId}/users/${args.userId}`);
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
    "rybbit_get_user_traits",
    {
      title: "User Traits",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, destructiveHint: false },
      description:
        "Get user trait keys and their values. Without a key parameter, returns all available trait keys. With a key, returns the distinct values for that trait.",
      inputSchema: {
        siteId: siteIdSchema,
        key: z
          .string()
          .optional()
          .describe(
            "Specific trait key to get values for. Omit to list all available trait keys."
          ),
        limit: z.number().optional().describe("Max values to return per key"),
      },
    },
    async (args) => {
      try {
        let data: unknown;
        if (args.key !== undefined) {
          const params: Record<string, string | number> = { key: args.key };
          if (args.limit !== undefined) params.limit = args.limit;
          data = await client.get(`/sites/${args.siteId}/user-traits/values`, params);
        } else {
          data = await client.get(`/sites/${args.siteId}/user-traits/keys`);
        }
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
