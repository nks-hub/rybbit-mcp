import assert from "node:assert/strict";
import { test } from "node:test";
import { backend } from "./fixtures.mjs";
import { connect } from "./helpers.mjs";

test("list_users sends limit as page_size", async () => {
  const mcp = await connect(() => ({ data: [{ user_id: "u1" }], totalCount: 40, page: 1, pageSize: 5 }));
  try {
    const res = await mcp.call("rybbit_list_users", { siteId: 1, limit: 5 });
    assert.equal(mcp.requests[0].query.page_size, "5");
    assert.equal(mcp.requests[0].query.limit, undefined);
    assert.equal(res.structuredContent.totalCount, 40);
  } finally {
    await mcp.close();
  }
});

test("list_events sends limit as page_size", async () => {
  const mcp = await connect(() => ({ data: [], cursor: { hasMore: false, oldestTimestamp: null } }));
  try {
    await mcp.call("rybbit_list_events", { siteId: 1, limit: 5 });
    assert.equal(mcp.requests[0].query.page_size, "5");
    assert.equal(mcp.requests[0].query.limit, undefined);
  } finally {
    await mcp.close();
  }
});

const locations = Array.from({ length: 300 }, (_, i) => ({ lat: 50, lon: 14, city: `City ${i}`, country: "CZ", count: i }));

test("get_session_locations pages the full backend list in memory", async () => {
  const mcp = await connect(() => ({ data: [...locations] }));
  try {
    const first = await mcp.call("rybbit_get_session_locations", { siteId: 1, limit: 5 });
    assert.equal(first.structuredContent.totalCount, 300);
    assert.deepEqual(first.structuredContent.data.map((r) => r.count), [299, 298, 297, 296, 295]);

    const second = await mcp.call("rybbit_get_session_locations", { siteId: 1, limit: 5, page: 2 });
    assert.deepEqual(second.structuredContent.data.map((r) => r.count), [294, 293, 292, 291, 290]);

    const byDefault = await mcp.call("rybbit_get_session_locations", { siteId: 1 });
    assert.equal(byDefault.structuredContent.data.length, 100);
    assert.equal(mcp.requests[0].query.limit, undefined);
  } finally {
    await mcp.close();
  }
});

test("get_outbound_links pages the full backend list in memory", async () => {
  const links = Array.from({ length: 250 }, (_, i) => ({ url: `https://example.org/${i}`, count: i, lastClicked: "2026-01-05 10:00:00" }));
  const mcp = await connect(() => ({ data: [...links] }));
  try {
    const res = await mcp.call("rybbit_get_outbound_links", { siteId: 1, limit: 3 });
    assert.equal(res.structuredContent.totalCount, 250);
    assert.deepEqual(res.structuredContent.data.map((r) => r.count), [249, 248, 247]);
  } finally {
    await mcp.close();
  }
});

test("list tools send a default page size sized for one response", async () => {
  const mcp = await connect(backend);
  try {
    const query = async (name, args = {}) => {
      await mcp.call(name, { siteId: 1, ...args });
      return mcp.requests.at(-1).query;
    };
    assert.deepEqual(pick(await query("rybbit_list_sessions"), "page", "limit"), { page: "1", limit: "10" });
    assert.deepEqual(pick(await query("rybbit_list_users"), "page", "page_size", "limit"), { page: "1", page_size: "15" });
    assert.deepEqual(pick(await query("rybbit_list_events"), "page", "page_size", "limit"), { page_size: "10" });
    assert.deepEqual(pick(await query("rybbit_get_metric", { parameter: "pathname" }), "page", "limit"), { page: "1", limit: "50" });
    assert.deepEqual(pick(await query("rybbit_get_page_titles"), "page", "limit"), { page: "1", limit: "20" });
    assert.deepEqual(pick(await query("rybbit_get_errors"), "page", "limit", "bucket"), { page: "1", limit: "10" });
    assert.deepEqual(pick(await query("rybbit_get_goal_sessions", { goalId: "3" }), "page", "limit"), { page: "1", limit: "10" });
    assert.deepEqual(pick(await query("rybbit_get_session", { sessionId: "s1" }), "limit", "offset"), { limit: "25", offset: "0" });
    assert.deepEqual(pick(await query("rybbit_get_user_traits", { key: "plan" }), "key", "limit"), { key: "plan", limit: "25" });
  } finally {
    await mcp.close();
  }
});

test("list_goals asks for its own page size and reports the total", async () => {
  const mcp = await connect(backend);
  try {
    const res = await mcp.call("rybbit_list_goals", { siteId: 1 });
    assert.equal(mcp.requests[0].query.page_size, "25");
    assert.equal(res.structuredContent.totalCount, 1);

    await mcp.call("rybbit_list_goals", { siteId: 1, limit: 100, page: 2 });
    assert.equal(mcp.requests[1].query.page_size, "100");
    assert.equal(mcp.requests[1].query.page, "2");

    // Above the server maximum the pages would no longer line up with the limit asked for.
    const tooMany = await mcp
      .call("rybbit_list_goals", { siteId: 1, limit: 101 })
      .catch((err) => ({ isError: true, text: err.message }));
    assert.equal(tooMany.isError, true);
    assert.match(tooMany.text, /limit/);
    assert.equal(mcp.requests.length, 2);
  } finally {
    await mcp.close();
  }
});

test("list_sites keeps site identity and drops bookkeeping fields", async () => {
  const mcp = await connect(backend);
  try {
    const res = await mcp.call("rybbit_list_sites");
    assert.deepEqual(res.structuredContent, {
      data: [
        {
          id: "org1",
          name: "Demo Org",
          role: "owner",
          sites: [{ id: "1", domain: "example.com", name: "Example", public: false, blockBots: true, saltUserIds: false }],
        },
      ],
      totalCount: 1,
    });
  } finally {
    await mcp.close();
  }
});

test("get_event_properties pages the full backend list in memory", async () => {
  const pairs = Array.from({ length: 150 }, (_, i) => ({ propertyKey: "plan", propertyValue: `v${i}`, count: i }));
  const mcp = await connect(() => ({ data: [...pairs] }));
  try {
    const res = await mcp.call("rybbit_get_event_properties", { siteId: 1, eventName: "signup" });
    assert.equal(res.structuredContent.totalCount, 150);
    assert.equal(res.structuredContent.data.length, 100);
    assert.equal(res.structuredContent.data[0].count, 149);
  } finally {
    await mcp.close();
  }
});

function pick(obj, ...keys) {
  return Object.fromEntries(keys.filter((k) => k in obj).map((k) => [k, obj[k]]));
}
