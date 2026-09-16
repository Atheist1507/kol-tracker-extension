const test = require("node:test");
const assert = require("node:assert");
const KT = require("./load");

const KOLS = [
  { handle: "CryptoApe", aliases: "Ape, khỉ", tier: "S", description: "hay call presale kỹ thuật", avatar_url: "https://pbs.twimg.com/profile_images/1/ape_normal.jpg", extra: {} },
  { handle: "moonboy", tier: "C", red_flags: "xả ngay sau khi call", extra: {} },
  { handle: "", tier: "S", extra: {} },
];

const CALLS = [
  { handle: "CryptoApe", token: "$PEPE", called_at: "2026-01-02", result: "x5", chart_position: "đầu sóng", extra: {} },
  { handle: "cryptoape", token: "WIF", called_at: "2026-02-10", result: "x0.4", extra: {} },
  { handle: "moonboy", token: "pepe", called_at: "2026-01-05", result: "sai", chart_position: "đu đỉnh", extra: {} },
  { handle: "ghostcaller", token: "BONK", called_at: "2026-03-01", result: "x2", extra: {} },
];

const db = KT.buildDb(KOLS, CALLS, {});

test("hàng không có handle bị bỏ qua", () => {
  assert.strictEqual(db.counts.kols, 2);
});

test("alias tra ra đúng người", () => {
  assert.strictEqual(KT.lookup(db, "Ape").handle, "CryptoApe");
  assert.strictEqual(KT.lookup(db, "khỉ").handle, "CryptoApe");
});

test("call viết hoa/thường khác nhau vẫn gộp về một người", () => {
  assert.strictEqual(KT.lookup(db, "@cryptoape").calls.length, 2);
});

test("handle chỉ có trong tab Calls vẫn tra được, đánh dấu là chưa có hồ sơ", () => {
  const ghost = KT.lookup(db, "ghostcaller");
  assert.ok(ghost);
  assert.strictEqual(ghost.ghost, true);
  assert.strictEqual(ghost.calls.length, 1);
  assert.strictEqual(db.counts.kols, 2, "ghost không được tính vào số KOL có hồ sơ");
});

test("call sắp xếp mới nhất trước", () => {
  assert.strictEqual(KT.lookup(db, "cryptoape").calls[0].token, "WIF");
});

test("tra theo URL avatar bỏ qua hậu tố kích thước", () => {
  const kol = KT.lookupByAvatar(db, "https://pbs.twimg.com/profile_images/1/ape_400x400.jpg");
  assert.strictEqual(kol.handle, "CryptoApe");
});

test("gõ đúng handle thì người đó đứng đầu, không phải người tier cao hơn", () => {
  const hits = KT.search(db, "moonboy");
  assert.strictEqual(hits[0].kol.handle, "moonboy");
});

test("tìm được theo chữ trong mô tả", () => {
  const hits = KT.search(db, "presale");
  assert.strictEqual(hits[0].kol.handle, "CryptoApe");
});

test("tìm theo token ra những người đã call token đó", () => {
  const hits = KT.search(db, "$PEPE");
  const names = hits.map((h) => h.kol.handle);
  assert.ok(names.includes("CryptoApe"));
  assert.ok(names.includes("moonboy"));
});

test("ai call token này — xếp người call SỚM nhất lên đầu", () => {
  const rows = KT.callsForToken(db, "pepe");
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0].kol.handle, "CryptoApe");
});

test("stats dựng sẵn cho từng người", () => {
  const ape = KT.lookup(db, "cryptoape");
  assert.strictEqual(ape.stats.total, 2);
  assert.strictEqual(ape.stats.win, 1);
  assert.strictEqual(ape.stats.loss, 1);
});

test("truy vấn rỗng không trả về cả kho", () => {
  assert.deepStrictEqual(KT.search(db, "  "), []);
  assert.deepStrictEqual(KT.callsForToken(db, ""), []);
});

test("db rỗng không ném lỗi", () => {
  const empty = KT.buildDb([], [], {});
  assert.deepStrictEqual(empty.kols, []);
  assert.strictEqual(KT.lookup(empty, "ai đó"), null);
});
