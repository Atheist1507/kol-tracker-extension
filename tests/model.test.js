const test = require("node:test");
const assert = require("node:assert");
const KT = require("./load");

const W1 = "0xf1b6a4d6aecc5a618ade56a53fa9956ea508e16c";
const W2 = "0xaaa2222222222222222222222222222222222222";

const OVERVIEW = [
  { wallet: W1.toUpperCase(), username: "@randomguytradin", display_name: "marv", tier: "S",
    summary: "đọc contract trước khi vào", followers: "8", extra: {} },
  { wallet: W2, username: "moonboy", tier: "C", red_flags: "xả ngay sau khi hô", extra: {} },
];

const DETAIL = [
  { wallet: W1, username: "randomguytradin", noted_at: "2026-09-10T10:00:00Z", token: "PEPE",
    token_address: "0xtok1", note: "call sớm, có luận điểm", chart_position: "đầu sóng",
    multiplier_at_note: "5", holding_state: "holding", extra: {} },
  { wallet: W1, username: "randomguytradin", noted_at: "2026-09-12T10:00:00Z", token: "WIF",
    token_address: "0xtok2", note: "lần này hô xong xả", holding_state: "sold_all", extra: {} },
  { wallet: W2, username: "moonboy", noted_at: "2026-09-11T10:00:00Z", token: "PEPE",
    token_address: "0xtok1", note: "đu đỉnh", chart_position: "đu đỉnh", extra: {} },
  { wallet: "0xghost000000000000000000000000000000000", username: "nguoila",
    noted_at: "2026-09-13T10:00:00Z", token: "BONK", extra: {} },
];

const db = KT.buildDb(OVERVIEW, DETAIL);

test("đếm người có hồ sơ và tổng số note", () => {
  assert.strictEqual(db.counts.people, 2);
  assert.strictEqual(db.counts.notes, 4);
});

test("ví viết hoa hay thường đều là một người", () => {
  const p = KT.findPerson(db, { wallet: W1 });
  assert.ok(p);
  assert.strictEqual(p.wallet, W1);
  assert.strictEqual(KT.findPerson(db, { wallet: W1.toUpperCase() }), p);
});

test("note gom đúng về chủ, mới nhất trước", () => {
  const p = KT.findPerson(db, { wallet: W1 });
  assert.strictEqual(p.noteCount, 2);
  assert.strictEqual(p.notes[0].token, "WIF");
});

test("tra được bằng username khi chưa biết ví", () => {
  assert.strictEqual(KT.findPerson(db, { username: "@moonboy" }).wallet, W2);
});

test("VÍ được ưu tiên hơn username — đây là lý do đổi khoá", () => {
  // Cùng lúc gửi ví của người 1 và username của người 2 → phải ra người 1
  const p = KT.findPerson(db, { wallet: W1, username: "moonboy" });
  assert.strictEqual(p.wallet, W1);
});

test("note của ví chưa có dòng Overview vẫn tra ra được, đánh dấu ghost", () => {
  const ghost = KT.findPerson(db, { username: "nguoila" });
  assert.ok(ghost);
  assert.strictEqual(ghost.ghost, true);
  assert.strictEqual(ghost.noteCount, 1);
  assert.strictEqual(db.counts.people, 2, "ghost không tính vào số người có hồ sơ");
});

test("phát hiện đổi username: cùng ví, khác tên", () => {
  const p = KT.findPerson(db, { wallet: W1 });
  assert.strictEqual(KT.renamedFrom(p, { wallet: W1, username: "ten_moi_toanh" }), "randomguytradin");
  assert.strictEqual(KT.renamedFrom(p, { wallet: W1, username: "@randomguytradin" }), "");
});

test("khác ví thì KHÔNG báo đổi tên (hai người khác nhau)", () => {
  const p = KT.findPerson(db, { wallet: W1 });
  assert.strictEqual(KT.renamedFrom(p, { wallet: W2, username: "ten_khac" }), "");
});

test("tra theo token: ai đã được note ở token này", () => {
  assert.strictEqual(db.byToken["0xtok1"].length, 2);
});

test("tìm theo tên, theo ví, theo chữ trong ghi chú", () => {
  assert.strictEqual(KT.search(db, "moonboy")[0].person.wallet, W2);
  assert.strictEqual(KT.search(db, W1)[0].person.wallet, W1);
  assert.strictEqual(KT.search(db, "contract")[0].person.wallet, W1);
});

test("truy vấn rỗng không trả về cả kho", () => {
  assert.deepStrictEqual(KT.search(db, "  "), []);
});

test("db rỗng không ném lỗi", () => {
  const empty = KT.buildDb([], []);
  assert.deepStrictEqual(empty.people, []);
  assert.strictEqual(KT.findPerson(empty, { wallet: "0x1" }), null);
  assert.strictEqual(KT.renamedFrom(null, null), "");
});
