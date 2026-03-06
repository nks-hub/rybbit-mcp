import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { RybbitClient } from "../client.js";
import { filterSchema, siteIdSchema } from "../schemas.js";

interface JourneyPath {
  path: string[];
  sessions: number;
  percentage?: number;
  [key: string]: unknown;
}

export function registerJourneysTools(
  server: McpServer,
  client: RybbitClient
): void {
  server.registerTool(
    "rybbit_get_journeys",
    {
      description:
        "Get user journey (flow) analysis showing the most common navigation paths through the site. Shows sequences of pages users visit and how many sessions follow each path.",
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
          .number()
          .int()
          .min(2)
          .max(10)
          .optional()
          .describe("Number of journey steps to analyze (default 3)"),
        journeyLimit: z
          .number()
          .int()
          .optional()
          .describe("Max number of journey paths to return (default 100)"),
      },
    },
    async (args) => {
      try {
        const { siteId, steps, journeyLimit, ...rest } = args as {
          siteId: string;
          steps?: number;
          journeyLimit?: number;
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

        if (steps !== undefined) params.steps = steps;
        if (journeyLimit !== undefined) params.limit = journeyLimit;

        const data = await client.get<JourneyPath[]>(
          `/sites/${siteId}/journeys`,
          params
        );
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
