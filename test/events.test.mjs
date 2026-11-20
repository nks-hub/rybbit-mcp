import assert from "node:assert/strict";
import { test } from "node:test";
import { connect } from "./helpers.mjs";

/**
 * Fake /events endpoint: `total` events, newest first, paged by page_size and
 * the before_cursor keyset. Parameters it does not know are ignored, as on the
 * real server.
 */
function eventsBackend(total, { ignoreCursor = false, identified = false } = {}) {
  const all = Array.from({ length: total }, (_, i) => ({
    timestamp: `2026-01-05 10:${String(59 - Math.floor(i / 60) % 60).padStart(2, "0")}:00`,
    event_name: "signup",
    event_cursor: `c${i}`,
    session_id: `s${i % 50}`,
    user_id: `device${i % 7}`,
    identified_user_id: identified ? `user${i % 4}` : "",
    pathname: `/page${i % 3}`,
    properties: '{"plan":"free"}',
  }));
  return ({ query }) => {
    const size = Number(query.page_size ?? 50);
    const start = !ignoreCursor && query.before_cursor ? Number(query.before_cursor.slice(1)) + 1 : 0;
    const data = all.slice(start, start + size);
    return {
      data,
      cursor: {
        hasMore: start + size < total,
        oldestTimestamp: data.at(-1)?.timestamp ?? null,
        oldestCursor: data.at(-1)?.event_cursor ?? null,
      },
    };
  };
}

const sum = (groups) => groups.reduce((n, g) => n + g.count, 0);

test("event aggregate walks the keyset cursor in pages of 1000 and counts each event once", async () => {
  const mcp = await connect(eventsBackend(2500));
  try {
    const res = await mcp.call("rybbit_get_event_aggregate", { siteId: 1, eventName: "signup", groupBy: ["pathname"] });
    const out = res.structuredContent;
    assert.equal(out.scanned, 2500);
    assert.equal(out.hitCount, 2500);
    assert.equal(out.hasMore, false);
    assert.equal(sum(out.groups), 2500);
    assert.equal(out.groups.reduce((n, g) => n + g.sessions, 0), 150);

    assert.equal(mcp.requests.length, 3);
    assert.deepEqual(mcp.requests.map((r) => r.query.page_size), ["1000", "1000", "1000"]);
    assert.deepEqual(mcp.requests.map((r) => r.query.before_cursor), [undefined, "c999", "c1999"]);
    assert.deepEqual(JSON.parse(mcp.requests[0].query.filters), [
      { parameter: "event_name", type: "equals", value: ["signup"] },
    ]);
  } finally {
    await mcp.close();
  }
});

test("event aggregate stops at maxScan and reports hasMore", async () => {
  const mcp = await connect(eventsBackend(2500));
  try {
    const res = await mcp.call("rybbit_get_event_aggregate", { siteId: 1, groupBy: ["pathname"], maxScan: 1500 });
    assert.equal(res.structuredContent.scanned, 1500);
    assert.equal(res.structuredContent.hasMore, true);
    assert.equal(mcp.requests.length, 2);
  } finally {
    await mcp.close();
  }
});

test("a server that ignores the cursor does not get its first page counted twice", async () => {
  const mcp = await connect(eventsBackend(2500, { ignoreCursor: true }));
  try {
    const res = await mcp.call("rybbit_get_event_aggregate", { siteId: 1, groupBy: ["pathname"] });
    assert.equal(res.structuredContent.scanned, 1000);
    assert.equal(sum(res.structuredContent.groups), 1000);
    assert.equal(res.structuredContent.hasMore, true);
  } finally {
    await mcp.close();
  }
});

test("leaderboard says when anonymous events were left out", async () => {
  const mcp = await connect(eventsBackend(120));
  try {
    const byDefault = await mcp.call("rybbit_get_event_user_leaderboard", { siteId: 1, eventName: "signup" });
    assert.deepEqual(byDefault.structuredContent.groups, []);
    assert.match(byDefault.structuredContent.note, /^120 matching events .* identifiedOnly=false/);

    const all = await mcp.call("rybbit_get_event_user_leaderboard", { siteId: 1, eventName: "signup", identifiedOnly: false });
    assert.equal(all.structuredContent.groups.length, 7);
    assert.equal(sum(all.structuredContent.groups), 120);
    assert.equal(all.structuredContent.note, undefined);
  } finally {
    await mcp.close();
  }
});

test("leaderboard ranks identified users without a note", async () => {
  const mcp = await connect(eventsBackend(120, { identified: true }));
  try {
    const res = await mcp.call("rybbit_get_event_user_leaderboard", { siteId: 1, eventName: "signup" });
    assert.equal(res.structuredContent.groups.length, 4);
    assert.equal(res.structuredContent.note, undefined);
  } finally {
    await mcp.close();
  }
});

test("list_events maps cursors and the event name to backend parameters", async () => {
  const mcp = await connect(eventsBackend(30));
  try {
    const page = await mcp.call("rybbit_list_events", { siteId: 1, limit: 10, eventName: "signup", beforeCursor: "c4" });
    assert.equal(mcp.requests[0].query.before_cursor, "c4");
    assert.equal(mcp.requests[0].query.page_size, "10");
    assert.equal(JSON.parse(mcp.requests[0].query.filters)[0].parameter, "event_name");
    assert.equal(page.structuredContent.data[0].event_cursor, "c5");
    assert.equal(page.structuredContent.cursor.oldestCursor, "c14");
    assert.deepEqual(page.structuredContent.data[0].properties_parsed, { plan: "free" });

    await mcp.call("rybbit_list_events", { siteId: 1, beforeTimestamp: "2026-01-05 10:00:00" });
    assert.equal(mcp.requests[1].query.before_timestamp, "2026-01-05 10:00:00");
  } finally {
    await mcp.close();
  }
});

test("list_events afterTimestamp uses since_timestamp and still honors limit", async () => {
  const newest = Array.from({ length: 500 }, (_, i) => ({ timestamp: "2026-01-05 10:00:00", event_name: "signup", event_cursor: `c${i}` }));
  const mcp = await connect(() => ({ data: newest }));
  try {
    const res = await mcp.call("rybbit_list_events", { siteId: 1, limit: 5, afterTimestamp: "2026-01-05 09:00:00" });
    assert.equal(mcp.requests[0].query.since_timestamp, "2026-01-05 09:00:00");
    assert.equal(res.structuredContent.data.length, 5);
  } finally {
    await mcp.close();
  }
});
