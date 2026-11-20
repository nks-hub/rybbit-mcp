import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { backend } from "./fixtures.mjs";
import { connect } from "./helpers.mjs";

const steps = [
  { value: "/", type: "page" },
  { value: "signup", type: "event" },
];

// Every tool, called the way a client would. The SDK client rejects a call whose
// structuredContent does not match the published outputSchema.
const calls = [
  ["rybbit_get_config", {}],
  ["rybbit_list_sites", {}],
  ["rybbit_create_site", { domain: "example.org", organizationId: "org1" }],
  ["rybbit_get_site_id", { domain: "example.com" }],
  ["rybbit_get_site_id", { domain: "no-such-site.invalid" }],
  ["rybbit_update_site_config", { siteId: 1, public: true }],
  ["rybbit_update_site_config", { siteId: 1 }],
  ["rybbit_delete_site", { siteId: 1 }],
  ["rybbit_site_has_data", { siteId: 1 }],
  ["rybbit_get_page_titles", { siteId: 1 }],
  ["rybbit_live_users", { siteId: 1 }],
  ["rybbit_get_overview", { siteId: 1 }],
  ["rybbit_get_overview_timeseries", { siteId: 1 }],
  ["rybbit_get_session_locations", { siteId: 1 }],
  ["rybbit_get_metric", { siteId: 1, parameter: "pathname" }],
  ["rybbit_get_retention", { siteId: 1 }],
  ["rybbit_list_sessions", { siteId: 1 }],
  ["rybbit_list_sessions", { siteId: 1, ip: "192.0.2" }],
  ["rybbit_get_session", { siteId: 1, sessionId: "s1" }],
  ["rybbit_list_users", { siteId: 1 }],
  ["rybbit_list_users", { siteId: 1, sortBy: "duration" }],
  ["rybbit_get_user", { siteId: 1, userId: "device1" }],
  ["rybbit_get_user_traits", { siteId: 1 }],
  ["rybbit_get_user_traits", { siteId: 1, key: "plan" }],
  ["rybbit_get_user_traits", { siteId: 1, mode: "users", key: "plan", value: "PRO" }],
  ["rybbit_get_user_event_breakdown", { siteId: 1, userId: "device1" }],
  ["rybbit_get_user_session_count", { siteId: 1, userId: "device1" }],
  ["rybbit_list_events", { siteId: 1 }],
  ["rybbit_get_event_aggregate", { siteId: 1, groupBy: ["pathname", "properties.plan"] }],
  ["rybbit_get_event_user_leaderboard", { siteId: 1, eventName: "signup" }],
  ["rybbit_get_event_names", { siteId: 1 }],
  ["rybbit_get_event_properties", { siteId: 1, eventName: "signup" }],
  ["rybbit_get_event_timeseries", { siteId: 1 }],
  ["rybbit_get_outbound_links", { siteId: 1 }],
  ["rybbit_get_errors", { siteId: 1 }],
  ["rybbit_get_errors", { siteId: 1, type: "events", errorMessage: "Failed to fetch" }],
  ["rybbit_get_errors", { siteId: 1, type: "timeseries", errorMessage: "Failed to fetch" }],
  ["rybbit_get_performance", { siteId: 1 }],
  ["rybbit_get_performance", { siteId: 1, dimension: "pathname" }],
  ["rybbit_get_performance_timeseries", { siteId: 1 }],
  ["rybbit_list_funnels", { siteId: 1 }],
  ["rybbit_analyze_funnel", { siteId: 1, steps }],
  ["rybbit_get_funnel_step_sessions", { siteId: 1, steps, stepNumber: 1, mode: "reached" }],
  ["rybbit_create_funnel", { siteId: 1, name: "Signup", steps }],
  ["rybbit_delete_funnel", { siteId: 1, funnelId: 7 }],
  ["rybbit_list_goals", { siteId: 1 }],
  ["rybbit_get_goal_sessions", { siteId: 1, goalId: "3" }],
  ["rybbit_create_goal", { siteId: 1, goalType: "path", config: { pathPattern: "/pricing" } }],
  ["rybbit_update_goal", { siteId: 1, goalId: 3, goalType: "path", config: { pathPattern: "/pricing" } }],
  ["rybbit_delete_goal", { siteId: 1, goalId: 3 }],
  ["rybbit_get_journeys", { siteId: 1 }],
  ["rybbit_describe_dimension", { parameter: "event_name" }],
  ["rybbit_describe_dimension", { parameter: "not_a_dimension" }],
];

let mcp;
before(async () => {
  mcp = await connect(backend);
});
after(() => mcp.close());

for (const [name, args] of calls) {
  test(`${name} ${JSON.stringify(args)} matches its output schema`, async () => {
    const res = await mcp.call(name, args);
    assert.equal(res.isError, undefined, res.text);
    assert.deepEqual(JSON.parse(res.text), res.structuredContent);
  });
}

test("the call list covers every registered tool", async () => {
  const { tools } = await mcp.listTools();
  const missing = tools.map((t) => t.name).filter((n) => !calls.some(([name]) => name === n));
  assert.deepEqual(missing, []);
});

test("get_overview returns the metrics at the top level, nulls included", async () => {
  const res = await mcp.call("rybbit_get_overview", { siteId: 1 });
  assert.deepEqual(res.structuredContent, {
    sessions: 0,
    pages_per_session: null,
    bounce_rate: null,
    session_duration: null,
    pageviews: 0,
    users: 0,
  });
});

test("get_session returns session, events and pagination at the top level", async () => {
  const res = await mcp.call("rybbit_get_session", { siteId: 1, sessionId: "s1" });
  assert.deepEqual(Object.keys(res.structuredContent).sort(), ["events", "pagination", "session"]);
  assert.equal(res.structuredContent.session.session_id, "s1");
});

test("analyze_funnel returns one row per step under data", async () => {
  const res = await mcp.call("rybbit_analyze_funnel", { siteId: 1, steps });
  assert.equal(res.structuredContent.data[0].step_number, 1);
  assert.equal(res.structuredContent.data[0].conversion_rate, null);
});
