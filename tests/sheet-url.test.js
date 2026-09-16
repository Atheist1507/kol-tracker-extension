const test = require("node:test");
const assert = require("node:assert");
const KT = require("./load");

test("link publish-to-web CSV giữ nguyên", () => {
  const url = "https://docs.google.com/spreadsheets/d/e/2PACX-abc/pub?gid=0&single=true&output=csv";
  const res = KT.toCsvUrl(url);
  assert.strictEqual(res.kind, "publish");
  assert.ok(res.url.includes("output=csv"));
  assert.ok(res.url.includes("gid=0"));
});

test("link publish thiếu output=csv thì tự thêm", () => {
  const res = KT.toCsvUrl("https://docs.google.com/spreadsheets/d/e/2PACX-abc/pub?gid=7&single=true");
  assert.ok(res.url.includes("output=csv"));
});

test("link pubhtml đổi sang pub + csv", () => {
  const res = KT.toCsvUrl("https://docs.google.com/spreadsheets/d/e/2PACX-abc/pubhtml?gid=9&single=true");
  assert.ok(res.url.includes("/pub?"));
  assert.ok(res.url.includes("output=csv"));
  assert.ok(res.url.includes("gid=9"));
});

test("link /edit#gid= đổi sang export CSV và có cảnh báo về quyền chia sẻ", () => {
  const res = KT.toCsvUrl("https://docs.google.com/spreadsheets/d/1AbC/edit#gid=42");
  assert.strictEqual(res.kind, "export");
  assert.ok(res.url.includes("/d/1AbC/export"));
  assert.ok(res.url.includes("format=csv"));
  assert.ok(res.url.includes("gid=42"));
  assert.ok(res.warning);
});

test("link /edit không có gid thì mặc định tab đầu tiên", () => {
  const res = KT.toCsvUrl("https://docs.google.com/spreadsheets/d/1AbC/edit");
  assert.ok(res.url.includes("gid=0"));
});

test("link không phải Google Sheets bị từ chối", () => {
  assert.ok(KT.toCsvUrl("https://example.com/data.csv").error);
  assert.ok(KT.toCsvUrl("https://docs.google.com/document/d/1/edit").error);
  assert.ok(KT.toCsvUrl("không phải url").error);
  assert.ok(KT.toCsvUrl("").error);
});

test("phân biệt được CSV thật với trang HTML Google trả về khi dán nhầm link", () => {
  assert.strictEqual(KT.looksLikeCsv("handle,tier\n@a,S"), true);
  assert.strictEqual(KT.looksLikeCsv("<!DOCTYPE html><html>…"), false);
  assert.strictEqual(KT.looksLikeCsv(""), false);
});
