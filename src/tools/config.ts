import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { RybbitClient } from "../client.js";
import { analyticsInputSchema, bucketSchema, siteIdSchema } from "../schemas.js";

interface VersionResponse {
  version: string;
}

interface ConfigResponse {
  disableSignup: boolean;
  mapboxToken?: string;
}

interface Organization {
  id: string | number;
  name: string;
  sites?: unknown[];
  [key: string]: unknown;
}

export function registerConfigTools(
  server: McpServer,
  client: RybbitClient
): void {
  server.registerTool(
    "rybbit_get_config",
    {
      description: "Get Rybbit server version and configuration",
      inputSchema: {},
    },
    async () => {
      try {
        const [versionData, configData] = await Promise.all([
          client.get<VersionResponse>("/version"),
          client.get<ConfigResponse>("/config"),
        ]);

        const combined = {
          version: versionData.version,
          disableSignup: configData.disableSignup,
          mapboxToken: configData.mapboxToken,
        };

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(combined, null, 2),
            },
          ],
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
    "rybbit_list_sites",
    {
      description:
        "List all sites and organizations the authenticated user has access to",
      inputSchema: {},
    },
    async () => {
      try {
        const data = await client.get<Organization[]>("/organizations");

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(data, null, 2),
            },
          ],
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
