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
        "List users for a site. Returns user IDs, session counts, first/last seen dates, and user traits. Supports filtering by any analytics dimension. Use 'search' param to find users by username/email/name (case-insensitive partial match).",
      inputSchema: {
        ...analyticsInputSchema,
        ...paginationSchema,
        search: z
          .string()
          .optional()
          .describe("Search users by trait value (e.g. username, email). Uses case-insensitive partial matching (ILIKE)."),
        searchField: z
          .enum(["username", "name", "email", "user_id"])
          .optional()
          .describe("Which field to search in (default: 'username'). Only used when 'search' is provided."),
        identifiedOnly: z
          .boolean()
          .optional()
          .describe("Only return identified users (users with identified_user_id). Default: false."),
        sortBy: z
          .enum(["first_seen", "last_seen", "pageviews", "sessions", "events"])
          .optional()
          .describe("Sort field (default: 'last_seen')"),
        sortOrder: z
          .enum(["asc", "desc"])
          .optional()
          .describe("Sort direction (default: 'desc')"),
      },
    },
    async (args) => {
      try {
        const params = client.buildAnalyticsParams(args);
        if (args.search) params.search = args.search;
        if (args.searchField) params.search_field = args.searchField;
        if (args.identifiedOnly) params.identified_only = "true";
        if (args.sortBy) params.sort_by = args.sortBy;
        if (args.sortOrder) params.sort_order = args.sortOrder;
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
        "Get user trait keys, values, or find users by trait. mode='keys' lists all trait keys. mode='values' (default when key is provided) returns distinct values for a trait key. mode='users' finds users matching a specific trait key+value pair.",
      inputSchema: {
        siteId: siteIdSchema,
        mode: z
          .enum(["keys", "values", "users"])
          .optional()
          .describe("'keys' to list trait keys, 'values' to get values for a key, 'users' to find users by trait. Default: 'keys' if no key provided, 'values' if key is provided."),
        key: z
          .string()
          .optional()
          .describe(
            "Trait key (required for 'values' and 'users' modes)"
          ),
        value: z
          .string()
          .optional()
          .describe("Trait value (required for 'users' mode)"),
        limit: z.number().optional().describe("Max results to return"),
      },
    },
    async (args) => {
      try {
        let data: unknown;
        const resolvedMode = args.mode ?? (args.key ? "values" : "keys");

        if (resolvedMode === "users") {
          const params: Record<string, string | number> = {};
          if (args.key !== undefined) params.key = args.key;
          if (args.value !== undefined) params.value = args.value;
          if (args.limit !== undefined) params.limit = args.limit;
          data = await client.get(`/sites/${args.siteId}/user-traits/users`, params);
        } else if (resolvedMode === "values" && args.key !== undefined) {
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
