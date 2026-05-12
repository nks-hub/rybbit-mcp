/**
 * `rybbit_describe_dimension` — capability metadata tool.
 *
 * The Rybbit backend exposes many filter dimensions (browser, country,
 * pathname, event_name, …) but support varies per endpoint:
 *   - `event_name` works in `list_events`, `list_sessions`, `get_metric`,
 *     `get_overview*`, `funnels`, but CRASHES the backend's `getUsers`
 *     endpoint, so `list_users` strips it.
 *   - `user_id` matches BOTH the device hash and identified_user_id.
 *   - `app_version`/`device_model` are populated only for app-type sites
 *     (tracked via SDK), not browser pageview sites.
 *
 * Without this tool, models have to discover these gotchas by trial &
 * error. This tool is the source of truth: given a dimension name it
 * returns which tools support it, which strip it, and any value hints.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

interface DimensionInfo {
    parameter: string;
    description: string;
    supportedIn: string[];
    strippedIn: { tool: string; reason: string }[];
    valueHint: string;
    examples: string[];
}

const DIMENSIONS: Record<string, DimensionInfo> = {
    event_name: {
        parameter: "event_name",
        description: "Name of a custom analytics event sent via rybbit.track().",
        supportedIn: [
            "rybbit_list_events",
            "rybbit_list_sessions",
            "rybbit_get_metric",
            "rybbit_get_overview",
            "rybbit_get_overview_timeseries",
            "rybbit_get_event_aggregate",
            "rybbit_get_event_user_leaderboard",
            "funnels (any step)",
        ],
        strippedIn: [
            {
                tool: "rybbit_list_users",
                reason: "Backend getUsers endpoint applies a session-level subquery to a CTE outer query where session_id doesn't exist, causing HTTP 500. The MCP wrapper strips event_name from the filters array and emits a warning. Use rybbit_get_event_user_leaderboard or rybbit_get_user_event_breakdown instead.",
            },
        ],
        valueHint: "Discover via rybbit_get_event_names (returns all event_names + counts).",
        examples: ["pm_sent", "chat_v2_message_sent", "ad_click", "server_error"],
    },
    user_id: {
        parameter: "user_id",
        description:
            "User identifier. The filter is SPECIAL — it matches BOTH the Rybbit device hash (`user_id`) AND the app-provided ID (`identified_user_id`). Other tools may distinguish.",
        supportedIn: [
            "rybbit_list_events",
            "rybbit_list_sessions",
            "rybbit_list_users (search via 'search' param recommended)",
            "rybbit_get_user_event_breakdown",
        ],
        strippedIn: [],
        valueHint: "Rybbit device hash (12 hex chars) OR identified_user_id (app's user_id string).",
        examples: ["f07f06c797cc", "138170"],
    },
    pathname: {
        parameter: "pathname",
        description: "URL path component (without querystring).",
        supportedIn: [
            "rybbit_list_events",
            "rybbit_list_sessions",
            "rybbit_list_users",
            "rybbit_get_metric",
            "rybbit_get_overview",
            "rybbit_get_overview_timeseries",
            "rybbit_get_performance",
            "funnels (any step)",
        ],
        strippedIn: [],
        valueHint: "Starts with '/', no querystring. Use regex type for path patterns.",
        examples: ["/novy", "/room/41271", "/api/v1/health"],
    },
    hostname: {
        parameter: "hostname",
        description: "DNS hostname (subdomain). Useful for multi-subdomain sites.",
        supportedIn: ["all analytics endpoints"],
        strippedIn: [],
        valueHint: "Bare hostname without scheme.",
        examples: ["chatujme.cz", "vzkazy.chatujme.cz", "diskuze.chatujme.cz"],
    },
    country: {
        parameter: "country",
        description: "ISO 3166-1 alpha-2 country code.",
        supportedIn: ["all analytics endpoints"],
        strippedIn: [],
        valueHint: "Two-letter ISO code, uppercase.",
        examples: ["CZ", "SK", "DE", "US"],
    },
    device_type: {
        parameter: "device_type",
        description: "Device class derived from user-agent.",
        supportedIn: ["all analytics endpoints"],
        strippedIn: [],
        valueHint: "One of: Desktop, Mobile, Tablet, Smart TV, Wearable, (empty).",
        examples: ["Desktop", "Mobile"],
    },
    browser: {
        parameter: "browser",
        description: "Browser family from user-agent (no version).",
        supportedIn: ["all analytics endpoints"],
        strippedIn: [],
        valueHint: "Common values from UAParser.",
        examples: ["Chrome", "Firefox", "Mobile Chrome", "Mobile Safari", "Edge", "Opera"],
    },
    channel: {
        parameter: "channel",
        description: "Marketing channel classification (Direct, Organic, Referral, …).",
        supportedIn: ["all analytics endpoints"],
        strippedIn: [],
        valueHint: "Rybbit's auto-classified channel.",
        examples: ["Direct", "Organic Search", "Referral", "Paid Social", "Unknown"],
    },
    referrer: {
        parameter: "referrer",
        description: "HTTP referer URL.",
        supportedIn: ["all analytics endpoints"],
        strippedIn: [],
        valueHint: "Full URL with scheme. Empty string for direct visits. Use `contains` for domain matching.",
        examples: ["https://login.chatujme.cz/", "https://google.com/"],
    },
    utm_source: {
        parameter: "utm_source",
        description: "UTM tracking parameter (source). Captured from querystring.",
        supportedIn: ["all analytics endpoints"],
        strippedIn: [],
        valueHint: "Free-form string, common values are source identifiers.",
        examples: ["newsletter", "facebook", "google", "twitter"],
    },
    app_version: {
        parameter: "app_version",
        description: "Application version string. Populated only for app-type sites tracked via SDK (not browser pageview sites).",
        supportedIn: ["all analytics endpoints (limited utility for web sites)"],
        strippedIn: [],
        valueHint: "Empty string for browser sites. Free-form for app sites.",
        examples: ["1.2.3", "(empty)"],
    },
    device_model: {
        parameter: "device_model",
        description: "Mobile device model name. Populated only for app-type sites tracked via SDK.",
        supportedIn: ["all analytics endpoints (limited utility for web sites)"],
        strippedIn: [],
        valueHint: "Empty string for browser sites.",
        examples: ["iPhone15,2", "Pixel 8", "(empty)"],
    },
};

const describeOutput = {
    parameter: z.string(),
    description: z.string(),
    supportedIn: z.array(z.string()),
    strippedIn: z
        .array(
            z.object({
                tool: z.string(),
                reason: z.string(),
            })
        )
        .describe("Tools that silently strip this filter due to upstream bugs. Use alternatives noted in reason."),
    valueHint: z.string(),
    examples: z.array(z.string()),
    knownDimensions: z.array(z.string()).optional().describe("Returned only when parameter is unknown — lists all documented dimensions."),
};

export function registerDescribeTools(server: McpServer): void {
    server.registerTool(
        "rybbit_describe_dimension",
        {
            title: "Describe Filter Dimension",
            annotations: {
                readOnlyHint: true,
                idempotentHint: true,
                openWorldHint: false,
                destructiveHint: false,
            },
            description:
                "Look up which tools accept a given filter dimension (e.g. 'event_name', 'pathname', 'country'), " +
                "where it works natively, where it is silently stripped due to upstream bugs (with alternative tool suggestions), " +
                "and example values. Use this before constructing a complex filters[] array.",
            inputSchema: {
                parameter: z
                    .string()
                    .describe("Dimension name to describe (e.g. 'event_name', 'user_id', 'pathname'). Case-sensitive."),
            },
            outputSchema: describeOutput,
            _meta: {
                "openai/toolInvocation/invoking": "Looking up dimension…",
                "openai/toolInvocation/invoked": "Capability returned",
            },
        },
        async (args) => {
            const dim = DIMENSIONS[args.parameter];
            if (!dim) {
                const result = {
                    parameter: args.parameter,
                    description: "Unknown dimension. May still work as a filter but capabilities are undocumented here.",
                    supportedIn: [],
                    strippedIn: [],
                    valueHint: "Unknown.",
                    examples: [],
                    knownDimensions: Object.keys(DIMENSIONS),
                };
                return {
                    structuredContent: result as unknown as Record<string, unknown>,
                    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
                };
            }
            return {
                structuredContent: dim as unknown as Record<string, unknown>,
                content: [{ type: "text" as const, text: JSON.stringify(dim, null, 2) }],
            };
        }
    );
}
