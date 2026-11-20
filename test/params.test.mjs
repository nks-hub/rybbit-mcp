import assert from "node:assert/strict";
import { test } from "node:test";
import { backend } from "./fixtures.mjs";
import { connect } from "./helpers.mjs";

test("time-series tools ask for daily buckets unless told otherwise", async () => {
  const mcp = await connect(backend);
  try {
    await mcp.call("rybbit_get_overview_timeseries", { siteId: 1 });
    await mcp.call("rybbit_get_event_timeseries", { siteId: 1 });
    await mcp.call("rybbit_get_performance_timeseries", { siteId: 1 });
    await mcp.call("rybbit_get_errors", { siteId: 1, type: "timeseries", errorMessage: "Failed to fetch" });
    assert.deepEqual(mcp.requests.map((r) => r.query.bucket), ["day", "day", "day", "day"]);

    await mcp.call("rybbit_get_overview_timeseries", { siteId: 1, bucket: "hour" });
    assert.equal(mcp.requests.at(-1).query.bucket, "hour");
  } finally {
    await mcp.close();
  }
});
