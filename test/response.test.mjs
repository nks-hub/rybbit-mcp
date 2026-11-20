import assert from "node:assert/strict";
import { test } from "node:test";
import { fitToLimit, jsonResult } from "../build/response.js";
import { connect } from "./helpers.mjs";

const rows = (n) => Array.from({ length: n }, (_, i) => ({ id: i, label: "x".repeat(90) }));

test("fitToLimit leaves a payload under the cap untouched", () => {
  const payload = { data: rows(3), totalCount: 3 };
  assert.equal(fitToLimit(payload, 1000), payload);
});

test("fitToLimit drops trailing rows and reports how many are left", () => {
  const out = fitToLimit({ data: rows(100), totalCount: 100 }, 2000);
  assert.ok(JSON.stringify(out).length <= 2000);
  assert.equal(out.truncated, true);
  assert.equal(out.totalCount, 100);
  assert.ok(out.data.length > 0 && out.data.length < 100);
  assert.deepEqual(out.data[0], { id: 0, label: "x".repeat(90) });
  assert.match(out.note, new RegExp(`Showing ${out.data.length} of the 100 rows in 'data'`));
});

test("fitToLimit keeps an existing note", () => {
  const out = fitToLimit({ data: rows(100), note: "Filter ignored." }, 2000);
  assert.match(out.note, /^Filter ignored\. Showing /);
});

test("fitToLimit returns a marked partial when there are no rows to drop", () => {
  const out = fitToLimit({ data: { blob: "y".repeat(5000) } }, 2000);
  assert.equal(out.truncated, true);
  assert.ok(JSON.stringify(out).length <= 2000);
  assert.ok(out.partial.startsWith('{"data":{"blob":"yyy'));
});

test("jsonResult sends identical JSON as text and structuredContent", () => {
  const res = jsonResult({ data: rows(500) });
  assert.deepEqual(JSON.parse(res.content[0].text), res.structuredContent);
  assert.equal(res.structuredContent.truncated, true);
});

test("an oversized tool response is cut in both copies and still matches the output schema", async () => {
  const sessions = Array.from({ length: 200 }, (_, i) => ({ session_id: `s${i}`, entry_page: "/".padEnd(900, "a") }));
  const mcp = await connect(() => ({ data: sessions }));
  try {
    const res = await mcp.call("rybbit_list_sessions", { siteId: 1, limit: 200 });
    assert.deepEqual(JSON.parse(res.text), res.structuredContent);
    assert.equal(res.structuredContent.truncated, true);
    assert.ok(res.text.length <= 16000);
    assert.ok(res.structuredContent.data.length < 200);
  } finally {
    await mcp.close();
  }
});
