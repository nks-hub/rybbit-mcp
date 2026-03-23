# @nks-hub/rybbit-mcp

[![Build Status](https://github.com/nks-hub/rybbit-mcp/actions/workflows/build.yml/badge.svg)](https://github.com/nks-hub/rybbit-mcp/actions)
[![npm version](https://img.shields.io/npm/v/@nks-hub/rybbit-mcp.svg)](https://www.npmjs.com/package/@nks-hub/rybbit-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-3178c6.svg)](https://www.typescriptlang.org/)
[![MCP SDK](https://img.shields.io/badge/MCP_SDK-1.27+-8b5cf6.svg)](https://modelcontextprotocol.io/)

> MCP server for [Rybbit Analytics](https://github.com/rybbit-io/rybbit) — query statistics, errors, users, sessions, funnels, goals, and performance metrics directly from Claude Code or any MCP-compatible client.

---

## Why?

Instead of manually checking the Rybbit dashboard, let your AI assistant query analytics data directly:

- "How many users visited the site today?"
- "Show me the top pages by bounce rate this week"
- "What errors occurred in the last hour?"
- "Show user journey from homepage to checkout"
- "Compare browser usage between mobile and desktop"

---

## Quick Start

### Installation (npx — recommended)

No install needed. Just configure your MCP client to run via `npx`:

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

### Installation (from source)

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

### Usage

Ask Claude Code anything about your analytics data. The MCP tools are automatically available.

---

## Features

| Feature | Description |
|---------|-------------|
| **32 Analytics Tools** | Complete coverage of Rybbit API — overview, metrics, sessions, users, events, errors, performance, funnels, goals, journeys, site management |
| **Flexible Auth** | API key (recommended) or email/password authentication |
| **Smart Filtering** | Filter by 22 dimensions (browser, country, UTM, page, device, etc.) with 8 comparison types |
| **Time Ranges** | Date ranges (`YYYY-MM-DD`) or relative time (`pastMinutesStart`) |
| **Time Series** | Configurable bucket granularity from minutes to years |
| **Pagination** | Built-in page/limit support for large datasets |
| **Response Truncation** | Auto-truncation at 25k chars to prevent context bloat |
| **Actionable Errors** | Error messages guide the LLM toward correct tool usage |

---

## Authentication

Supports two authentication methods:

| Method | Environment Variables | Use Case |
|--------|----------------------|----------|
| **API Key** | `RYBBIT_API_KEY` | Recommended for production |
| **Email/Password** | `RYBBIT_EMAIL`, `RYBBIT_PASSWORD` | Development/testing |

Both require `RYBBIT_URL` pointing to your Rybbit instance.

---

## Tools (32)

### Configuration & Site Management
| Tool | Description |
|------|-------------|
| `rybbit_get_config` | Get server version and configuration |
| `rybbit_list_sites` | List all sites and organizations |
| `rybbit_create_site` | Create a new site (type: `web` or `app` — app sites auto-disable bot filtering) |
| `rybbit_delete_site` | Delete a site permanently |
| `rybbit_get_site_id` | Look up site ID by domain name |
| `rybbit_update_site_config` | Update site tracking config (IP, errors, replay, etc.) |

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
| `rybbit_list_sessions` | Session list with filtering by IP, identified users, min duration, and pagination |
| `rybbit_get_session` | Full session detail with events and user traits |

### Users
| Tool | Description |
|------|-------------|
| `rybbit_list_users` | Users with search, sort (first/last seen, pageviews, sessions, duration), and identified-only filter |
| `rybbit_get_user` | User detail with traits and activity |
| `rybbit_get_user_traits` | Trait keys, values, or find users by trait |
| `rybbit_get_user_event_breakdown` | Per-user event count breakdown |

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

---

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

---

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
```

---

## Requirements

- **Node.js**: 18+
- **Rybbit Analytics**: Self-hosted or cloud instance

---

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

## Links

- [Rybbit Analytics](https://github.com/rybbit-io/rybbit)
- [npm Package](https://www.npmjs.com/package/@nks-hub/rybbit-mcp)
- [@nks-hub/rybbit-ts](https://github.com/nks-hub/rybbit-ts) — TypeScript tracking SDK
- [rybbit-flutter-sdk](https://github.com/nks-hub/rybbit-flutter-sdk) — Flutter/Dart tracking SDK

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/nks-hub">NKS Hub</a>
</p>
