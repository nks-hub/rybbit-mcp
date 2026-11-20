/**
 * Canned Rybbit API responses in the shapes the 2.9 server returns, including
 * the awkward ones: nulls for empty ranges, rows nested under data.data,
 * snake_case next to camelCase.
 */

const session = {
  session_id: "s1",
  user_id: "device1",
  identified_user_id: "",
  country: "CZ",
  region: "CZ-10",
  city: "Prague",
  language: "cs",
  device_type: "Desktop",
  browser: "Firefox",
  browser_version: 140,
  operating_system: "Linux",
  operating_system_version: 0,
  referrer: "",
  channel: "Direct",
  hostname: "example.com",
  utm_source: "",
  session_start: "2026-01-05 10:00:00",
  session_end: "2026-01-05 10:05:00",
  session_duration: 300,
  entry_page: "/",
  exit_page: "/pricing",
  pageviews: 2,
  events: 1,
  ip: "192.0.2.10",
  lat: 50.08,
  lon: 14.42,
  traits: null,
};

const vitals = Object.fromEntries(
  ["lcp", "cls", "inp", "fcp", "ttfb"].flatMap((v) => [
    ...["p50", "p75", "p90", "p99"].map((p) => [`${v}_${p}`, null]),
    ...["count", "good", "poor"].map((k) => [`${v}_${k}`, 0]),
  ])
);

const routes = [
  ["GET", /^\/version$/, { version: "2.9.1" }],
  ["GET", /^\/config$/, { disableSignup: true }],
  [
    "GET",
    /^\/organizations$/,
    [
      {
        id: "org1",
        name: "Demo Org",
        slug: "demo",
        logo: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        role: "owner",
        members: [],
        sites: [
          {
            id: "1",
            domain: "example.com",
            name: "Example",
            organizationId: "org1",
            createdBy: "user1",
            public: false,
            saltUserIds: false,
            blockBots: true,
            createdAt: "2026-01-01 00:00:00",
          },
        ],
      },
    ],
  ],
  [
    "POST",
    /^\/organizations\/org1\/sites$/,
    { id: "0a1b2c3d4e5f", siteId: 2, domain: "example.org", name: "Example Org", organizationId: "org1", type: "web" },
  ],
  ["PUT", /^\/sites\/1\/config$/, { success: true, message: "Site configuration updated successfully", config: { id: "0a1b2c3d4e5f", siteId: 1, public: true } }],
  ["DELETE", /^\/sites\/1$/, { success: true }],
  ["GET", /^\/sites\/1\/has-data$/, { hasData: true }],
  ["GET", /^\/sites\/1\/live-user-count$/, { count: 3 }],
  [
    "GET",
    /^\/sites\/1\/overview$/,
    { data: { sessions: 0, pages_per_session: null, bounce_rate: null, session_duration: null, pageviews: 0, users: 0 } },
  ],
  [
    "GET",
    /^\/sites\/1\/overview\/time-series$/,
    { data: [{ time: "2026-01-05 00:00:00", sessions: 4, pages_per_session: 1.5, bounce_rate: 50, session_duration: 30, pageviews: 6, users: 4 }] },
  ],
  ["GET", /^\/sites\/1\/sessions\/locations$/, { data: [{ lat: 50.08, lon: 14.42, city: "Prague", country: "CZ", count: 4 }] }],
  [
    "GET",
    /^\/sites\/1\/metric$/,
    {
      data: {
        data: [{ value: "/", hostname: "example.com", count: 4, percentage: 100, pageviews: 6, pageviews_percentage: 100, time_on_page_seconds: 12.5, bounce_rate: 50 }],
        totalCount: 1,
      },
    },
  ],
  [
    "GET",
    /^\/sites\/1\/retention$/,
    { data: { cohorts: { "2026-01-05": { size: 3, counts: [3, 1], percentages: [100, null] } }, maxPeriods: 2, mode: "week", range: 90 } },
  ],
  ["GET", /^\/sites\/1\/sessions$/, { data: [session] }],
  [
    "GET",
    /^\/sites\/1\/sessions\/s1$/,
    {
      data: {
        session,
        events: [
          { timestamp: "2026-01-05 10:00:00.000", pathname: "/", hostname: "example.com", querystring: "", page_title: "Home", referrer: "", type: "pageview", event_name: "", props: {}, goals: [] },
        ],
        pagination: { total: 1, limit: 100, offset: 0, hasMore: false },
      },
    },
  ],
  [
    "GET",
    /^\/sites\/1\/users$/,
    { data: [{ effective_user_id: "device1", user_id: "device1", identified_user_id: "", sessions: 1, last_seen: "2026-01-05 10:05:00", traits: null }], totalCount: 1, page: 1, pageSize: 100, searchLimited: false },
  ],
  ["GET", /^\/sites\/1\/users\/session-count$/, { data: [{ date: "2026-01-05", sessions: 1 }] }],
  ["GET", /^\/sites\/1\/users\/device1$/, { data: { user_id: "device1", sessions: 1, duration: 300, vitals: null, linked_devices: [], traits: null } }],
  ["GET", /^\/sites\/1\/user-traits\/keys$/, { keys: [{ key: "plan", userCount: 2 }] }],
  ["GET", /^\/sites\/1\/user-traits\/values$/, { values: [{ value: "pro", userCount: 2 }], total: 1, hasMore: false }],
  ["GET", /^\/sites\/1\/user-traits\/users$/, { users: [{ user_id: "device1", identified_user_id: "user1", traits: { plan: "pro" }, sessions: 1 }], total: 1, hasMore: false }],
  [
    "GET",
    /^\/sites\/1\/events$/,
    {
      data: [{ timestamp: "2026-01-05 10:01:00", event_name: "signup", type: "custom_event", properties: '{"plan":"free"}', session_id: "s1", user_id: "device1", identified_user_id: "", pathname: "/pricing", event_cursor: "c1", traits: null }],
      cursor: { hasMore: false, oldestTimestamp: "2026-01-05 10:01:00", oldestCursor: "c1", newestCursor: "c1" },
    },
  ],
  ["GET", /^\/sites\/1\/events\/names$/, { data: [{ eventName: "signup", count: 2 }] }],
  ["GET", /^\/sites\/1\/events\/properties$/, { data: [{ propertyKey: "plan", propertyValue: "free", count: 2 }] }],
  ["GET", /^\/sites\/1\/events\/time-series$/, { data: [{ time: "2026-01-05 00:00:00", event_name: "signup", event_count: 2 }] }],
  ["GET", /^\/sites\/1\/events\/outbound$/, { data: [{ url: "https://example.org/", count: 2, lastClicked: "2026-01-05 10:02:00" }] }],
  [
    "GET",
    /^\/sites\/1\/page-titles$/,
    { data: { data: [{ value: "Home", pathname: "/", count: 4, percentage: 100, pageviews: 6, bounce_rate: 50, time_on_page_seconds: 12.5 }], totalCount: 1 } },
  ],
  ["GET", /^\/sites\/1\/errors\/names$/, { data: { data: [{ value: "Failed to fetch", errorName: "TypeError", count: 2, sessionCount: 1, percentage: 100 }], totalCount: 1 } }],
  [
    "GET",
    /^\/sites\/1\/errors\/events$/,
    { data: [{ timestamp: "2026-01-05 10:03:00", session_id: "s1", message: "Failed to fetch", stack: "TypeError: Failed to fetch", fileName: "", lineNumber: null, columnNumber: null }] },
  ],
  ["GET", /^\/sites\/1\/errors\/time-series$/, { success: true, data: [{ time: "2026-01-05 00:00:00", error_count: 2 }] }],
  ["GET", /^\/sites\/1\/performance\/overview$/, { data: { ...vitals, total_performance_events: 0 } }],
  ["GET", /^\/sites\/1\/performance\/by-dimension$/, { data: { data: [{ pathname: "/", lcp_p75: 1800, event_count: 12 }], totalCount: 1 } }],
  ["GET", /^\/sites\/1\/performance\/time-series$/, { data: [{ time: "2026-01-05 00:00:00", lcp_p50: null, event_count: 0 }] }],
  [
    "GET",
    /^\/sites\/1\/funnels$/,
    { data: [{ id: 7, name: "Signup", steps: [{ name: "Home", type: "page", value: "/" }, { name: "Signup", type: "event", value: "signup" }], configuration: {}, createdAt: "2026-01-01 00:00:00", updatedAt: "2026-01-01 00:00:00" }] },
  ],
  ["POST", /^\/sites\/1\/funnels$/, { success: true, funnelId: 7 }],
  ["DELETE", /^\/sites\/1\/funnels\/7$/, { success: true }],
  [
    "POST",
    /^\/sites\/1\/funnels\/analyze$/,
    { data: [{ step_number: 1, step_name: "/", sessions: 0, conversion_rate: null, dropoff_rate: 0, visitors: 0 }] },
  ],
  ["POST", /^\/sites\/1\/funnels\/1\/sessions$/, { data: [session] }],
  [
    "GET",
    /^\/sites\/1\/goals$/,
    {
      data: [{ goalId: 3, siteId: 1, name: "Pricing", goalType: "path", config: { pathPattern: "/pricing" }, createdAt: "2026-01-01 00:00:00", total_conversions: 1, total_sessions: 4, conversion_rate: 0.25 }],
      meta: { total: 1, page: 1, pageSize: 10, totalPages: 1 },
    },
  ],
  ["POST", /^\/sites\/1\/goals$/, { success: true, goalId: 3 }],
  ["PUT", /^\/sites\/1\/goals\/3$/, { success: true, goalId: 3 }],
  ["DELETE", /^\/sites\/1\/goals\/3$/, { success: true }],
  ["GET", /^\/sites\/1\/goals\/3\/sessions$/, { data: [session] }],
  ["GET", /^\/sites\/1\/journeys$/, { journeys: [{ path: ["/", "/pricing"], count: 3, percentage: 50 }], totalSessions: 6 }],
];

/** Backend for test/helpers.mjs `connect`: answers from the route table, 404 otherwise. */
export function backend({ method, path }) {
  const hit = routes.find(([m, re]) => m === method && re.test(path));
  if (hit) return structuredClone(hit[2]);
  return { status: 404, body: { error: `No fixture for ${method} ${path}`, code: "NOT_FOUND" } };
}
