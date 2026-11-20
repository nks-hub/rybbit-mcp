import assert from "node:assert/strict";
import { test } from "node:test";
import { backend } from "./fixtures.mjs";
import { connect } from "./helpers.mjs";

const apiError = (status, error) => () => ({ status, body: { error, message: error, code: "X" } });

test("a 404 reports what the server could not find", async () => {
  const mcp = await connect(apiError(404, "Goal not found"));
  try {
    const res = await mcp.call("rybbit_get_goal_sessions", { siteId: 1, goalId: "999" });
    assert.equal(res.isError, true);
    assert.match(res.text, /Not found \(404\)\. Server said: Goal not found\./);
    assert.doesNotMatch(res.text, /sessionId|userId/);
  } finally {
    await mcp.close();
  }
});

test("a 401 on create_site points at the organization ID as well as the credentials", async () => {
  const mcp = await connect(apiError(401, "Unauthorized"));
  try {
    const res = await mcp.call("rybbit_create_site", { domain: "example.org", organizationId: "no-such-org" });
    assert.equal(res.isError, true);
    assert.match(res.text, /organizationId/);
    assert.match(res.text, /RYBBIT_API_KEY/);
  } finally {
    await mcp.close();
  }
});

test("a 400 passes the server's message on without the JSON wrapper", async () => {
  const mcp = await connect(apiError(400, "Invalid time_zone"));
  try {
    const res = await mcp.call("rybbit_get_overview", { siteId: 1, timeZone: "Mars/Olympus" });
    assert.equal(res.text, "Error: API error (400). Server said: Invalid time_zone.");
  } finally {
    await mcp.close();
  }
});

test("get_user_traits refuses a lookup with missing arguments instead of listing keys", async () => {
  const mcp = await connect(backend);
  try {
    const values = await mcp.call("rybbit_get_user_traits", { siteId: 1, mode: "values" });
    assert.equal(values.isError, true);
    assert.match(values.text, /mode='values' needs `key`/);

    const users = await mcp.call("rybbit_get_user_traits", { siteId: 1, mode: "users", key: "plan" });
    assert.equal(users.isError, true);
    assert.match(users.text, /mode='users' needs both `key` and `value`/);

    assert.equal(mcp.requests.length, 0);
  } finally {
    await mcp.close();
  }
});

test("create_site returns the numeric site ID and the string alias", async () => {
  const mcp = await connect(backend);
  try {
    const res = await mcp.call("rybbit_create_site", { domain: "example.org", organizationId: "org1" });
    assert.equal(res.structuredContent.siteId, "2");
    assert.equal(res.structuredContent.stringId, "0a1b2c3d4e5f");
  } finally {
    await mcp.close();
  }
});
