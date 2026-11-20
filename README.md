# @nks-hub/rybbit-mcp

[![Build Status](https://github.com/nks-hub/rybbit-mcp/actions/workflows/build.yml/badge.svg)](https://github.com/nks-hub/rybbit-mcp/actions)
[![npm version](https://img.shields.io/npm/v/@nks-hub/rybbit-mcp.svg)](https://www.npmjs.com/package/@nks-hub/rybbit-mcp)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-3178c6.svg)](https://www.typescriptlang.org/)
[![MCP SDK](https://img.shields.io/badge/MCP_SDK-1.27+-8b5cf6.svg)](https://modelcontextprotocol.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> MCP server for [Rybbit Analytics](https://github.com/rybbit-io/rybbit). Claude Code and other MCP clients use it to query statistics, errors, users, sessions, funnels, goals and performance metrics.

## Features

- 🧰 **43 analytics tools** - Overview, metrics, sessions, users, events, errors, performance, funnels, goals, journeys and site management
- 🔐 **Authentication** - API key (recommended) or email and password
- 🔍 **Filtering** - Filter by 31 dimensions (browser, country, UTM, page, device, etc.) with 8 comparison types
- 📅 **Time ranges** - Date ranges (`YYYY-MM-DD`) or relative time (`pastMinutesStart`)
- 📈 **Time series** - Daily buckets by default, any size from one minute to one year
- 📄 **Pagination** - `page` and `limit` with a per-tool default sized to about 10k characters; `totalCount` reports how many rows exist
- ✂️ **Response truncation** - A result over 16k characters loses rows from the end and says so in `truncated` and `note`; text and `structuredContent` carry the same JSON
- 💡 **Error messages** - Pass on what the server rejected ("Goal not found") and what to try next, e.g. call `rybbit_list_sites` for valid IDs

## Requirements

- **Node.js**: 18+
- **Rybbit Analytics**: Self-hosted or cloud instance

## Installation

### npx (recommended)

Configure your MCP client to run the package via `npx`:

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

Add this to your `~/.claude/settings.json` or project `.claude/settings.json`.

**CLI shorthand:**

```bash
claude mcp add rybbit -e RYBBIT_URL=https://your-instance.com -e RYBBIT_API_KEY=your-key -- npx -y @nks-hub/rybbit-mcp
```

### From source

For development or contributing:

```bash
git clone https://github.com/nks-hub/rybbit-mcp.git
cd rybbit-mcp
npm install && npm run build
```

Then point your MCP config to the local build:

```json
{
  "mcpServers": {
    "rybbit": {
      "command": "node",
      "args": ["path/to/rybbit-mcp/build/index.js"],
      "env": {
        "RYBBIT_URL": "https://your-rybbit-instance.com",
        "RYBBIT_API_KEY": "your-api-key"
      }
    }
  }
}
```

## Usage

Once the server is configured, Claude Code can answer questions such as:

- "How many users visited the site today?"
- "Show me the top pages by bounce rate this week"
- "What errors occurred in the last hour?"
- "Show user journey from homepage to checkout"
- "Compare browser usage between mobile and desktop"

## Authentication

| Method | Environment Variables | Use Case |
|--------|----------------------|----------|
| **API key** | `RYBBIT_API_KEY` | Recommended for production |
| **Email/password** | `RYBBIT_EMAIL`, `RYBBIT_PASSWORD` | Development/testing |

Both require `RYBBIT_URL` pointing to your Rybbit instance.

## Tools (43)

### Configuration and site management
| Tool | Description |
|------|-------------|
| `rybbit_get_config` | Get server version and configuration |
| `rybbit_list_sites` | List all sites and organizations |
| `rybbit_create_site` | Create a new site (type: `web` or `mobile`; legacy alias `app` maps to `mobile`; mobile sites have bot filtering turned off) |
| `rybbit_delete_site` | Delete a site permanently |
| `rybbit_get_site_id` | Look up site ID by domain name |
| `rybbit_update_site_config` | Update site tracking config (IP, errors, replay, etc.) |
| `rybbit_site_has_data` | Check whether a site has received any events |
| `rybbit_get_page_titles` | Most viewed page titles with pageviews and sessions |
| `rybbit_describe_dimension` | Which tools accept a filter dimension, with example values |

### Real-time and overview
| Tool | Description |
|------|-------------|
| `rybbit_live_users` | Current active users count |
| `rybbit_get_overview` | Aggregated metrics (`sessions`, `pageviews`, `users`, `pages_per_session`, `bounce_rate`, `session_duration`) |
| `rybbit_get_overview_timeseries` | Metrics as time-series with configurable buckets |
| `rybbit_get_session_locations` | Geographic session data with coordinates for map visualization |

### Metrics and dimensions
| Tool | Description |
|------|-------------|
| `rybbit_get_metric` | Breakdown by dimension (browser, OS, country, page, UTM, etc.) |
| `rybbit_get_retention` | User retention cohort analysis |

### Sessions
| Tool | Description |
|------|-------------|
| `rybbit_list_sessions` | Session list with filtering by IP, identified users, min duration, and pagination |
| `rybbit_get_session` | One session with its event timeline, paged by `limit` and `offset` |

### Users
| Tool | Description |
|------|-------------|
| `rybbit_list_users` | Users with search, sort (first/last seen, pageviews, sessions, duration), and identified-only filter |
| `rybbit_get_user` | User detail with traits and activity |
| `rybbit_get_user_traits` | Trait keys, values, or find users by trait |
| `rybbit_get_user_event_breakdown` | Per-user event count breakdown |
| `rybbit_get_user_session_count` | Sessions per day for one user |

### Events
| Tool | Description |
|------|-------------|
| `rybbit_list_events` | Raw event records, newest first, paged by `beforeCursor` |
| `rybbit_get_event_aggregate` | Event counts grouped by any event field, trait or property (scans up to `maxScan` events, 5000 by default, about 3 s) |
| `rybbit_get_event_user_leaderboard` | Top users for one event |
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

### Funnels and goals
| Tool | Description |
|------|-------------|
| `rybbit_list_funnels` | Saved funnels with step definitions |
| `rybbit_analyze_funnel` | Ad-hoc funnel analysis with custom steps |
| `rybbit_get_funnel_step_sessions` | Sessions that reached or dropped off at a funnel step |
| `rybbit_create_funnel` | Save a named funnel |
| `rybbit_delete_funnel` | Delete a saved funnel |
| `rybbit_list_goals` | Goals with conversion metrics |
| `rybbit_get_goal_sessions` | Sessions that completed a specific goal |
| `rybbit_create_goal` | Create a path or event goal |
| `rybbit_update_goal` | Change a goal's name, type or configuration |
| `rybbit_delete_goal` | Delete a goal |

### Journeys
| Tool | Description |
|------|-------------|
| `rybbit_get_journeys` | User navigation path analysis |

## Common parameters

All analytics tools support these optional parameters:

| Parameter | Type | Description |
|-----------|------|-------------|
| `siteId` | string | Site identifier (required) |
| `startDate` | string | Start date `YYYY-MM-DD` |
| `endDate` | string | End date `YYYY-MM-DD` |
| `timeZone` | string | IANA timezone (e.g., `Europe/Prague`) |
| `filters` | array | Filter array `[{parameter, type, value[]}]` |
| `pastMinutesStart` | number | Minutes ago (alternative to date range) |
| `pastMinutesEnd` | number | End of the relative range in minutes ago (default 0, now) |

### Filter parameters

`browser`, `browser_version`, `operating_system`, `operating_system_version`, `language`, `country`, `region`, `city`, `device_type`, `device_model`, `app_version`, `dimensions`, `referrer`, `hostname`, `pathname`, `page_title`, `querystring`, `event_name`, `channel`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `entry_page`, `exit_page`, `user_id`, `lat`, `lon`, `timezone`, `tag`

### Filter types

`equals`, `not_equals`, `contains`, `not_contains`, `regex`, `not_regex`, `greater_than`, `less_than`

### Time buckets

`minute`, `five_minutes`, `ten_minutes`, `fifteen_minutes`, `hour`, `day`, `week`, `month`, `year`

## Related projects

- [Rybbit Analytics](https://github.com/rybbit-io/rybbit)
- [npm package](https://www.npmjs.com/package/@nks-hub/rybbit-mcp)
- [@nks-hub/rybbit-ts](https://github.com/nks-hub/rybbit-ts): TypeScript tracking SDK
- [rybbit-flutter-sdk](https://github.com/nks-hub/rybbit-flutter-sdk): Flutter/Dart tracking SDK

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev

# Type checking
npx tsc --noEmit

# Tests (builds first, then runs node:test against a stubbed Rybbit API)
npm test
```

## Contributing

Contributions are welcome! For major changes, please open an issue first.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: description'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Support

- 📧 **Email:** dev@nks-hub.cz
- 🐛 **Bug reports:** [GitHub Issues](https://github.com/nks-hub/rybbit-mcp/issues)
- 📖 **MCP Protocol:** [modelcontextprotocol.io](https://modelcontextprotocol.io/)

## License

MIT License — see [LICENSE](LICENSE) for details.

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/nks-hub">NKS Hub</a>
</p>
