#!/usr/bin/env node
/**
 * Rybbit Analytics MCP — CLI entrypoint.
 *
 * Transports:
 *   stdio (default) — for local Claude Desktop / Claude Code use
 *   http            — Streamable HTTP for remote hosting (gateway / ChatGPT)
 *
 * Environment:
 *   RYBBIT_URL              required
 *   RYBBIT_API_KEY          Bearer token (alternative to email+password)
 *   RYBBIT_EMAIL, RYBBIT_PASSWORD  better-auth session login
 *   MCP_TRANSPORT           stdio | http   (default: stdio)
 *   MCP_HTTP_PORT           default: 3000
 *   MCP_HTTP_HOST           default: 0.0.0.0
 *   MCP_HTTP_PATH           default: /mcp
 *   MCP_STATELESS           1 to disable session IDs
 */

import { randomUUID } from "node:crypto";
import { createServer as createHttpServer, IncomingMessage, ServerResponse } from "node:http";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createRybbitServer, RYBBIT_SERVER_NAME } from "./server.js";
import { getAuthConfig } from "./auth.js";

async function runStdio(server: McpServer): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${RYBBIT_SERVER_NAME} running on stdio`);
}

async function runHttp(server: McpServer): Promise<void> {
  const port = Number(process.env.MCP_HTTP_PORT ?? 3000);
  const host = process.env.MCP_HTTP_HOST ?? "0.0.0.0";
  const path = process.env.MCP_HTTP_PATH ?? "/mcp";
  const stateless = process.env.MCP_STATELESS === "1";

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: stateless ? undefined : () => randomUUID(),
  });
  await server.connect(transport);

  const httpServer = createHttpServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.url === "/healthz" || req.url === "/") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, server: RYBBIT_SERVER_NAME, path }));
      return;
    }
    if (!req.url || !req.url.startsWith(path)) {
      res.writeHead(404).end();
      return;
    }
    transport.handleRequest(req, res).catch((err) => {
      console.error("HTTP transport error:", err);
      if (!res.headersSent) res.writeHead(500).end();
    });
  });

  httpServer.listen(port, host, () => {
    console.error(`${RYBBIT_SERVER_NAME} running on http://${host}:${port}${path}`);
  });
}

async function main(): Promise<void> {
  const config = getAuthConfig();
  const server = createRybbitServer(config);

  const transport = (process.env.MCP_TRANSPORT ?? "stdio").toLowerCase();
  switch (transport) {
    case "stdio":
      await runStdio(server);
      break;
    case "http":
      await runHttp(server);
      break;
    default:
      console.error(`Unknown MCP_TRANSPORT='${transport}', expected stdio|http`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
