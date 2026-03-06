/**
 * HTTP client for Rybbit API requests.
 */

import { AuthConfig, getAuthHeaders, clearSession } from "./auth.js";
import { CHARACTER_LIMIT, REQUEST_TIMEOUT_MS } from "./constants.js";

export interface FilterParam {
  parameter: string;
  type: string;
  value: (string | number)[];
}

export interface QueryParams {
  [key: string]: string | number | boolean | undefined;
}

export class RybbitClient {
  constructor(private config: AuthConfig) {}

  async get<T>(path: string, params?: QueryParams): Promise<T> {
    const url = this.buildUrl(path, params);
    return this.request<T>("GET", url);
  }

  async post<T>(path: string, body?: unknown, params?: QueryParams): Promise<T> {
    const url = this.buildUrl(path, params);
    return this.request<T>("POST", url, body);
  }

  private buildUrl(path: string, params?: QueryParams): string {
    const base = `${this.config.baseUrl}/api${path}`;
    if (!params) return base;

    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") {
        searchParams.set(key, String(value));
      }
    }

    const qs = searchParams.toString();
    return qs ? `${base}?${qs}` : base;
  }

  private async request<T>(
    method: string,
    url: string,
    body?: unknown,
    isRetry = false
  ): Promise<T> {
    const headers = await getAuthHeaders(this.config);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeout);
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new Error(
          `Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s. Try narrowing the date range or adding filters.`
        );
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }

    if (res.status === 401 && !isRetry && this.config.email) {
      clearSession();
      return this.request<T>(method, url, body, true);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(formatApiError(res.status, text));
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return (await res.json()) as T;
    }

    return (await res.text()) as unknown as T;
  }

  buildAnalyticsParams(options: {
    startDate?: string;
    endDate?: string;
    timeZone?: string;
    filters?: FilterParam[];
    pastMinutesStart?: number;
    pastMinutesEnd?: number;
    bucket?: string;
    page?: number;
    limit?: number;
    offset?: number;
  }): QueryParams {
    const params: QueryParams = {};

    if (options.startDate) params.start_date = options.startDate;
    if (options.endDate) params.end_date = options.endDate;
    if (options.timeZone) params.time_zone = options.timeZone;
    if (options.filters && options.filters.length > 0) {
      params.filters = JSON.stringify(options.filters);
    }
    if (options.pastMinutesStart !== undefined)
      params.past_minutes_start = options.pastMinutesStart;
    if (options.pastMinutesEnd !== undefined)
      params.past_minutes_end = options.pastMinutesEnd;
    if (options.bucket) params.bucket = options.bucket;
    if (options.page !== undefined) params.page = options.page;
    if (options.limit !== undefined) params.limit = options.limit;
    if (options.offset !== undefined) params.offset = options.offset;

    return params;
  }
}

function formatApiError(status: number, body: string): string {
  switch (status) {
    case 401:
      return "Authentication failed. Check RYBBIT_API_KEY or RYBBIT_EMAIL/RYBBIT_PASSWORD environment variables.";
    case 403:
      return "Permission denied. You don't have access to this site. Use rybbit_list_sites to see available sites.";
    case 404:
      return "Resource not found. Check the siteId, sessionId, or userId is correct. Use rybbit_list_sites to see valid site IDs.";
    case 429:
      return "Rate limit exceeded. Wait a moment before making more requests.";
    case 500:
      return `Server error (500). The Rybbit instance may be overloaded. ${body ? "Details: " + body.slice(0, 200) : ""}`;
    default:
      return `API error (${status}). ${body ? body.slice(0, 300) : ""}`;
  }
}

export function truncateResponse(data: unknown): string {
  const json = JSON.stringify(data, null, 2);
  if (json.length <= CHARACTER_LIMIT) return json;

  if (Array.isArray(data)) {
    const half = Math.max(1, Math.floor(data.length / 2));
    const truncated = data.slice(0, half);
    const result = {
      data: truncated,
      truncated: true,
      truncation_message: `Response truncated from ${data.length} to ${half} items (exceeded ${CHARACTER_LIMIT} char limit). Use pagination (page/limit) or add filters to reduce results.`,
    };
    return JSON.stringify(result, null, 2);
  }

  return json.slice(0, CHARACTER_LIMIT) +
    `\n\n[Response truncated at ${CHARACTER_LIMIT} characters. Use filters or pagination to reduce data.]`;
}
