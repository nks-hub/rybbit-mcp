#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getAuthConfig } from "./auth.js";
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

async function main() {
  const config = getAuthConfig();
  const client = new RybbitClient(config);

  const server = new McpServer({
    name: "rybbit-mcp",
    version: "0.1.0",
  });

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

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Rybbit MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
