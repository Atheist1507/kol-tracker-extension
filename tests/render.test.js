const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const KT = require("./load");

const ROOT = path.join(__dirname, "..");
const overview = KT.parseTable(fs.readFileSync(path.join(ROOT, "sheet-templates/Overview.csv"), "utf8")).rows;
const detail = KT.parseTable(fs.readFileSync(path.join(ROOT, "sheet-templates/Detail.csv"), "utf8")).rows;
const db = KT.buildDb(overview, detail);

test("file mẫu trong sheet-templates/ vẫn parse ra đúng dữ liệu", () => {
  assert.strictEqual(db.counts.people, 2);
  assert.strictEqual(db.counts.notes, 3);
  assert.strictEqual(KT.findPerson(db, { username: "randomguytradin" }).noteCount, 2);
});

test("ô có dấu phẩy trong file mẫu không làm lệch cột", () => {
  const p = KT.findPerson(db, { username: "moonboy" });
  assert.strictEqual(p.addedBy, "Nix");
  assert.ok(p.redFlags.startsWith("Hô xong xả sạch"));
});

test("dựng thẻ chi tiết từ đầu tới cuối mà không ném lỗi", () => {
  const html = KT.render.personDetail(KT.findPerson(db, { username: "randomguytradin" }), {});
  assert.ok(html.includes("randomguytradin"));
  assert.ok(html.includes("PEPE"));
  assert.ok(html.includes("Ghi chú"));
  assert.ok(!html.includes("NaN"));
});

test("cờ đỏ hiện ra trên thẻ", () => {
  const html = KT.render.personDetail(KT.findPerson(db, { username: "moonboy" }), {});
  assert.ok(html.includes("Cờ đỏ"));
});

test("người chưa có ghi chú nào không làm vỡ phần hiển thị", () => {
  const solo = KT.buildDb([{ wallet: "0xnew", username: "newguy", tier: "B", extra: {} }], []);
  const html = KT.render.personDetail(KT.findPerson(solo, { wallet: "0xnew" }), {});
  assert.ok(html.includes("Chưa ghi chú gì"));
  assert.ok(!html.includes("NaN"));
});

test("báo đổi tên hiện ngay trên thẻ", () => {
  const person = KT.findPerson(db, { username: "moonboy" });
  const html = KT.render.personDetail(person, { renamedFrom: "ten_cu" });
  assert.ok(html.includes("đã đổi tên từ @ten_cu"));
});

test("nội dung từ Sheet được escape trước khi chèn vào trang GMGN", () => {
  const evil = KT.buildDb(
    [{ wallet: "0xe", username: "evil", summary: '<img src=x onerror="alert(1)">', extra: {} }],
    []
  );
  const html = KT.render.personDetail(KT.findPerson(evil, { wallet: "0xe" }), {});
  assert.ok(!html.includes("<img src=x"));
  assert.ok(html.includes("&lt;img"));
});

test("post của người lạ cũng được escape", () => {
  const evil = KT.buildDb(
    [{ wallet: "0xe", username: "evil", extra: {} }],
    [{ wallet: "0xe", username: "evil", note: "ok", post_text: "<script>x</script>", extra: {} }]
  );
  const html = KT.render.personDetail(KT.findPerson(evil, { wallet: "0xe" }), {});
  assert.ok(!html.includes("<script>"));
});

test("avatar_url không phải http(s) thì không lọt vào thuộc tính src", () => {
  const evil = KT.buildDb([{ wallet: "0xe", username: "evil", avatar_url: "javascript:alert(1)", extra: {} }], []);
  const html = KT.render.personDetail(KT.findPerson(evil, { wallet: "0xe" }), {});
  assert.ok(!html.includes("javascript:"));
});

test("dòng người đang trên chart: người lạ đánh dấu 'mới', cờ đỏ hiện nhãn xả", () => {
  const caller = KT.gmgn.normalizeMessage({
    username: "nguoila",
    wallet_address: "0xzzz",
    content: "send it",
    bought_amount: "100",
    sold_amount: "100",
    balance: "0",
  });
  const html = KT.render.callerRow(caller, null);
  assert.ok(html.includes("mới"));
  assert.ok(html.includes("đã xả sạch"));
});

test("ví rút gọn hai đầu cho vừa panel", () => {
  assert.strictEqual(KT.shortWallet("0xf1b6a4d6aecc5a618ade56a53fa9956ea508e16c"), "0xf1b6…e16c");
  assert.strictEqual(KT.shortWallet("0xabc"), "0xabc");
});

test("timeAgo nói tiếng Việt và không âm", () => {
  assert.strictEqual(KT.timeAgo(Date.now() - 5 * 60000), "5 phút trước");
  assert.strictEqual(KT.timeAgo(0), "");
});

test("hệ số nhân hiển thị gọn", () => {
  assert.strictEqual(KT.fmtMultiple(5), "x5");
  assert.strictEqual(KT.fmtMultiple(0.3), "x0.3");
  assert.strictEqual(KT.fmtMultiple(null), "");
});

test("x mấy cắt còn một chữ số thập phân, không kéo đuôi", () => {
  assert.strictEqual(KT.fmtMultiple(1.3456), "x1.3");
  assert.strictEqual(KT.fmtMultiple(2.96), "x3");
  assert.strictEqual(KT.fmtMultiple(9.949), "x9.9");
});

test("từ x10 trở lên thì lấy số nguyên — phần lẻ ở đó vô nghĩa", () => {
  assert.strictEqual(KT.fmtMultiple(12.345), "x12");
  assert.strictEqual(KT.fmtMultiple(143.7), "x144");
  assert.strictEqual(KT.fmtMultiple(1000), "x1000");
});

// Dưới x1 là đang LỖ, và ở đó hai chữ số mới phân biệt được mức độ: làm tròn
// một chữ số thì x0.05 (mất 95%) và x0.14 đều thành x0.1.
test("dưới x1 giữ hai chữ số", () => {
  assert.strictEqual(KT.fmtMultiple(0.3456), "x0.35");
  assert.strictEqual(KT.fmtMultiple(0.05), "x0.05");
  assert.strictEqual(KT.fmtMultiple(0.5), "x0.5");
});

test("số tròn không đẻ ra đuôi .0", () => {
  assert.strictEqual(KT.fmtMultiple(1), "x1");
  assert.strictEqual(KT.fmtMultiple(10), "x10");
  assert.strictEqual(KT.fmtMultiple(2.04), "x2");
  assert.strictEqual(KT.fmtMultiple(100.04), "x100"); // regex cũ suýt cắt thành x1
});

test("chuỗi từ Sheet và rác thì không làm vỡ dòng", () => {
  assert.strictEqual(KT.fmtMultiple("1.3456"), "x1.3");
  assert.strictEqual(KT.fmtMultiple("chưa rõ"), "");
  assert.strictEqual(KT.fmtMultiple(""), "");
});
