---
name: rybbit-mcp
description: "MCP server for Rybbit Analytics — privacy-first, open-source web analytics platform. Provides 31 tools for querying website traffic, page views, sessions, users, bounce rates, conversions, funnels, goals, custom events, JavaScript errors, Core Web Vitals performance metrics (LCP, CLS, INP, FCP, TTFB), user journeys, retention cohorts, outbound links, session replay, geographic locations, and real-time visitor counts. Use whenever the user mentions web analytics, traffic analysis, visitors, page views, bounce rates, conversions, user tracking, performance metrics, website statistics, error tracking, funnel analysis, goal tracking, user behavior, session recordings, or any website measurement data."
---

# Rybbit Analytics MCP Server

## 1. Purpose & Context

**Rybbit** is a privacy-first, open-source web analytics platform — a self-hosted alternative to Google Analytics. Data is stored in ClickHouse + PostgreSQL. Tracking is done via a JavaScript snippet, TypeScript SDK (`@nks-hub/rybbit-ts`), or Flutter SDK (`rybbit_flutter_sdk`).

This MCP server exposes **31 tools** that let Claude query any Rybbit Analytics instance directly — no dashboard needed. Claude can retrieve traffic overviews, drill into sessions and users, analyze funnels and goals, investigate errors, audit Core Web Vitals performance, track custom events, and manage sites.

**Package**: `@nks-hub/rybbit-mcp` v0.5.2
**Stack**: TypeScript, `@modelcontextprotocol/sdk` v1.27+, Zod, Node.js 18+
**Transport**: StdioServerTransport (local, for Claude Code)

## 2. Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `RYBBIT_URL` | Yes | Base URL of the Rybbit instance (e.g., `https://analytics.example.com`) |
| `RYBBIT_API_KEY` | Recommended | API key for Bearer token authentication |
| `RYBBIT_EMAIL` | Alternative | Email for email/password auth (uses better-auth session cookies) |
| `RYBBIT_PASSWORD` | Alternative | Password for email/password auth |

### Claude Code MCP Config

Add to `~/.claude/settings.json` or project `.claude/settings.json`:

```json
{
  "mcpServers": {
    "rybbit": {
      "command": "npx",
      "args": ["-y", "@nks-hub/rybbit-mcp"],
      "env": {
        "RYBBIT_URL": "https://your-rybbit-instance.com",
        "RYBBIT_API_KEY": "your-api-key"
      }
    }
  }
}
```

Or from a local clone:

```json
{
  "mcpServers": {
    "rybbit": {
      "command": "node",
      "args": ["/path/to/rybbit-mcp/build/index.js"],
      "env": {
        "RYBBIT_URL": "https://analytics.example.com",
        "RYBBIT_API_KEY": "your-api-key"
      }
    }
  }
}
```

## 3. Workflow: Getting Started

1. **Always start** with `rybbit_list_sites` to discover available sites and their IDs.
2. Use `rybbit_get_overview` with a site ID for a quick traffic summary.
3. Drill into specific areas as needed: metrics, sessions, users, events, errors, performance.

**Recommended flow:**
```
rybbit_list_sites → get siteId
rybbit_get_overview(siteId) → high-level stats
rybbit_get_metric(siteId, parameter="pathname") → top pages
rybbit_get_metric(siteId, parameter="referrer") → traffic sources
rybbit_get_errors(siteId, type="names") → error overview
rybbit_get_performance(siteId) → Core Web Vitals
```

## 4. Complete Tool Reference

### 4.1 Configuration & Site Management

#### `rybbit_get_config`
Get Rybbit server version and configuration.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| *(none)* | — | — | No parameters |

**Returns**: `{ version, disableSignup, mapboxToken }`

**Use case**: Check server version and capabilities.

---

#### `rybbit_list_sites`
List all sites and organizations the authenticated user has access to.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| *(none)* | — | — | No parameters |

**Returns**: Array of organizations, each containing `sites[]` with `{ id, domain, name, organizationId }`.

**Use case**: Discover site IDs before querying analytics. This is always the first step.

---

#### `rybbit_create_site`
Create a new site in Rybbit.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `domain` | string | Yes | Domain (e.g., `example.com`) or package name for apps (e.g., `com.example.app`) |
| `name` | string | No | Display name (defaults to domain) |
| `organizationId` | string | Yes | Organization ID (from `rybbit_list_sites`) |
| `type` | `"web"` \| `"app"` | No | Site type. Default: `web`. `app` auto-disables blockBots. |

**Returns**: `{ message, siteId, domain, name, organizationId }`

**Use case**: Register a new website or mobile app for tracking.

---

#### `rybbit_get_site_id`
Look up a site by domain name.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `domain` | string | Yes | Domain to search for (partial match supported) |

**Returns**: `{ siteId, domain, name, organization }` or array if multiple matches.

**Use case**: Find the numeric site ID when you know the domain but not the ID.

---

#### `rybbit_update_site_config`
Update configuration for an existing site.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteId` | string/number | Yes | Site ID |
| `public` | boolean | No | Make stats publicly accessible |
| `saltUserIds` | boolean | No | Salt user IDs for privacy |
| `blockBots` | boolean | No | Block known bots |
| `trackIp` | boolean | No | Track visitor IP addresses |
| `trackErrors` | boolean | No | Track JavaScript errors |
| `trackOutbound` | boolean | No | Track outbound link clicks |
| `trackUrlParams` | boolean | No | Track URL parameters |
| `trackInitialPageView` | boolean | No | Track initial page view automatically |
| `trackSpaNavigation` | boolean | No | Track SPA navigation events |
| `trackButtonClicks` | boolean | No | Track button click events |
| `trackCopy` | boolean | No | Track text copy events |
| `trackFormInteractions` | boolean | No | Track form interaction events |
| `sessionReplay` | boolean | No | Enable session replay recording |
| `webVitals` | boolean | No | Track Core Web Vitals metrics |

**Returns**: `{ success, config }` with updated configuration.

**Use case**: Enable/disable tracking features for a site.

---

#### `rybbit_delete_site`
Permanently delete a site and its replay data.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteId` | string/number | Yes | Site ID to delete |

**Returns**: `{ message, success }`

**Use case**: Remove a site that is no longer needed. **Destructive** — cannot be undone.

---

### 4.2 Real-time & Overview

#### `rybbit_live_users`
Get the current number of active users on a site.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteId` | string/number | Yes | Site ID |

**Returns**: `{ liveUsers: <number> }`

**Use case**: Real-time monitoring — how many people are on the site right now.

---

#### `rybbit_get_overview`
Get aggregated overview metrics for a site.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteId` | string/number | Yes | Site ID |
| `startDate` | string | No | Start date `YYYY-MM-DD` |
| `endDate` | string | No | End date `YYYY-MM-DD` |
| `timeZone` | string | No | IANA timezone (e.g., `Europe/Prague`). Default: UTC |
| `filters` | array | No | Filter array (see Filtering Guide) |
| `pastMinutesStart` | number | No | Minutes ago start (e.g., 60 = last hour) |
| `pastMinutesEnd` | number | No | Minutes ago end (default 0 = now) |

**Returns**: `{ sessions, pageviews, users, pagesPerSession, bounceRate, avgSessionDuration }`

**Use case**: Quick site health check — the first analytics query after getting a site ID.

---

#### `rybbit_get_overview_timeseries`
Get overview metrics as time-series data with configurable time buckets.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteId` | string/number | Yes | Site ID |
| `startDate` | string | No | Start date `YYYY-MM-DD` |
| `endDate` | string | No | End date `YYYY-MM-DD` |
| `timeZone` | string | No | IANA timezone |
| `filters` | array | No | Filter array |
| `pastMinutesStart` | number | No | Minutes ago start |
| `pastMinutesEnd` | number | No | Minutes ago end |
| `bucket` | string | No | Time bucket: `minute`, `five_minutes`, `ten_minutes`, `fifteen_minutes`, `hour`, `day`, `week`, `month`, `year`. Default: `day` |

**Returns**: Array of `{ time, sessions, pageviews, users, ... }` data points.

**Use case**: Plot traffic trends over time. Use `hour` for last 24h, `day` for weekly views, `week`/`month` for long ranges.

---

#### `rybbit_get_session_locations`
Get geographic session location data with coordinates.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteId` | string/number | Yes | Site ID |
| `startDate` | string | No | Start date `YYYY-MM-DD` |
| `endDate` | string | No | End date `YYYY-MM-DD` |
| `timeZone` | string | No | IANA timezone |
| `filters` | array | No | Filter array |
| `pastMinutesStart` | number | No | Minutes ago start |
| `pastMinutesEnd` | number | No | Minutes ago end |
| `page` | number | No | Page number, 1-indexed (default: 1) |
| `limit` | number | No | Results per page (max 200) |

**Returns**: Array of `{ latitude, longitude, city, country, sessionCount }`.

**Use case**: Geographic analysis and map visualization of visitor origins.

---

### 4.3 Metrics & Dimensions

#### `rybbit_get_metric`
Get metric breakdown by dimension.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteId` | string/number | Yes | Site ID |
| `parameter` | string | Yes | Dimension to break down by (see list below) |
| `startDate` | string | No | Start date `YYYY-MM-DD` |
| `endDate` | string | No | End date `YYYY-MM-DD` |
| `timeZone` | string | No | IANA timezone |
| `filters` | array | No | Filter array |
| `pastMinutesStart` | number | No | Minutes ago start |
| `pastMinutesEnd` | number | No | Minutes ago end |
| `page` | number | No | Page number (default: 1) |
| `limit` | number | No | Results per page (max 200) |

**`parameter` values:**
- **Pages**: `pathname`, `page_title`, `entry_page`, `exit_page`
- **Tech**: `browser`, `operating_system`, `device_type`
- **Geo**: `country`, `region`, `city`, `language`
- **Traffic sources**: `referrer`, `channel`
- **Marketing**: `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`
- **Other**: `hostname`, `querystring`, `event_name`

**Returns**: Array of `{ value, count, percentage, bounceRate, timeOnPage }`.

**Use case**: Top pages, browser distribution, country breakdown, traffic source analysis, UTM campaign performance.

---

#### `rybbit_get_retention`
Get user retention cohort analysis.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteId` | string/number | Yes | Site ID |
| `startDate` | string | No | Start date `YYYY-MM-DD` |
| `endDate` | string | No | End date `YYYY-MM-DD` |
| `timeZone` | string | No | IANA timezone |
| `filters` | array | No | Filter array |
| `pastMinutesStart` | number | No | Minutes ago start |
| `pastMinutesEnd` | number | No | Minutes ago end |

**Returns**: Array of `{ cohort, periods[] }` showing return rates per cohort.

**Use case**: How many users come back over time — retention analysis by cohort.

---

### 4.4 Sessions

#### `rybbit_list_sessions`
List sessions with filtering and pagination.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteId` | string/number | Yes | Site ID |
| `startDate` | string | No | Start date `YYYY-MM-DD` |
| `endDate` | string | No | End date `YYYY-MM-DD` |
| `timeZone` | string | No | IANA timezone |
| `filters` | array | No | Filter array |
| `pastMinutesStart` | number | No | Minutes ago start |
| `pastMinutesEnd` | number | No | Minutes ago end |
| `page` | number | No | Page number (default: 1) |
| `limit` | number | No | Results per page (max 200) |
| `ip` | string | No | Filter by IP address (exact or partial match, client-side). Requires `trackIp` enabled. |
| `identifiedOnly` | boolean | No | Only return sessions from identified users |
| `minDuration` | number | No | Minimum session duration in seconds |

**Returns**: Array of session summaries with `{ sessionId, userId, device, country, city, pagesVisited, duration, bounced }`.

**Use case**: Browse recent sessions, find sessions by IP, filter to identified users only.

---

#### `rybbit_get_session`
Get full session detail with all events.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteId` | string/number | Yes | Site ID |
| `sessionId` | string | Yes | Session ID (from `rybbit_list_sessions`) |

**Returns**: `{ sessionId, userId, traits, device, browser, os, country, region, city, events[] }` with full event timeline.

**Use case**: Deep-dive into a specific session to see the complete user journey, pages visited, and events fired.

---

### 4.5 Users

#### `rybbit_list_users`
List users for a site with session counts and traits.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteId` | string/number | Yes | Site ID |
| `startDate` | string | No | Start date `YYYY-MM-DD` |
| `endDate` | string | No | End date `YYYY-MM-DD` |
| `timeZone` | string | No | IANA timezone |
| `filters` | array | No | Filter array. **Note**: `event_name` filter is auto-removed (backend bug). Use `rybbit_get_user_event_breakdown` instead. |
| `pastMinutesStart` | number | No | Minutes ago start |
| `pastMinutesEnd` | number | No | Minutes ago end |
| `page` | number | No | Page number (default: 1) |
| `limit` | number | No | Results per page (max 200) |
| `search` | string | No | Search by trait value (username, email). Case-insensitive partial match (ILIKE). |
| `searchField` | string | No | Field to search: `username`, `name`, `email`, `user_id`. Default: `username`. |
| `identifiedOnly` | boolean | No | Only return identified users |
| `sortBy` | string | No | Sort field: `first_seen`, `last_seen`, `pageviews`, `sessions`, `events`, `duration`. Default: `last_seen`. `duration` aggregates from sessions and requires date range. |
| `sortOrder` | string | No | `asc` or `desc`. Default: `desc` |

**Returns**: Array of user objects with IDs, session counts, first/last seen dates, and traits.

**Use case**: Find specific users, list most active users, sort by engagement.

---

#### `rybbit_get_user`
Get detailed information about a specific user.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteId` | string/number | Yes | Site ID |
| `userId` | string | Yes | User ID (`identified_user_id` or internal `user_id`) |

**Returns**: User details with traits, session history, and activity summary.

**Use case**: Deep-dive into a specific user's behavior and traits.

---

#### `rybbit_get_user_traits`
Get user trait keys, values, or find users by trait.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteId` | string/number | Yes | Site ID |
| `mode` | string | No | `keys` (list trait keys), `values` (values for a key), `users` (find users by key+value). Default: `keys` if no key, `values` if key given. |
| `key` | string | No | Trait key (required for `values` and `users` modes) |
| `value` | string | No | Trait value (required for `users` mode). Case-insensitive matching. |
| `limit` | number | No | Max results to return |

**Returns**: Depends on mode — trait keys list, values list, or matching users.

**Use case**: Discover what user traits are tracked, find users by trait (e.g., all users with `plan=premium`).

---

#### `rybbit_get_user_event_breakdown`
Get event count breakdown for a specific user.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteId` | string/number | Yes | Site ID |
| `userId` | string | Yes | User ID — Rybbit device hash or app-provided ID. Both are checked. |
| `startDate` | string | No | Start date `YYYY-MM-DD` |
| `endDate` | string | No | End date `YYYY-MM-DD` |
| `timeZone` | string | No | IANA timezone |
| `filters` | array | No | Additional filters |
| `pastMinutesStart` | number | No | Minutes ago start |
| `pastMinutesEnd` | number | No | Minutes ago end |

**Returns**: Event names with counts for the specified user.

**Use case**: Per-user behavior analysis — how many `ad_click`, `chat_message_sent`, `purchase` events a user triggered.

---

### 4.6 Events

#### `rybbit_list_events`
List raw events with filtering and pagination.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteId` | string/number | Yes | Site ID |
| `startDate` | string | No | Start date `YYYY-MM-DD` |
| `endDate` | string | No | End date `YYYY-MM-DD` |
| `timeZone` | string | No | IANA timezone |
| `filters` | array | No | Filter array |
| `pastMinutesStart` | number | No | Minutes ago start |
| `pastMinutesEnd` | number | No | Minutes ago end |
| `page` | number | No | Page number (default: 1) |
| `limit` | number | No | Results per page (max 200) |
| `eventName` | string | No | Filter to only this event name (e.g., `ad_click`). More precise than filters array. |

**Returns**: `{ data: [{ event_name, type, pathname, timestamp, ... }], cursor }`.

**Use case**: Browse raw event data, find specific event occurrences.

---

#### `rybbit_get_event_names`
Get all custom event names and their counts.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteId` | string/number | Yes | Site ID |
| `startDate` | string | No | Start date `YYYY-MM-DD` |
| `endDate` | string | No | End date `YYYY-MM-DD` |
| `timeZone` | string | No | IANA timezone |
| `filters` | array | No | Filter array |
| `pastMinutesStart` | number | No | Minutes ago start |
| `pastMinutesEnd` | number | No | Minutes ago end |

**Returns**: Array of `{ event_name, count }`.

**Use case**: Discover what custom events are being tracked on a site.

---

#### `rybbit_get_event_properties`
Get property breakdowns for a specific custom event.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteId` | string/number | Yes | Site ID |
| `eventName` | string | Yes | Event name to get properties for |
| `startDate` | string | No | Start date `YYYY-MM-DD` |
| `endDate` | string | No | End date `YYYY-MM-DD` |
| `timeZone` | string | No | IANA timezone |
| `filters` | array | No | Filter array |
| `pastMinutesStart` | number | No | Minutes ago start |
| `pastMinutesEnd` | number | No | Minutes ago end |

**Returns**: Property keys and values with counts for the specified event.

**Use case**: Analyze event metadata — e.g., `ad_click` properties like `ad_position`, `ad_type`, `campaign_id`.

---

#### `rybbit_get_event_timeseries`
Get custom event counts as time-series data.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteId` | string/number | Yes | Site ID |
| `startDate` | string | No | Start date `YYYY-MM-DD` |
| `endDate` | string | No | End date `YYYY-MM-DD` |
| `timeZone` | string | No | IANA timezone |
| `filters` | array | No | Filter array |
| `pastMinutesStart` | number | No | Minutes ago start |
| `pastMinutesEnd` | number | No | Minutes ago end |
| `bucket` | string | No | Time bucket: `minute`, `five_minutes`, `ten_minutes`, `fifteen_minutes`, `hour`, `day`, `week`, `month`, `year` |

**Returns**: Array of time-bucketed event counts.

**Use case**: Track event trends over time — are `signup` events increasing this week?

---

#### `rybbit_get_outbound_links`
Get outbound link clicks tracked on the site.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteId` | string/number | Yes | Site ID |
| `startDate` | string | No | Start date `YYYY-MM-DD` |
| `endDate` | string | No | End date `YYYY-MM-DD` |
| `timeZone` | string | No | IANA timezone |
| `filters` | array | No | Filter array |
| `pastMinutesStart` | number | No | Minutes ago start |
| `pastMinutesEnd` | number | No | Minutes ago end |
| `page` | number | No | Page number (default: 1) |
| `limit` | number | No | Results per page (max 200) |

**Returns**: Array of outbound link URLs with click counts.

**Use case**: Which external links are users clicking? Are affiliate links performing?

---

### 4.7 Errors

#### `rybbit_get_errors`
Get error tracking data. Three modes: names, events, timeseries.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteId` | string/number | Yes | Site ID |
| `type` | string | No | `names` (error summary, default), `events` (individual instances), `timeseries` (trends) |
| `errorMessage` | string | No | Error message filter. **Required** for `events` and `timeseries` types. Use `names` first to discover errors. |
| `bucket` | string | No | Time bucket for `timeseries`: `minute`, `five_minutes`, `hour`, `day`, `week`, `month` |
| `startDate` | string | No | Start date `YYYY-MM-DD` |
| `endDate` | string | No | End date `YYYY-MM-DD` |
| `timeZone` | string | No | IANA timezone |
| `filters` | array | No | Filter array |
| `pastMinutesStart` | number | No | Minutes ago start |
| `pastMinutesEnd` | number | No | Minutes ago end |
| `page` | number | No | Page number (default: 1) |
| `limit` | number | No | Results per page (max 200) |

**Returns** (depends on type):
- `names`: Array of `{ name, count }`
- `events`: Array of `{ id, name, message, stack }`
- `timeseries`: Array of time-bucketed error counts

**Workflow**:
1. `type="names"` — discover error types and how often they occur
2. `type="events"` with `errorMessage` — see individual instances with stack traces
3. `type="timeseries"` with `errorMessage` — see if an error is trending up or down

**Use case**: Error investigation — find top errors, examine stack traces, track error trends.

---

### 4.8 Performance (Core Web Vitals)

#### `rybbit_get_performance`
Get Core Web Vitals with percentiles.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteId` | string/number | Yes | Site ID |
| `dimension` | string | No | `overview` (default), `pathname`, `browser`, `operating_system` |
| `startDate` | string | No | Start date `YYYY-MM-DD` |
| `endDate` | string | No | End date `YYYY-MM-DD` |
| `timeZone` | string | No | IANA timezone |
| `filters` | array | No | Filter array |
| `pastMinutesStart` | number | No | Minutes ago start |
| `pastMinutesEnd` | number | No | Minutes ago end |

**Returns**:
- `overview`: `{ lcp_p50, lcp_p75, lcp_p90, lcp_p99, cls_p50, cls_p75, ..., inp_*, fcp_*, ttfb_* }`
- `pathname`/`browser`/`operating_system`: Array broken down by that dimension

**Metrics explained:**
- **LCP** (Largest Contentful Paint): Loading — good < 2.5s
- **CLS** (Cumulative Layout Shift): Visual stability — good < 0.1
- **INP** (Interaction to Next Paint): Interactivity — good < 200ms
- **FCP** (First Contentful Paint): First render — good < 1.8s
- **TTFB** (Time to First Byte): Server responsiveness — good < 800ms

**Use case**: Performance audit — are Core Web Vitals within Google's "good" thresholds? Which pages are slow?

---

#### `rybbit_get_performance_timeseries`
Get Core Web Vitals as time-series data.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteId` | string/number | Yes | Site ID |
| `startDate` | string | No | Start date `YYYY-MM-DD` |
| `endDate` | string | No | End date `YYYY-MM-DD` |
| `timeZone` | string | No | IANA timezone |
| `filters` | array | No | Filter array |
| `pastMinutesStart` | number | No | Minutes ago start |
| `pastMinutesEnd` | number | No | Minutes ago end |
| `bucket` | string | No | Time bucket: `minute` to `year`. Default: `day` |

**Returns**: Array of time-bucketed performance data points.

**Use case**: Track performance trends — did the last deploy improve or degrade LCP?

---

### 4.9 Funnels

#### `rybbit_list_funnels`
List all saved funnels for a site.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteId` | string/number | Yes | Site ID |

**Returns**: Array of `{ id, name, steps: [{ value, type, name }] }`.

**Use case**: Discover existing funnels before analyzing them.

---

#### `rybbit_analyze_funnel`
Analyze a custom funnel with ad-hoc steps.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteId` | string/number | Yes | Site ID |
| `steps` | array | Yes | Minimum 2 steps. Each: `{ value: string, type: "page"\|"event", name?: string }` |
| `startDate` | string | No | Start date `YYYY-MM-DD` |
| `endDate` | string | No | End date `YYYY-MM-DD` |
| `timeZone` | string | No | IANA timezone |
| `filters` | array | No | Filter array |
| `pastMinutesStart` | number | No | Minutes ago start |
| `pastMinutesEnd` | number | No | Minutes ago end |

**Example steps:**
```json
[
  { "value": "/", "type": "page", "name": "Homepage" },
  { "value": "/pricing", "type": "page", "name": "Pricing" },
  { "value": "signup", "type": "event", "name": "Sign Up" }
]
```

**Returns**: `{ steps: [{ name, count, dropoff, dropoffRate }] }`.

**Use case**: Conversion funnel analysis — where do users drop off between homepage and signup?

---

#### `rybbit_get_funnel_step_sessions`
Get sessions that reached or dropped off at a specific funnel step.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteId` | string/number | Yes | Site ID |
| `stepNumber` | number | Yes | Step number (1-indexed) |
| `mode` | string | Yes | `reached` (made it to step) or `dropped` (dropped off at step) |
| `steps` | array | Yes | Same funnel steps definition used in `rybbit_analyze_funnel` |
| `startDate` | string | No | Start date `YYYY-MM-DD` |
| `endDate` | string | No | End date `YYYY-MM-DD` |
| `timeZone` | string | No | IANA timezone |
| `filters` | array | No | Filter array |
| `pastMinutesStart` | number | No | Minutes ago start |
| `pastMinutesEnd` | number | No | Minutes ago end |
| `page` | number | No | Page number (default: 1) |
| `limit` | number | No | Results per page (max 200) |

**Returns**: List of sessions with details.

**Use case**: Drill into funnel drop-offs — who dropped off at step 2 and what did they do instead?

---

### 4.10 Goals

#### `rybbit_list_goals`
List all goals with current conversion metrics.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteId` | string/number | Yes | Site ID |
| `startDate` | string | No | Start date `YYYY-MM-DD` |
| `endDate` | string | No | End date `YYYY-MM-DD` |
| `timeZone` | string | No | IANA timezone |
| `filters` | array | No | Filter array |
| `pastMinutesStart` | number | No | Minutes ago start |
| `pastMinutesEnd` | number | No | Minutes ago end |

**Returns**: Array of `{ id, name, type, value, conversions, conversionRate }`.

**Use case**: Check goal conversion rates and performance.

---

#### `rybbit_get_goal_sessions`
Get sessions that completed a specific goal.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteId` | string/number | Yes | Site ID |
| `goalId` | string | Yes | Goal ID (from `rybbit_list_goals`) |
| `startDate` | string | No | Start date `YYYY-MM-DD` |
| `endDate` | string | No | End date `YYYY-MM-DD` |
| `timeZone` | string | No | IANA timezone |
| `filters` | array | No | Filter array |
| `pastMinutesStart` | number | No | Minutes ago start |
| `pastMinutesEnd` | number | No | Minutes ago end |
| `page` | number | No | Page number (default: 1) |
| `limit` | number | No | Results per page (max 200) |

**Returns**: Sessions that triggered the goal conversion.

**Use case**: Analyze what converting users have in common — device, country, referrer, entry page.

---

### 4.11 Journeys

#### `rybbit_get_journeys`
Get user journey (navigation path) analysis.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteId` | string/number | Yes | Site ID |
| `startDate` | string | No | Start date `YYYY-MM-DD` |
| `endDate` | string | No | End date `YYYY-MM-DD` |
| `timeZone` | string | No | IANA timezone |
| `filters` | array | No | Filter array |
| `pastMinutesStart` | number | No | Minutes ago start |
| `pastMinutesEnd` | number | No | Minutes ago end |
| `steps` | number | No | Number of journey steps to analyze (2-10, default: 3) |
| `journeyLimit` | number | No | Max journey paths to return (default: 100) |

**Returns**: Array of `{ path: string[], sessions, percentage }`.

**Use case**: What are the most common navigation paths? Where do users go after the homepage?

---

## 5. Filtering Guide

Filters are the most powerful feature — they narrow results by any dimension.

### Filter Structure

```json
{
  "parameter": "<dimension>",
  "type": "<comparison>",
  "value": ["<value1>", "<value2>"]
}
```

Filters are passed as an array. Multiple filters use AND logic.

### Filter Dimensions (22 total)

| Dimension | Description | Example values |
|-----------|-------------|----------------|
| `browser` | Browser name | `Chrome`, `Firefox`, `Safari` |
| `operating_system` | OS name | `Windows`, `macOS`, `Android`, `iOS` |
| `language` | Browser language | `en`, `cs`, `de` |
| `country` | Country code | `US`, `CZ`, `DE` |
| `region` | Region/state | `California`, `Prague` |
| `city` | City name | `Prague`, `New York` |
| `device_type` | Device category | `desktop`, `mobile`, `tablet` |
| `referrer` | Full referrer URL | `https://google.com` |
| `hostname` | Site hostname | `example.com`, `www.example.com` |
| `pathname` | Page path | `/`, `/pricing`, `/blog/post-1` |
| `page_title` | Page title | `Homepage`, `Pricing` |
| `querystring` | URL query string | `?utm_source=google` |
| `event_name` | Custom event name | `signup`, `ad_click`, `purchase` |
| `channel` | Traffic channel | `direct`, `organic`, `referral`, `social`, `paid` |
| `utm_source` | UTM source | `google`, `facebook`, `newsletter` |
| `utm_medium` | UTM medium | `cpc`, `email`, `social` |
| `utm_campaign` | UTM campaign | `summer_sale`, `launch_2024` |
| `utm_term` | UTM term | `analytics`, `privacy` |
| `utm_content` | UTM content | `hero_banner`, `sidebar_ad` |
| `entry_page` | First page of session | `/`, `/landing` |
| `exit_page` | Last page of session | `/checkout`, `/thank-you` |
| `user_id` | User identifier | Checks BOTH device hash (`user_id`) AND app-provided ID (`identified_user_id`) |

### Filter Types (8 total)

| Type | Description | Example |
|------|-------------|---------|
| `equals` | Exact match (any of the values) | `{parameter:"browser", type:"equals", value:["Chrome","Firefox"]}` |
| `not_equals` | Does not match | `{parameter:"country", type:"not_equals", value:["US"]}` |
| `contains` | Substring match | `{parameter:"pathname", type:"contains", value:["/blog"]}` |
| `not_contains` | Does not contain substring | `{parameter:"referrer", type:"not_contains", value:["spam"]}` |
| `regex` | Regular expression match | `{parameter:"pathname", type:"regex", value:["^/product/[0-9]+"]}` |
| `not_regex` | Does not match regex | `{parameter:"pathname", type:"not_regex", value:["^/admin"]}` |
| `greater_than` | Numeric greater than | `{parameter:"session_duration", type:"greater_than", value:[60]}` |
| `less_than` | Numeric less than | `{parameter:"session_duration", type:"less_than", value:[10]}` |

### Common Filter Combinations

**Mobile Chrome users from Germany:**
```json
[
  { "parameter": "device_type", "type": "equals", "value": ["mobile"] },
  { "parameter": "browser", "type": "equals", "value": ["Chrome"] },
  { "parameter": "country", "type": "equals", "value": ["DE"] }
]
```

**Blog pages only (exclude admin):**
```json
[
  { "parameter": "pathname", "type": "contains", "value": ["/blog"] },
  { "parameter": "pathname", "type": "not_contains", "value": ["/admin"] }
]
```

**Traffic from Google Ads:**
```json
[
  { "parameter": "utm_source", "type": "equals", "value": ["google"] },
  { "parameter": "utm_medium", "type": "equals", "value": ["cpc"] }
]
```

**Sessions from a specific user (checks both user_id and identified_user_id):**
```json
[
  { "parameter": "user_id", "type": "equals", "value": ["john@example.com"] }
]
```

**Organic search traffic:**
```json
[
  { "parameter": "channel", "type": "equals", "value": ["organic"] }
]
```

## 6. Date Handling

### Absolute Dates
Use `startDate` and `endDate` in `YYYY-MM-DD` format:
```
startDate: "2026-03-01"
endDate: "2026-03-23"
```

### Relative Time
Use `pastMinutesStart` and `pastMinutesEnd`:
- `pastMinutesStart: 60` — from 60 minutes ago
- `pastMinutesEnd: 0` — to now (default)

Common patterns:
| Period | pastMinutesStart | pastMinutesEnd |
|--------|-----------------|----------------|
| Last hour | 60 | 0 (or omit) |
| Last 24 hours | 1440 | 0 |
| Last 7 days | 10080 | 0 |
| Last 30 days | 43200 | 0 |
| Yesterday | 2880 | 1440 |

### Interaction Rules
- If both absolute dates and relative time are provided, the API accepts both but behavior may vary per endpoint.
- Use absolute dates for specific date ranges.
- Use relative time for "last N minutes/hours" queries.
- When no dates are provided, the API typically defaults to the last 24 hours or 7 days depending on the endpoint.

### Time Zones
Always specify `timeZone` as an IANA timezone string (e.g., `Europe/Prague`, `America/New_York`, `UTC`) for consistent date boundaries. Default is UTC.

### Time Buckets
For timeseries endpoints, the `bucket` parameter controls granularity:

| Bucket | Best for |
|--------|----------|
| `minute` | Last hour real-time monitoring |
| `five_minutes` | Last few hours |
| `ten_minutes` | Intra-day view |
| `fifteen_minutes` | Half-day view |
| `hour` | Last 24-48 hours |
| `day` | Weekly/monthly ranges (most common) |
| `week` | Multi-month ranges |
| `month` | Year-long ranges |
| `year` | Multi-year comparison |

## 7. Workflow Recipes

### Site Traffic Overview
```
1. rybbit_list_sites → get siteId
2. rybbit_get_overview(siteId, startDate="2026-03-16", endDate="2026-03-23")
3. rybbit_get_overview_timeseries(siteId, startDate="2026-03-16", endDate="2026-03-23", bucket="day")
4. rybbit_get_metric(siteId, parameter="pathname", limit=10) → top pages
5. rybbit_get_metric(siteId, parameter="referrer", limit=10) → top referrers
```

### Error Investigation
```
1. rybbit_get_errors(siteId, type="names") → see error types and counts
2. rybbit_get_errors(siteId, type="events", errorMessage="TypeError: Cannot read property...") → stack traces
3. rybbit_get_errors(siteId, type="timeseries", errorMessage="TypeError: ...", bucket="day") → is it getting worse?
4. rybbit_get_errors(siteId, type="names", filters=[{parameter:"browser",type:"equals",value:["Safari"]}]) → browser-specific?
```

### User Behavior Analysis
```
1. rybbit_list_users(siteId, sortBy="sessions", sortOrder="desc", limit=10) → most active users
2. rybbit_get_user(siteId, userId="user123") → user detail
3. rybbit_get_user_event_breakdown(siteId, userId="user123") → what events they triggered
4. rybbit_get_user_traits(siteId, mode="keys") → discover trait keys
5. rybbit_get_user_traits(siteId, mode="users", key="plan", value="premium") → find premium users
```

### Funnel Drop-off Analysis
```
1. rybbit_list_funnels(siteId) → check existing funnels
2. rybbit_analyze_funnel(siteId, steps=[
     {value:"/", type:"page", name:"Homepage"},
     {value:"/pricing", type:"page", name:"Pricing"},
     {value:"/signup", type:"page", name:"Signup"},
     {value:"purchase", type:"event", name:"Purchase"}
   ])
3. rybbit_get_funnel_step_sessions(siteId, stepNumber=2, mode="dropped", steps=[...same...])
   → see who dropped off at Pricing and investigate why
```

### Performance Audit (Core Web Vitals)
```
1. rybbit_get_performance(siteId) → overall Web Vitals
2. rybbit_get_performance(siteId, dimension="pathname") → per-page breakdown
3. rybbit_get_performance(siteId, dimension="browser") → browser-specific issues
4. rybbit_get_performance_timeseries(siteId, startDate="2026-03-01", endDate="2026-03-23", bucket="day")
   → trend: did the last deploy improve LCP?
```

### Traffic Source Analysis
```
1. rybbit_get_metric(siteId, parameter="channel") → direct/organic/referral/social/paid
2. rybbit_get_metric(siteId, parameter="referrer", limit=20) → top referrers
3. rybbit_get_metric(siteId, parameter="utm_source") → UTM sources
4. rybbit_get_metric(siteId, parameter="utm_campaign") → campaign performance
5. rybbit_get_overview(siteId, filters=[{parameter:"channel",type:"equals",value:["organic"]}])
   → organic traffic stats
```

### Real-time Monitoring
```
1. rybbit_live_users(siteId) → current active count
2. rybbit_get_overview(siteId, pastMinutesStart=60) → last hour stats
3. rybbit_get_overview_timeseries(siteId, pastMinutesStart=60, bucket="minute") → minute-by-minute
4. rybbit_get_errors(siteId, type="names", pastMinutesStart=60) → errors in last hour
```

### Event Tracking Deep-dive
```
1. rybbit_get_event_names(siteId) → discover all custom events
2. rybbit_get_event_properties(siteId, eventName="ad_click") → property breakdown
3. rybbit_get_event_timeseries(siteId, bucket="day",
     filters=[{parameter:"event_name",type:"equals",value:["ad_click"]}])
   → event trend over time
4. rybbit_list_events(siteId, eventName="ad_click", limit=20) → raw event records
5. rybbit_get_user_event_breakdown(siteId, userId="user123") → per-user event counts
```

## 8. Tips & Gotchas

### Response Truncation
- Responses are auto-truncated at **25,000 characters** to prevent context window bloat.
- If data is an array, it is halved (keeping the first N items).
- If data is an object, it is sliced at the character limit.
- Truncated responses include a `truncation_message` field.
- **Workaround**: Use `page`/`limit` pagination or add filters to reduce data before it gets truncated.

### Request Timeout
- All API requests have a **30-second timeout** (AbortController).
- If a query times out, you get: `Request timed out after 30s. Try narrowing the date range or adding filters.`
- **Fix**: Narrow the date range, add filters, or reduce the limit.

### Pagination
- Default page size is 20 (endpoint-dependent, some default to 50).
- Maximum page size is **200**.
- `page` is 1-indexed.
- For IP filtering on sessions, the tool fetches up to 2000 sessions internally in batches of 200.

### Known Quirks

1. **`event_name` filter on `rybbit_list_users` is auto-stripped** — the backend crashes (HTTP 500) when applying event_name filter to the users endpoint. The MCP server removes it silently and adds a warning. Use `rybbit_get_user_event_breakdown` instead.

2. **`event_name` filter on `rybbit_list_events` returns session-level data** — the backend fetches entire sessions matching the event. The MCP server applies client-side post-filtering when `eventName` parameter is used (more precise than filters array).

3. **`user_id` filter checks both IDs** — the backend's `user_id` filter checks both the device hash (`user_id`) and the app-provided ID (`identified_user_id`). This is intentional but not obvious from the parameter name.

4. **IP filtering is client-side** — `rybbit_list_sessions` with `ip` parameter fetches sessions in batches and filters locally. Requires the site to have `trackIp` enabled.

5. **`sortBy="duration"` on `rybbit_list_users`** uses client-side aggregation — fetches up to 2000 sessions and computes total duration per user locally. This is slower but works around a missing backend feature.

6. **Session authentication auto-refreshes** — if using email/password auth, the MCP client automatically re-authenticates on 401 responses.

7. **`rybbit_get_user_traits` mode="users" resolves case** — the API does exact case-sensitive matching, but the tool first resolves the correct case by looking up values, so you can pass `value="john"` even if the stored value is `John`.

8. **App sites auto-disable blockBots** — when creating a site with `type="app"`, `blockBots` is automatically disabled because Flutter/Dart HTTP user agents are detected as bots.

### Constants
- `CHARACTER_LIMIT`: 25,000 chars
- `REQUEST_TIMEOUT_MS`: 30,000 ms (30s)
- `DEFAULT_PAGE_SIZE`: 20
- `MAX_PAGE_SIZE`: 200
