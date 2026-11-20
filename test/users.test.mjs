import assert from "node:assert/strict";
import { test } from "node:test";
import { connect } from "./helpers.mjs";

test("list_users sorted by duration pages the aggregated users", async () => {
  const sessions = Array.from({ length: 5 }, (_, i) => ({ user_id: `device${i}`, identified_user_id: `user${i}`, session_duration: (i + 1) * 60 }));
  const mcp = await connect(() => ({ data: sessions }));
  try {
    const page = async (n) => (await mcp.call("rybbit_list_users", { siteId: 1, sortBy: "duration", limit: 2, page: n })).structuredContent;
    const first = await page(1);
    assert.deepEqual(first.data.map((u) => u.identified_user_id), ["user4", "user3"]);
    assert.equal(first.totalCount, 5);

    const second = await page(2);
    assert.deepEqual(second.data.map((u) => u.identified_user_id), ["user2", "user1"]);
    assert.equal(second.totalCount, 5);
  } finally {
    await mcp.close();
  }
});

test("get_user_session_count sends the user as user_id", async () => {
  const mcp = await connect(() => ({ data: [{ date: "2026-01-05", sessions: 3 }] }));
  try {
    const res = await mcp.call("rybbit_get_user_session_count", { siteId: 1, userId: "abc123" });
    assert.equal(res.isError, undefined);
    assert.equal(mcp.requests[0].path, "/sites/1/users/session-count");
    assert.equal(mcp.requests[0].query.user_id, "abc123");
    assert.equal(mcp.requests[0].query.userId, undefined);
    assert.deepEqual(res.structuredContent.data, [{ date: "2026-01-05", sessions: 3 }]);
  } finally {
    await mcp.close();
  }
});
