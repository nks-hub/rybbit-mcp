import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { RybbitClient, unwrapRows } from "../client.js";
import { jsonResult, output } from "../response.js";
import { analyticsInputSchema, paginationSchema, siteIdSchema } from "../schemas.js";

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

// Output schemas
const configOutput = {
  version: z.string().optional().describe("Rybbit server version string"),
  disableSignup: z.boolean().optional().describe("Whether public signup is disabled"),
  mapboxToken: z.string().optional().describe("Mapbox token (if configured)"),
};

const siteOutput = {
  id: z.union([z.string(), z.number()]).optional(),
  domain: z.string().optional(),
  name: z.string().optional(),
  organizationId: z.union([z.string(), z.number()]).optional(),
};

const listSitesOutput = {
  data: z
    .array(
      z
        .object({
          id: z.union([z.string(), z.number()]),
          name: z.string(),
          sites: z.array(z.object(siteOutput).passthrough()).optional(),
        })
        .passthrough()
    )
    .describe("Organizations with nested sites"),
  totalCount: z.number().optional().describe("Number of sites across all organizations"),
};

const createSiteOutput = {
  message: z.string().optional(),
  siteId: z
    .union([z.string(), z.number()])
    .optional()
    .describe("Numeric site ID, the value rybbit_list_sites and rybbit_get_site_id report"),
  stringId: z
    .string()
    .optional()
    .describe("Opaque string ID of the same site; accepted wherever siteId is"),
  domain: z.string().optional(),
  name: z.string().optional(),
  organizationId: z.union([z.string(), z.number()]).optional(),
};

const getSiteIdOutput = {
  matches: z
    .array(
      z.object({
        siteId: z.union([z.string(), z.number()]),
        domain: z.string(),
        name: z.string(),
        organization: z.string(),
      })
    )
    .optional()
    .describe("Matching sites"),
  message: z.string().optional().describe("Diagnostic message when no match"),
};

const updateSiteConfigOutput = {
  success: z.boolean().optional(),
  message: z.string().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
};

const deleteSiteOutput = {
  success: z.boolean().optional(),
  message: z.string().optional(),
};

const siteHasDataOutput = {
  hasData: z.boolean().describe("Whether the site has received any tracking events"),
};

const pageTitlesOutput = {
  data: z
    .array(
      z
        .object({
          value: z.string().nullish().describe("Page title"),
          pathname: z.string().nullish(),
          count: z.number().nullish().describe("Sessions"),
          percentage: z.number().nullish(),
          pageviews: z.number().nullish(),
          bounce_rate: z.number().nullish(),
          time_on_page_seconds: z.number().nullish(),
        })
        .passthrough()
    )
    .optional(),
  totalCount: z.number().optional().describe("Page titles in the range, across all pages"),
};

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
      outputSchema: output(configOutput),
      _meta: {
        "openai/toolInvocation/invoking": "Loading config…",
        "openai/toolInvocation/invoked": "Config loaded",
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
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

        return jsonResult(combined);
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
        "List the organizations and sites the authenticated user has access to. Each site has the `id` to pass as siteId, its domain, name and privacy switches. To find one site on a large account use rybbit_get_site_id.",
      inputSchema: {},
      outputSchema: output(listSitesOutput),
      _meta: {
        "openai/toolInvocation/invoking": "Listing sites…",
        "openai/toolInvocation/invoked": "Sites listed",
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        const orgs = unwrapRows(await client.get<Organization[]>("/organizations")).rows as Organization[];

        // Keep what identifies a site and its privacy switches; the rest
        // (owner ids, timestamps, slugs) triples the payload on large accounts.
        const data = orgs.map((org) => ({
          id: org.id,
          name: org.name,
          role: org.role,
          sites: (org.sites ?? []).map((site) => ({
            id: site.id,
            domain: site.domain,
            name: site.name,
            public: site.public,
            blockBots: site.blockBots,
            saltUserIds: site.saltUserIds,
          })),
        }));

        return jsonResult({ data, totalCount: data.reduce((n, org) => n + org.sites.length, 0) });
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
        "Create a new site in Rybbit. Use type 'web' for websites (domain like 'example.com') or type 'mobile' for mobile apps (package name like 'com.example.app'). 'app' is accepted as a legacy alias for 'mobile'. Returns the numeric siteId (the one every other tool and rybbit_get_site_id use) and stringId, an opaque alias of the same site.",
      inputSchema: {
        domain: z
          .string()
          .describe("Domain of the site (e.g. 'example.com') or package name for mobile apps (e.g. 'com.example.app')"),
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
          .enum(["web", "mobile", "app"])
          .optional()
          .describe("Site type: 'web' for websites (default), 'mobile' for mobile apps. 'app' is a legacy alias mapped to 'mobile'."),
      },
      outputSchema: output(createSiteOutput),
      _meta: {
        "openai/toolInvocation/invoking": "Creating site…",
        "openai/toolInvocation/invoked": "Site created",
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ domain, name, organizationId, type }) => {
      try {
        // 'app' is a legacy alias for the canonical 'mobile' site type (Rybbit v2.6 API).
        // The server maps only type === "mobile" to a mobile site; anything else becomes web.
        const isMobile = type === "mobile" || type === "app";
        const resolvedType = isMobile ? "mobile" : type === "web" ? "web" : undefined;
        const data = await client.post<Site>(
          `/organizations/${organizationId}/sites`,
          {
            domain,
            name: name || domain,
            ...(resolvedType ? { type: resolvedType } : {}),
            // Mobile sites must have blockBots disabled - Dart/Flutter HTTP UA is detected as bot
            ...(isMobile ? { blockBots: false } : {}),
          }
        );

        // For mobile sites, ensure blockBots is disabled via config update
        if (isMobile && data.id) {
          try {
            await client.put(`/sites/${data.id}/config`, { blockBots: false });
          } catch {
            // Best-effort, create already set it
          }
        }

        const result = {
          message: `Site '${data.domain}' created successfully${isMobile ? " (blockBots disabled for mobile site)" : ""}`,
          siteId: data.siteId !== undefined ? String(data.siteId) : data.id,
          stringId: data.id,
          domain: data.domain,
          name: data.name,
          organizationId: data.organizationId,
        };

        return jsonResult(result);
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
        "Look up a site by domain name. Returns the numeric siteId to pass to the other tools, the same value rybbit_create_site and rybbit_list_sites report.",
      inputSchema: {
        domain: z
          .string()
          .describe(
            "Domain to search for (e.g. 'example.com'). Partial match supported."
          ),
      },
      outputSchema: output(getSiteIdOutput),
      _meta: {
        "openai/toolInvocation/invoking": "Looking up site…",
        "openai/toolInvocation/invoked": "Lookup done",
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
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
          const noMatch = {
            matches: [],
            message: `No site found matching '${domain}'. Use rybbit_list_sites to see all available sites, or rybbit_create_site to create one.`,
          };
          return jsonResult(noMatch);
        }

        const result = { matches };

        return jsonResult(result);
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
        "Update configuration for an existing Rybbit site. Change site identity (name, domain, type), toggle tracking features (IP, session replay, errors, button clicks, etc.), manage exclusions (IPs, countries, paths, hostnames, user agents), and public embedding.",
      inputSchema: {
        siteId: siteIdSchema,
        // Site identity
        name: z
          .string()
          .min(1)
          .max(255)
          .optional()
          .describe("Display name for the site"),
        domain: z
          .string()
          .min(1)
          .max(253)
          .optional()
          .describe("Domain (web sites) or package name (mobile sites). Normalized server-side."),
        type: z
          .enum(["web", "mobile", "app"])
          .optional()
          .describe("Site type: 'web' or 'mobile'. 'app' is a legacy alias mapped to 'mobile'. Switching to mobile forces sessionReplay and webVitals off."),
        // Privacy & filtering
        public: z.boolean().optional().describe("Make site stats publicly accessible"),
        embedEnabled: z.boolean().optional().describe("Allow embedding public stats (e.g. via iframe)"),
        saltUserIds: z.boolean().optional().describe("Salt user IDs for privacy"),
        blockBots: z.boolean().optional().describe("Block known bots from tracking"),
        excludedIPs: z
          .array(z.string().min(1))
          .max(100)
          .optional()
          .describe("IP addresses or CIDR ranges to exclude from tracking (max 100)"),
        excludedCountries: z
          .array(
            z
              .string()
              .length(2)
              .regex(/^[A-Z]{2}$/, "2-letter ISO country code (e.g. US, GB)")
          )
          .max(250)
          .optional()
          .describe("ISO 3166-1 alpha-2 country codes to exclude from tracking (max 250)"),
        excludedPaths: z
          .array(z.string().min(1).max(2048))
          .max(100)
          .optional()
          .describe("URL path patterns to exclude from tracking (max 100)"),
        excludedHostnames: z
          .array(z.string().min(1).max(253))
          .max(100)
          .optional()
          .describe("Hostnames to exclude from tracking (max 100)"),
        excludedUserAgents: z
          .array(z.string().min(1).max(512))
          .max(100)
          .optional()
          .describe("User-agent substrings/patterns to exclude from tracking (max 100)"),
        tags: z
          .array(z.string().min(1).max(50))
          .max(20)
          .optional()
          .describe("Tags for grouping/filtering sites (max 20, each up to 50 chars)"),
        // Tracking toggles
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
      outputSchema: output(updateSiteConfigOutput),
      _meta: {
        "openai/toolInvocation/invoking": "Updating site config…",
        "openai/toolInvocation/invoked": "Config updated",
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
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

        // 'app' is a legacy alias for the canonical 'mobile' site type (Rybbit v2.6 API).
        if (body.type === "app") {
          body.type = "mobile";
        }

        if (Object.keys(body).length === 0) {
          return jsonResult({
            success: false,
            message: "No configuration changes provided. Specify at least one setting to update.",
            config: {},
          });
        }

        const data = await client.put<{ success: boolean; config: Record<string, unknown> }>(
          `/sites/${siteId}/config`,
          body
        );

        return jsonResult(data);
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
      outputSchema: output(deleteSiteOutput),
      _meta: {
        "openai/toolInvocation/invoking": "Deleting site…",
        "openai/toolInvocation/invoked": "Site deleted",
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ siteId }) => {
      try {
        const data = await client.delete<{ success: boolean }>(
          `/sites/${siteId}`
        );

        const result = {
          message: `Site '${siteId}' deleted successfully`,
          ...data,
        };

        return jsonResult(result);
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
    "rybbit_site_has_data",
    {
      title: "Site Has Data",
      description:
        "Check whether a site has received any tracking events yet. Useful for verifying SDK integration before drilling into analytics.",
      inputSchema: {
        siteId: siteIdSchema,
      },
      outputSchema: output(siteHasDataOutput),
      _meta: {
        "openai/toolInvocation/invoking": "Checking data…",
        "openai/toolInvocation/invoked": "Check complete",
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ siteId }) => {
      try {
        const data = await client.get<{ hasData: boolean }>(
          `/sites/${siteId}/has-data`
        );
        return jsonResult(data);
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
    "rybbit_get_page_titles",
    {
      title: "Get Page Titles",
      description:
        "Get the most-viewed page titles for a site, broken down by pageviews and unique sessions. Complements rybbit_get_metric with parameter='pathname' by giving the human-readable page title instead of just the path.",
      inputSchema: {
        ...analyticsInputSchema,
        ...paginationSchema(20),
      },
      outputSchema: output(pageTitlesOutput),
      _meta: {
        "openai/toolInvocation/invoking": "Loading page titles…",
        "openai/toolInvocation/invoked": "Titles loaded",
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const { siteId, ...rest } = args;
        // page and limit go through as is; with a page the server also reports totalCount.
        const params = client.buildAnalyticsParams(rest);
        const data = await client.get(`/sites/${siteId}/page-titles`, params);
        const { rows, totalCount } = unwrapRows(data);
        return jsonResult({ data: rows, ...(totalCount !== undefined ? { totalCount } : {}) });
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
