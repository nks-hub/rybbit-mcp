import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { RybbitClient, truncateResponse } from "../client.js";
import { analyticsInputSchema, bucketSchema, siteIdSchema } from "../schemas.js";

interface VersionResponse {
  version: string;
}

interface ConfigResponse {
  disableSignup: boolean;
  mapboxToken?: string;
}

interface Site {
  id: string;
  domain: string;
  name: string;
  organizationId: string;
  [key: string]: unknown;
}

interface Organization {
  id: string | number;
  name: string;
  sites?: Site[];
  [key: string]: unknown;
}

export function registerConfigTools(
  server: McpServer,
  client: RybbitClient
): void {
  server.registerTool(
    "rybbit_get_config",
    {
      title: "Get Rybbit Config",
      description: "Get Rybbit server version and configuration",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
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
              text: truncateResponse(combined),
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
      title: "List Sites",
      description:
        "List all sites and organizations the authenticated user has access to",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async () => {
      try {
        const data = await client.get<Organization[]>("/organizations");

        return {
          content: [
            {
              type: "text" as const,
              text: truncateResponse(data),
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
    "rybbit_create_site",
    {
      title: "Create Site",
      description:
        "Create a new site in Rybbit. Use type 'web' for websites (domain like 'example.com') or type 'app' for mobile apps (package name like 'com.example.app'). Returns the created site with its siteId for tracking integration.",
      inputSchema: {
        domain: z
          .string()
          .describe("Domain of the site (e.g. 'example.com') or package name for apps (e.g. 'com.example.app')"),
        name: z
          .string()
          .optional()
          .describe("Display name for the site (defaults to domain)"),
        organizationId: z
          .string()
          .describe(
            "Organization ID to add the site to. Use rybbit_list_sites to find organization IDs."
          ),
        type: z
          .enum(["web", "app"])
          .optional()
          .describe("Site type: 'web' for websites (default), 'app' for mobile apps"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ domain, name, organizationId, type }) => {
      try {
        const isApp = type === "app";
        const data = await client.post<Site>(
          `/organizations/${organizationId}/sites`,
          {
            domain,
            name: name || domain,
            ...(type ? { type } : {}),
            // App sites must have blockBots disabled - Dart/Flutter HTTP UA is detected as bot
            ...(isApp ? { blockBots: false } : {}),
          }
        );

        // For app sites, ensure blockBots is disabled via config update
        if (isApp && data.id) {
          try {
            await client.put(`/sites/${data.id}/config`, { blockBots: false });
          } catch {
            // Best-effort, create already set it
          }
        }

        return {
          content: [
            {
              type: "text" as const,
              text: truncateResponse({
                message: `Site '${data.domain}' created successfully${isApp ? " (blockBots disabled for app site)" : ""}`,
                siteId: data.id,
                domain: data.domain,
                name: data.name,
                organizationId: data.organizationId,
              }),
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
    "rybbit_get_site_id",
    {
      title: "Get Site ID by Domain",
      description:
        "Look up a site by domain name. Returns the numeric siteId used for analytics API queries. Note: for SDK tracking setup, use the hash siteId returned by rybbit_create_site instead.",
      inputSchema: {
        domain: z
          .string()
          .describe(
            "Domain to search for (e.g. 'example.com'). Partial match supported."
          ),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ domain }) => {
      try {
        const orgs = await client.get<Organization[]>("/organizations");
        const matches: { siteId: string; domain: string; name: string; organization: string }[] = [];

        for (const org of orgs) {
          for (const site of org.sites ?? []) {
            if (
              site.domain.toLowerCase().includes(domain.toLowerCase()) ||
              domain.toLowerCase().includes(site.domain.toLowerCase())
            ) {
              matches.push({
                siteId: site.id,
                domain: site.domain,
                name: site.name,
                organization: String(org.name),
              });
            }
          }
        }

        if (matches.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No site found matching '${domain}'. Use rybbit_list_sites to see all available sites, or rybbit_create_site to create one.`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: truncateResponse(
                matches.length === 1 ? matches[0] : matches
              ),
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
    "rybbit_update_site_config",
    {
      title: "Update Site Config",
      description:
        "Update configuration for an existing Rybbit site. Toggle tracking features like IP tracking, session replay, error tracking, button clicks, etc.",
      inputSchema: {
        siteId: siteIdSchema,
        public: z.boolean().optional().describe("Make site stats publicly accessible"),
        saltUserIds: z.boolean().optional().describe("Salt user IDs for privacy"),
        blockBots: z.boolean().optional().describe("Block known bots from tracking"),
        trackIp: z.boolean().optional().describe("Track visitor IP addresses"),
        trackErrors: z.boolean().optional().describe("Track JavaScript errors"),
        trackOutbound: z.boolean().optional().describe("Track outbound link clicks"),
        trackUrlParams: z.boolean().optional().describe("Track URL parameters"),
        trackInitialPageView: z.boolean().optional().describe("Track initial page view automatically"),
        trackSpaNavigation: z.boolean().optional().describe("Track SPA navigation events"),
        trackButtonClicks: z.boolean().optional().describe("Track button click events"),
        trackCopy: z.boolean().optional().describe("Track text copy events"),
        trackFormInteractions: z.boolean().optional().describe("Track form interaction events"),
        sessionReplay: z.boolean().optional().describe("Enable session replay recording"),
        webVitals: z.boolean().optional().describe("Track Core Web Vitals metrics"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ siteId, ...config }) => {
      try {
        // Filter out undefined values
        const body: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(config)) {
          if (value !== undefined) {
            body[key] = value;
          }
        }

        if (Object.keys(body).length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No configuration changes provided. Specify at least one setting to update.",
              },
            ],
          };
        }

        const data = await client.put<{ success: boolean; config: Record<string, unknown> }>(
          `/sites/${siteId}/config`,
          body
        );

        return {
          content: [
            {
              type: "text" as const,
              text: truncateResponse(data),
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
    "rybbit_delete_site",
    {
      title: "Delete Site",
      description:
        "Delete a site from Rybbit. This permanently removes the site and its replay data. Use rybbit_list_sites or rybbit_get_site_id to find site IDs.",
      inputSchema: {
        siteId: siteIdSchema,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ siteId }) => {
      try {
        const data = await client.delete<{ success: boolean }>(
          `/sites/${siteId}`
        );

        return {
          content: [
            {
              type: "text" as const,
              text: truncateResponse({
                message: `Site '${siteId}' deleted successfully`,
                ...data,
              }),
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
