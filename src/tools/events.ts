import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { RybbitClient, truncateResponse } from "../client.js";
import { analyticsInputSchema, bucketSchema, paginationSchema } from "../schemas.js";

interface EventRow {
  event_name?: string;
  type?: string;
  [key: string]: unknown;
}

interface EventsApiResponse {
  data: EventRow[];
  cursor?: { hasMore: boolean; oldestTimestamp: string | null };
}

export function registerEventsTools(server: McpServer, client: RybbitClient): void {
  server.registerTool(
    "rybbit_list_events",
    {
      title: "List Events",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, destructiveHint: false },
      description:
        "List raw events for a site with filtering and pagination. Returns individual event records with timestamps, types, pathnames, event names, and properties. When filtering by event_name, only matching events are returned (not entire sessions).",
      inputSchema: {
        ...analyticsInputSchema,
        ...paginationSchema,
        eventName: z
          .string()
          .optional()
          .describe("Filter to only return events with this exact event_name (e.g., 'ad_click'). More precise than using the filters array which returns entire sessions."),
      },
    },
    async (args) => {
      try {
        const params = client.buildAnalyticsParams(args);
        const data = await client.get<EventsApiResponse>(`/sites/${args.siteId}/events`, params);

        // Post-filter: if eventName specified, filter to only matching events
        // This works around the backend's session-level event_name filtering
        if (args.eventName && data?.data) {
          data.data = data.data.filter(
            (e) => e.event_name === args.eventName
          );
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

  server.registerTool(
    "rybbit_get_event_names",
    {
      title: "Event Names",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, destructiveHint: false },
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
    "rybbit_get_event_properties",
    {
      title: "Event Properties",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, destructiveHint: false },
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
    "rybbit_get_event_timeseries",
    {
      title: "Event Time Series",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, destructiveHint: false },
      description:
        "Get custom event counts as time-series data with configurable buckets. Useful for analyzing event trends over time.",
      inputSchema: {
        ...analyticsInputSchema,
        bucket: bucketSchema,
      },
    },
    async (args) => {
      try {
        const params = client.buildAnalyticsParams(args);
        const data = await client.get(`/sites/${args.siteId}/events/bucketed`, params);
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
    "rybbit_get_outbound_links",
    {
      title: "Outbound Links",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, destructiveHint: false },
      description:
        "Get outbound link clicks tracked on the site. Shows which external URLs users are clicking and how often.",
      inputSchema: {
        ...analyticsInputSchema,
        ...paginationSchema,
      },
    },
    async (args) => {
      try {
        const params = client.buildAnalyticsParams(args);
        const data = await client.get(`/sites/${args.siteId}/events/outbound`, params);
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
