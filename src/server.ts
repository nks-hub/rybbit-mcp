/**
 * Rybbit Analytics MCP server — library entry point.
 *
 * Exports `createRybbitServer(config)` so consumers (mcp-gateway, tests) can
 * construct a fully-wired McpServer instance and attach their own transport.
 *
 * Transport selection lives in `index.ts` (CLI).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthConfig } from "./auth.js";
import { RybbitClient } from "./client.js";
import { registerConfigTools } from "./tools/config.js";
import { registerOverviewTools } from "./tools/overview.js";
import { registerMetricsTools } from "./tools/metrics.js";
import { registerSessionsTools } from "./tools/sessions.js";
import { registerUsersTools } from "./tools/users.js";
import { registerEventsTools } from "./tools/events.js";
import { registerErrorsTools } from "./tools/errors.js";
import { registerPerformanceTools } from "./tools/performance.js";
import { registerFunnelsTools } from "./tools/funnels.js";
import { registerGoalsTools } from "./tools/goals.js";
import { registerJourneysTools } from "./tools/journeys.js";
import { registerDescribeTools } from "./tools/describe.js";

export const RYBBIT_SERVER_NAME = "rybbit-mcp";
export const RYBBIT_SERVER_VERSION = "0.7.3";

export const RYBBIT_INSTRUCTIONS =
  "Rybbit Analytics MCP server. Start with rybbit_list_sites to discover available sites and their IDs. " +
  "Most tools accept date ranges (startDate/endDate in YYYY-MM-DD) or relative time (pastMinutesStart/pastMinutesEnd). " +
  "Use filters array to narrow results by dimension (browser, country, pathname, etc.). " +
  "For large datasets, use page/limit pagination. " +
  "Workflow: list_sites → get_overview → drill into metrics/sessions/users/events/errors as needed.";

export function createRybbitServer(config: AuthConfig): McpServer {
  const client = new RybbitClient(config);

  const server = new McpServer(
    { name: RYBBIT_SERVER_NAME, version: RYBBIT_SERVER_VERSION },
    { instructions: RYBBIT_INSTRUCTIONS }
  );

  registerConfigTools(server, client);
  registerOverviewTools(server, client);
  registerMetricsTools(server, client);
  registerSessionsTools(server, client);
  registerUsersTools(server, client);
  registerEventsTools(server, client);
  registerErrorsTools(server, client);
  registerPerformanceTools(server, client);
  registerFunnelsTools(server, client);
  registerGoalsTools(server, client);
  registerJourneysTools(server, client);
  registerDescribeTools(server);

  return server;
}

export type { AuthConfig } from "./auth.js";
export { getAuthConfig } from "./auth.js";
export { RybbitClient } from "./client.js";
