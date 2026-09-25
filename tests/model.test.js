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

/* ---------- nhận ra người đổi tên qua post_id ---------- */

const DB_RENAME = () =>
  KT.buildDb(
    [{ wallet: "", username: "ten_cu", display_name: "Ai Đó", tier: "A" }],
    [{ wallet: "", username: "ten_cu", post_id: "post-1", noted_at: "12/08/2026 lúc 09:00", note: "call sớm" }]
  );

test("cùng bài call mà tên khác = chính nó đổi tên", () => {
  const found = KT.findRenames(DB_RENAME(), [{ postId: "post-1", username: "ten_moi" }]);
  assert.strictEqual(found.length, 1);
  assert.strictEqual(found[0].tenCu, "ten_cu");
  assert.strictEqual(found[0].tenMoi, "ten_moi");
});

test("cùng tên thì không báo đổi tên", () => {
  assert.deepStrictEqual(KT.findRenames(DB_RENAME(), [{ postId: "post-1", username: "TEN_CU" }]), []);
});

test("bài call chưa ghi bao giờ thì không kết luận gì", () => {
  assert.deepStrictEqual(KT.findRenames(DB_RENAME(), [{ postId: "post-lạ", username: "ai_do" }]), []);
});

test("đổi tên rồi thì tra bằng post_id vẫn ra ĐÚNG hồ sơ cũ", () => {
  // Thiếu cái này thì mỗi lần nó đổi tên là Sheet đẻ thêm một hồ sơ trắng,
  // còn lịch sử cũ nằm lại ở cái tên không ai tra nữa
  const person = KT.findPerson(DB_RENAME(), { username: "ten_moi", postId: "post-1" });
  assert.ok(person, "phải tra ra người cũ");
  assert.strictEqual(person.tierLetter, "A");
});

test("người KHÔNG có ví vẫn báo được đổi tên, bằng chứng là bài call", () => {
  // renamedFrom đòi ví trùng mới dám kết luận — người trên chart không có ví
  // nên nó im lặng mãi mãi
  const db = DB_RENAME();
  const person = KT.findPerson(db, { username: "ten_moi", postId: "post-1" });
  assert.strictEqual(KT.renamedFrom(person, { username: "ten_moi" }), "");
  assert.strictEqual(KT.renamedFromPost(db, person, { username: "ten_moi", postId: "post-1" }), "ten_cu");
});

test("ghi chú cho người đã đổi tên phải rơi vào ĐÚNG dòng cũ", () => {
  // Khoá lấy từ hồ sơ tra ra được, không phải từ cái tên mới — bằng không
  // Sheet có hai dòng cho một người và lịch sử cũ nằm lại ở tên không ai tra
  const db = KT.buildDb(
    [{ wallet: "x:ten_cu", username: "ten_cu" }],
    [{ wallet: "x:ten_cu", username: "ten_cu", post_id: "post-1" }]
  );
  const person = KT.findPerson(db, { username: "ten_moi", postId: "post-1" });
  assert.strictEqual(person.wallet, "x:ten_cu");
});

/* ---------- dấu gạch dưới: hai tài khoản khác nhau (25/09/2026) ---------- */

test("tra foobar KHÔNG ra hồ sơ của foo_bar", () => {
  const db = KT.buildDb([{ wallet: "x:foo_bar", username: "foo_bar", tier: "S" }], []);
  assert.strictEqual(KT.findPerson(db, { username: "foobar" }), null);
  assert.strictEqual(KT.findPerson(db, { username: "@Foo_Bar" }).tier, "S");
});

test("người cũ ghi trước bản sửa (khoá x: không có _) vẫn tra ra đúng dòng cũ qua cột username", () => {
  const db = KT.buildDb(
    [{ wallet: "x:cryptoape", username: "crypto_ape", tier: "A" }],
    [{ wallet: "x:cryptoape", username: "crypto_ape", note: "cũ" }]
  );
  const p = KT.findPerson(db, { username: "crypto_ape" });
  assert.strictEqual(p.wallet, "x:cryptoape"); // ghi chú mới sẽ rơi vào ĐÚNG dòng cũ
  assert.strictEqual(p.noteCount, 1);
  assert.deepStrictEqual(p.mergedNames, []);
});

test("hồ sơ bị lỗi cũ gộp nhầm hai tài khoản chỉ khác dấu _ thì bị báo ra", () => {
  const db = KT.buildDb(
    [{ wallet: "x:foobar", username: "foobar" }],
    [
      { wallet: "x:foobar", username: "foobar", note: "a" },
      { wallet: "x:foobar", username: "foo_bar", note: "b" },
    ]
  );
  assert.deepStrictEqual(db.people[0].mergedNames.sort(), ["foo_bar", "foobar"]);
  assert.strictEqual(db.counts.merged, 1);
});

test("đổi tên hẳn (khác nhau không chỉ ở dấu _) KHÔNG bị báo là gộp nhầm", () => {
  const db = KT.buildDb(
    [{ wallet: "0xabc", username: "newname" }],
    [{ wallet: "0xabc", username: "oldname", note: "a" }]
  );
  assert.deepStrictEqual(db.people[0].mergedNames, []);
});

test("ô tìm kiếm vẫn dễ dãi: gõ 'cryptoape' ra @crypto_ape, khớp chính xác xếp trên", () => {
  const db = KT.buildDb(
    [
      { wallet: "0x1", username: "crypto_ape" },
      { wallet: "0x2", username: "cryptoape" },
    ],
    []
  );
  const hits = KT.search(db, "cryptoape").map((h) => h.person.username);
  assert.deepStrictEqual(hits, ["cryptoape", "crypto_ape"]);
});
