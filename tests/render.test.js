const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const KT = require("./load");

const ROOT = path.join(__dirname, "..");
const kolRows = KT.parseTable(fs.readFileSync(path.join(ROOT, "sheet-templates/KOLs.csv"), "utf8")).rows;
const callRows = KT.parseTable(fs.readFileSync(path.join(ROOT, "sheet-templates/Calls.csv"), "utf8")).rows;
const db = KT.buildDb(kolRows, callRows, {});

test("file mẫu trong sheet-templates/ vẫn parse ra đúng dữ liệu", () => {
  assert.strictEqual(db.counts.kols, 2);
  assert.strictEqual(KT.lookup(db, "cryptoape").calls.length, 2);
});

test("dựng được thẻ chi tiết từ đầu tới cuối mà không ném lỗi", () => {
  const html = KT.render.detailHtml(KT.lookup(db, "cryptoape"), { sheetUrl: "https://docs.google.com/x" });
  assert.ok(html.includes("cryptoape"));
  assert.ok(html.includes("PEPE"));
  assert.ok(html.includes("Win rate"));
});

test("cờ đỏ hiện ra trên thẻ, và ô có dấu phẩy không làm lệch cột", () => {
  const moonboy = KT.lookup(db, "moonboy");
  assert.strictEqual(moonboy.addedBy, "Nix");
  assert.ok(moonboy.redFlags.startsWith("Xả ngay"));
  const html = KT.render.detailHtml(moonboy, {});
  assert.ok(html.includes("Cờ đỏ"));
  assert.ok(html.includes("Xả ngay"));
});

test("người chưa có call nào không làm vỡ phần thống kê", () => {
  const solo = KT.buildDb([{ handle: "newguy", tier: "B", extra: {} }], [], {});
  const html = KT.render.detailHtml(KT.lookup(solo, "newguy"), {});
  assert.ok(html.includes("Chưa log call nào"));
  assert.ok(!html.includes("NaN"));
});

test("nội dung từ Sheet được escape trước khi chèn vào trang GMGN", () => {
  const evil = KT.buildDb(
    [{ handle: "evil", description: '<img src=x onerror="alert(1)">', extra: {} }],
    [],
    {}
  );
  const html = KT.render.detailHtml(KT.lookup(evil, "evil"), {});
  assert.ok(!html.includes("<img src=x"));
  assert.ok(html.includes("&lt;img"));
});

test("avatar_url không phải http(s) thì không được lọt vào thuộc tính src", () => {
  const evil = KT.buildDb(
    [{ handle: "evil", avatar_url: "javascript:alert(1)", extra: {} }],
    [],
    {}
  );
  const html = KT.render.detailHtml(KT.lookup(evil, "evil"), {});
  assert.ok(!html.includes("javascript:"));
});

test("danh sách 'ai đã call token này' dựng được", () => {
  const html = KT.render.tokenHtml("PEPE", KT.callsForToken(db, "PEPE"));
  assert.ok(html.includes("2 người đã call"));
  assert.ok(html.includes("call sớm nhất"));
});

test("timeAgo nói tiếng Việt và không âm", () => {
  assert.strictEqual(KT.timeAgo(Date.now() - 5 * 60000), "5 phút trước");
  assert.strictEqual(KT.timeAgo(Date.now() - 3 * 86400000), "3 ngày trước");
  assert.strictEqual(KT.timeAgo(0), "");
});

test("hệ số nhân hiển thị gọn", () => {
  assert.strictEqual(KT.fmtMultiple(5), "x5");
  assert.strictEqual(KT.fmtMultiple(1.5), "x1.5");
  assert.strictEqual(KT.fmtMultiple(0.3), "x0.3");
});
