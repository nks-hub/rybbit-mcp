import assert from "node:assert/strict";
import { test } from "node:test";
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
