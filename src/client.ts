/**
 * HTTP client for Rybbit API requests.
 */

import { AuthConfig, getAuthHeaders, clearSession } from "./auth.js";

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

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401 && !isRetry && this.config.email) {
      clearSession();
      return this.request<T>(method, url, body, true);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Rybbit API error ${res.status} ${method} ${url}: ${text}`);
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
