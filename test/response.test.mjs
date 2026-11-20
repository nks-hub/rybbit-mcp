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

test("fitToLimit cuts the nested rows of a single row that is over the cap", () => {
  const out = fitToLimit({ data: [{ id: "a", items: rows(100) }, { id: "b", items: [] }], totalCount: 100 }, 2000);
  assert.ok(JSON.stringify(out).length <= 2000);
  assert.equal(out.truncated, true);
  assert.equal(out.totalCount, 100);
  assert.equal(out.data.length, 1);
  assert.deepEqual(Object.keys(out.data[0]), ["id", "items"]);
  assert.ok(out.data[0].items.length > 0 && out.data[0].items.length < 100);
  assert.match(out.note, new RegExp(`Showing ${out.data[0].items.length} of the 100 rows in 'items' of the first of 2 rows in 'data'`));
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

const organization = (sites, name = "Demo Org") => [
  {
    id: "org1",
    name,
    role: "owner",
    sites: Array.from({ length: sites }, (_, i) => ({ id: String(i), domain: `site-${i}.example.com`, name: `Site ${i}` })),
  },
];

test("list_sites stays valid when its only organization is over the cap", async () => {
  const mcp = await connect(() => organization(300));
  try {
    const res = await mcp.call("rybbit_list_sites");
    assert.equal(res.isError, undefined);
    assert.ok(res.text.length <= 16000);
    assert.deepEqual(JSON.parse(res.text), res.structuredContent);
    const { data, truncated, note, totalCount } = res.structuredContent;
    assert.equal(truncated, true);
    assert.equal(totalCount, 300);
    assert.equal(data.length, 1);
    assert.equal(data[0].name, "Demo Org");
    assert.ok(data[0].sites.length > 0 && data[0].sites.length < 300);
    assert.match(note, new RegExp(`Showing ${data[0].sites.length} of the 300 rows in 'sites'`));
  } finally {
    await mcp.close();
  }
});

test("a response that cannot be cut row by row comes back as an error, not a schema failure", async () => {
  const mcp = await connect(() => organization(0, "n".repeat(20000)));
  try {
    const res = await mcp.call("rybbit_list_sites");
    assert.equal(res.isError, true);
    assert.equal(res.structuredContent, undefined);
    assert.match(res.text, /^Error: The response is \d+ characters, over the 16000 character cap/);
    assert.ok(res.text.length <= 16000);
  } finally {
    await mcp.close();
  }
});
