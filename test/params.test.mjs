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

test("pastMinutesStart alone means until now", async () => {
  const mcp = await connect(backend);
  try {
    await mcp.call("rybbit_get_overview", { siteId: 1, pastMinutesStart: 60 });
    assert.equal(mcp.requests[0].query.past_minutes_start, "60");
    assert.equal(mcp.requests[0].query.past_minutes_end, "0");

    await mcp.call("rybbit_get_overview", { siteId: 1, pastMinutesStart: 120, pastMinutesEnd: 60 });
    assert.equal(mcp.requests[1].query.past_minutes_end, "60");
  } finally {
    await mcp.close();
  }
});

test("a date range that ends before it starts is rejected without calling the server", async () => {
  const mcp = await connect(backend);
  try {
    const res = await mcp.call("rybbit_get_overview", { siteId: 1, startDate: "2026-01-20", endDate: "2026-01-01" });
    assert.equal(res.isError, true);
    assert.match(res.text, /endDate \(2026-01-01\) is before startDate \(2026-01-20\)/);
    assert.equal(mcp.requests.length, 0);

    const sameDay = await mcp.call("rybbit_get_overview", { siteId: 1, startDate: "2026-01-20", endDate: "2026-01-20" });
    assert.equal(sameDay.isError, undefined);
  } finally {
    await mcp.close();
  }
});
