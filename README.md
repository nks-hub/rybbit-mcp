# @nks-hub/rybbit-mcp

[![npm version](https://img.shields.io/npm/v/@nks-hub/rybbit-mcp?color=22c55e)](https://www.npmjs.com/package/@nks-hub/rybbit-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![MCP SDK](https://img.shields.io/badge/MCP_SDK-1.27-8b5cf6)](https://modelcontextprotocol.io/)

MCP server for [Rybbit Analytics](https://github.com/rybbit-io/rybbit) — query statistics, errors, users, sessions, funnels, goals, and performance metrics directly from Claude Code or any MCP-compatible client.

## Why?

Instead of manually checking the Rybbit dashboard, let your AI assistant query analytics data directly:

- "How many users visited the site today?"
- "Show me the top pages by bounce rate this week"
- "What errors occurred in the last hour?"
- "Show user journey from homepage to checkout"
- "Compare browser usage between mobile and desktop"

## Quick Start

### 1. Install

```bash
npm install -g @nks-hub/rybbit-mcp
```

Or clone and build:

```bash
git clone https://github.com/nks-hub/rybbit-mcp.git
cd rybbit-mcp
npm install && npm run build
```

### 2. Configure Claude Code

Add to your `~/.claude/settings.json` or project `.claude/settings.json`:

```json
{
  "mcpServers": {
    "rybbit": {
      "command": "node",
      "args": ["C:/path/to/rybbit-mcp/build/index.js"],
      "env": {
        "RYBBIT_URL": "https://your-rybbit-instance.com",
        "RYBBIT_API_KEY": "your-api-key"
      }
    }
  }
}
```

### 3. Use

Ask Claude Code anything about your analytics data. The MCP tools are automatically available.

## Authentication

Supports two authentication methods:

| Method | Environment Variables | Use Case |
|--------|----------------------|----------|
| **API Key** | `RYBBIT_API_KEY` | Recommended for production |
| **Email/Password** | `RYBBIT_EMAIL`, `RYBBIT_PASSWORD` | Development/testing |

Both require `RYBBIT_URL` pointing to your Rybbit instance.

## Tools (27)

### Configuration
| Tool | Description |
|------|-------------|
| `rybbit_get_config` | Get server version and configuration |
| `rybbit_list_sites` | List all sites and organizations |

### Real-time & Overview
| Tool | Description |
|------|-------------|
| `rybbit_live_users` | Current active users count |
| `rybbit_get_overview` | Aggregated metrics (sessions, pageviews, users, bounce rate, duration) |
| `rybbit_get_overview_timeseries` | Metrics as time-series with configurable buckets |
| `rybbit_get_session_locations` | Geographic session data with coordinates for map visualization |

### Metrics & Dimensions
| Tool | Description |
|------|-------------|
| `rybbit_get_metric` | Breakdown by dimension (browser, OS, country, page, UTM, etc.) |
| `rybbit_get_retention` | User retention cohort analysis |

### Sessions
| Tool | Description |
|------|-------------|
| `rybbit_list_sessions` | Session list with filtering and pagination |
| `rybbit_get_session` | Full session detail with events and user traits |

### Users
| Tool | Description |
|------|-------------|
| `rybbit_list_users` | Identified users with session counts and traits |
| `rybbit_get_user` | User detail with traits and activity |
| `rybbit_get_user_traits` | Trait keys, values, or find users by trait |

### Events
| Tool | Description |
|------|-------------|
| `rybbit_list_events` | Raw event records with filtering |
| `rybbit_get_event_names` | Custom event names and counts |
| `rybbit_get_event_properties` | Property breakdowns per event |
| `rybbit_get_event_timeseries` | Event count trends over time with configurable buckets |
| `rybbit_get_outbound_links` | Outbound link clicks with URLs and counts |

### Errors
| Tool | Description |
|------|-------------|
| `rybbit_get_errors` | Error types/counts, individual instances, or timeseries for a specific error |

### Performance (Web Vitals)
| Tool | Description |
|------|-------------|
| `rybbit_get_performance` | Core Web Vitals (LCP, CLS, INP, FCP, TTFB) with percentiles |
| `rybbit_get_performance_timeseries` | Web Vitals trends over time |

### Funnels & Goals
| Tool | Description |
|------|-------------|
| `rybbit_list_funnels` | Saved funnels with step definitions |
| `rybbit_analyze_funnel` | Ad-hoc funnel analysis with custom steps |
| `rybbit_get_funnel_step_sessions` | Sessions that reached or dropped off at a funnel step |
| `rybbit_list_goals` | Goals with conversion metrics |
| `rybbit_get_goal_sessions` | Sessions that completed a specific goal |

### Journeys
| Tool | Description |
|------|-------------|
| `rybbit_get_journeys` | User navigation path analysis |

## Common Parameters

All analytics tools support these optional parameters:

| Parameter | Type | Description |
|-----------|------|-------------|
| `siteId` | string | Site identifier (required) |
| `startDate` | string | Start date `YYYY-MM-DD` |
| `endDate` | string | End date `YYYY-MM-DD` |
| `timeZone` | string | IANA timezone (e.g., `Europe/Prague`) |
| `filters` | array | Filter array `[{parameter, type, value[]}]` |
| `pastMinutesStart` | number | Minutes ago (alternative to date range) |

### Filter Parameters

`browser`, `operating_system`, `language`, `country`, `region`, `city`, `device_type`, `referrer`, `hostname`, `pathname`, `page_title`, `querystring`, `event_name`, `channel`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `entry_page`, `exit_page`, `user_id`

### Filter Types

`equals`, `not_equals`, `contains`, `not_contains`, `regex`, `not_regex`, `greater_than`, `less_than`

### Time Buckets

`minute`, `five_minutes`, `ten_minutes`, `fifteen_minutes`, `hour`, `day`, `week`, `month`, `year`

## Requirements

- Node.js >= 18
- Rybbit Analytics instance (self-hosted or cloud)

## Related

- [rybbit-io/rybbit](https://github.com/rybbit-io/rybbit) — Rybbit Analytics platform
- [@nks-hub/rybbit-ts](https://github.com/nks-hub/rybbit-ts) — TypeScript tracking SDK
- [rybbit-flutter-sdk](https://github.com/nks-hub/rybbit-flutter-sdk) — Flutter/Dart tracking SDK
- [rybbit-app](https://github.com/nks-hub/rybbit-app) — Flutter mobile client

## License

[MIT](LICENSE)
