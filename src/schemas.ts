/**
 * Shared Zod schemas for MCP tool inputs.
 */

import { z } from "zod";
import { MAX_PAGE_SIZE } from "./constants.js";

export const siteIdSchema = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .describe("Site ID (numeric ID or domain identifier)");

/**
 * Filter dimensions accepted by Rybbit's runtime filter validation.
 *
 * Sourced from the server's enforced schema `baseFilterParamSchema` in
 * `server/src/api/analytics/utils/query-validation.ts` — the schema actually
 * validated by `getFilterStatement` (via `validateFilters`) and by `getMetric`
 * (via `getSqlParam` → `filterParamSchema.parse`). Anything outside it is
 * rejected with an HTTP 500 on the general analytics endpoints.
 *
 * NOTE: the wider `FilterParameter` union in `shared/src/filters.ts` also lists
 * bot/enrichment dims (vpn, crawler, datacenter, company*, asn*), but those are
 * NOT runtime-accepted on general endpoints — they are only served by the
 * dedicated `/bots` dimension endpoint (its own BOT_DIMENSIONS set), which this
 * MCP does not wrap. They are intentionally omitted here.
 */
export const FILTER_DIMENSIONS = [
  "browser",
  "browser_version",
  "operating_system",
  "operating_system_version",
  "language",
  "country",
  "region",
  "city",
  "device_type",
  "device_model",
  "app_version",
  "dimensions",
  "referrer",
  "hostname",
  "pathname",
  "page_title",
  "querystring",
  "event_name",
  "channel",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "entry_page",
  "exit_page",
  "user_id",
  "lat",
  "lon",
  "timezone",
  "tag",
] as const;

export const filterSchema = z.object({
  parameter: z
    .string()
    .describe(
      // Kept short on purpose: this schema is embedded in two dozen tools, so the full
      // list lives once, in the description of rybbit_describe_dimension.
      "Filter dimension, e.g. browser, country, pathname, device_type, referrer, event_name " +
        "(all of them are listed by rybbit_describe_dimension). " +
        "Custom URL parameters use the prefix 'url_param:NAME'."
    ),
  type: z
    .enum([
      "equals",
      "not_equals",
      "contains",
      "not_contains",
      "regex",
      "not_regex",
      "greater_than",
      "less_than",
    ])
    .describe("Filter comparison type"),
  value: z
    .array(z.union([z.string(), z.number()]))
    .describe("Values to filter by"),
});

export const analyticsInputSchema = {
  siteId: siteIdSchema,
  startDate: z
    .string()
    .optional()
    .describe("Start date in ISO format (YYYY-MM-DD)"),
  endDate: z
    .string()
    .optional()
    .describe("End date in ISO format (YYYY-MM-DD)"),
  timeZone: z
    .string()
    .optional()
    .describe("IANA timezone (e.g., Europe/Prague). Default: UTC"),
  filters: z
    .array(filterSchema)
    .optional()
    .describe("Array of filters. Example: [{parameter:'browser',type:'equals',value:['Chrome']},{parameter:'country',type:'equals',value:['US','DE']}]"),
  pastMinutesStart: z
    .number()
    .optional()
    .describe("Alternative to dates: minutes ago start (e.g., 60 = last hour)"),
  pastMinutesEnd: z
    .number()
    .optional()
    .describe("Alternative to dates: minutes ago end (default 0 = now)"),
};

export const bucketSchema = z
  .enum([
    "minute",
    "five_minutes",
    "ten_minutes",
    "fifteen_minutes",
    "hour",
    "day",
    "week",
    "month",
    "year",
  ])
  // The server falls back to hourly buckets, which is 168 rows for a week.
  .default("day")
  .describe("Time bucket granularity. Use 'hour' for a single day, 'week'/'month' for long ranges");

/**
 * Row limit with a per-tool default. Defaults are sized so that one page of the
 * tool's rows stays near 10 000 characters of JSON.
 */
export const limitSchema = (defaultLimit: number) =>
  z.number().int().min(1).max(MAX_PAGE_SIZE).default(defaultLimit).describe("Rows per page");

export const paginationSchema = (defaultLimit: number) => ({
  page: z.number().int().min(1).default(1).describe("Page number, 1-indexed"),
  limit: limitSchema(defaultLimit),
});

export const metricParameterSchema = z
  .enum([
    "browser",
    "browser_version",
    "operating_system",
    "operating_system_version",
    "language",
    "country",
    "region",
    "city",
    "device_type",
    "device_model",
    "app_version",
    "dimensions",
    "referrer",
    "hostname",
    "pathname",
    "page_title",
    "querystring",
    "event_name",
    "channel",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "entry_page",
    "exit_page",
    "timezone",
  ])
  .describe(
    "Metric dimension to break down by. device_model and app_version apply only to mobile-type sites (legacy: app) tracked via SDK."
  );
