import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createRybbitServer } from "../build/server.js";

/**
 * Connects an SDK client to a Rybbit MCP server whose backend is the given
 * handler. The SDK client validates every structuredContent against the tool's
 * outputSchema, so a schema mismatch makes callTool reject.
 *
 * `backend(request)` receives { method, path, query, body } (path without the
 * /api prefix) and returns the JSON body, or { status, body } for an error.
 */
export async function connect(backend) {
  const requests = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const request = {
      method: init.method ?? "GET",
      path: u.pathname.replace(/^\/api/, ""),
      query: Object.fromEntries(u.searchParams),
      body: init.body ? JSON.parse(init.body) : undefined,
    };
    requests.push(request);
    const answer = await backend(request);
    const isError = answer && typeof answer === "object" && "status" in answer && "body" in answer;
    return new Response(JSON.stringify(isError ? answer.body : answer), {
      status: isError ? answer.status : 200,
      headers: { "content-type": "application/json" },
    });
  };

  const server = createRybbitServer({ baseUrl: "https://analytics.example.com", apiKey: "test-key" });
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(clientSide);
  await client.listTools();

  return {
    requests,
    async call(name, args = {}) {
      const result = await client.callTool({ name, arguments: args });
      return { ...result, text: result.content?.[0]?.text ?? "" };
    },
    async close() {
      await client.close();
      globalThis.fetch = realFetch;
    },
  };
}
