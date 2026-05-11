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

// Output schemas
const eventRowShape = z
  .object({
    event_name: z.string().optional(),
    type: z.string().optional(),
  })
  .passthrough();

const listEventsOutput = {
  data: z.array(eventRowShape).optional(),
  cursor: z
    .object({
      hasMore: z.boolean(),
      oldestTimestamp: z.string().nullable(),
    })
    .passthrough()
    .optional(),
};

const eventNamesOutput = {
  data: z
    .array(
      z
        .object({
          event_name: z.string().optional(),
          count: z.number().optional(),
        })
        .passthrough()
    )
    .optional(),
};

const eventPropertiesOutput = {
  data: z
    .array(
      z
        .object({
          key: z.string().optional(),
          value: z.union([z.string(), z.number(), z.boolean()]).optional(),
          count: z.number().optional(),
        })
        .passthrough()
    )
    .optional(),
};

const eventTimeseriesOutput = {
  data: z
    .array(
      z
        .object({
          time: z.string().optional(),
          count: z.number().optional(),
        })
        .passthrough()
    )
    .optional(),
};

const outboundLinksOutput = {
  data: z
    .array(
      z
        .object({
          url: z.string().optional(),
          clicks: z.number().optional(),
        })
        .passthrough()
    )
    .optional(),
};

export function registerEventsTools(server: McpServer, client: RybbitClient): void {
  server.registerTool(
    "rybbit_list_events",
    {
      title: "List Events",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false, destructiveHint: false },
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
      outputSchema: listEventsOutput,
      _meta: {
        "openai/toolInvocation/invoking": "Listing events…",
        "openai/toolInvocation/invoked": "Events loaded",
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
    "rybbit_get_event_names",
    {
      title: "Event Names",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false, destructiveHint: false },
      description:
        "Get all custom event names and their occurrence counts for a site. Useful for discovering what events are being tracked.",
      inputSchema: {
        ...analyticsInputSchema,
      },
      outputSchema: eventNamesOutput,
      _meta: {
        "openai/toolInvocation/invoking": "Loading event names…",
        "openai/toolInvocation/invoked": "Event names loaded",
      },
    },
    async (args) => {
      try {
        const params = client.buildAnalyticsParams(args);
        const data = await client.get(`/sites/${args.siteId}/events/names`, params);
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
    "rybbit_get_event_properties",
    {
      title: "Event Properties",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false, destructiveHint: false },
      description:
        "Get property breakdowns for a specific custom event. Returns the distinct property keys and values with counts.",
      inputSchema: {
        ...analyticsInputSchema,
        eventName: z.string().describe("Event name to get properties for"),
      },
      outputSchema: eventPropertiesOutput,
      _meta: {
        "openai/toolInvocation/invoking": "Loading properties…",
        "openai/toolInvocation/invoked": "Properties loaded",
      },
    },
    async (args) => {
      try {
        const params = client.buildAnalyticsParams(args);
        params.event_name = args.eventName;
        const data = await client.get(`/sites/${args.siteId}/events/properties`, params);
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
    "rybbit_get_event_timeseries",
    {
      title: "Event Time Series",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false, destructiveHint: false },
      description:
        "Get custom event counts as time-series data with configurable buckets. Useful for analyzing event trends over time.",
      inputSchema: {
        ...analyticsInputSchema,
        bucket: bucketSchema,
      },
      outputSchema: eventTimeseriesOutput,
      _meta: {
        "openai/toolInvocation/invoking": "Querying timeseries…",
        "openai/toolInvocation/invoked": "Timeseries loaded",
      },
    },
    async (args) => {
      try {
        const params = client.buildAnalyticsParams(args);
        const data = await client.get(`/sites/${args.siteId}/events/bucketed`, params);
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
    "rybbit_get_outbound_links",
    {
      title: "Outbound Links",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false, destructiveHint: false },
      description:
        "Get outbound link clicks tracked on the site. Shows which external URLs users are clicking and how often.",
      inputSchema: {
        ...analyticsInputSchema,
        ...paginationSchema,
      },
      outputSchema: outboundLinksOutput,
      _meta: {
        "openai/toolInvocation/invoking": "Loading links…",
        "openai/toolInvocation/invoked": "Links loaded",
      },
    },
    async (args) => {
      try {
        const params = client.buildAnalyticsParams(args);
        const data = await client.get(`/sites/${args.siteId}/events/outbound`, params);
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
