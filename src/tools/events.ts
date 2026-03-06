import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { RybbitClient } from "../client.js";
import { analyticsInputSchema, paginationSchema } from "../schemas.js";

export function registerEventsTools(server: McpServer, client: RybbitClient): void {
  server.registerTool(
    "rybbit_list_events",
    {
      description:
        "List raw events for a site with filtering and pagination. Returns individual event records with timestamps, types, pathnames, event names, and properties.",
      inputSchema: {
        ...analyticsInputSchema,
        ...paginationSchema,
      },
    },
    async (args) => {
      try {
        const params = client.buildAnalyticsParams(args);
        const data = await client.get(`/sites/${args.siteId}/events`, params);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
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
    "rybbit_get_event_names",
    {
      description:
        "Get all custom event names and their occurrence counts for a site. Useful for discovering what events are being tracked.",
      inputSchema: {
        ...analyticsInputSchema,
      },
    },
    async (args) => {
      try {
        const params = client.buildAnalyticsParams(args);
        const data = await client.get(`/sites/${args.siteId}/events/names`, params);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
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
    "rybbit_get_event_properties",
    {
      description:
        "Get property breakdowns for a specific custom event. Returns the distinct property keys and values with counts.",
      inputSchema: {
        ...analyticsInputSchema,
        eventName: z.string().describe("Event name to get properties for"),
      },
    },
    async (args) => {
      try {
        const params = client.buildAnalyticsParams(args);
        params.event_name = args.eventName;
        const data = await client.get(`/sites/${args.siteId}/events/properties`, params);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
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
