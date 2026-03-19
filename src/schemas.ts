/**
 * Shared Zod schemas for MCP tool inputs.
 */

import { z } from "zod";

export const siteIdSchema = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .describe("Site ID (numeric ID or domain identifier)");

export const filterSchema = z.object({
  parameter: z
    .string()
    .describe(
      "Filter dimension: browser, operating_system, language, country, region, city, device_type, referrer, hostname, pathname, page_title, querystring, event_name, channel, utm_source, utm_medium, utm_campaign, utm_term, utm_content, entry_page, exit_page, user_id. Note: user_id filter checks BOTH the device hash (user_id) and app-provided ID (identified_user_id)."
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
  .optional()
  .describe("Time bucket granularity (default: day). Use 'hour' for last 24h, 'week'/'month' for long ranges");

export const paginationSchema = {
  page: z.number().int().min(1).optional().describe("Page number, 1-indexed (default: 1)"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe("Results per page (default: 20-50 depending on endpoint, max 200)"),
};

export const metricParameterSchema = z
  .enum([
    "browser",
    "operating_system",
    "language",
    "country",
    "region",
    "city",
    "device_type",
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
  ])
  .describe("Metric dimension to break down by");
