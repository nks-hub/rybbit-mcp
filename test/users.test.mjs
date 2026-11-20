import assert from "node:assert/strict";
import { test } from "node:test";
import { connect } from "./helpers.mjs";

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
