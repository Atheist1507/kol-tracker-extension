const test = require("node:test");
const assert = require("node:assert");
const KT = require("./load");

test("URL profile, @ và khoảng trắng quy về cùng một khoá", () => {
  const k = KT.handleKey("@CryptoApe");
  assert.strictEqual(KT.handleKey("https://x.com/CryptoApe"), k);
  assert.strictEqual(KT.handleKey("twitter.com/@cryptoape"), k);
  assert.strictEqual(KT.handleKey("  Crypto Ape "), k);
  assert.strictEqual(KT.handleKey("crypto_ape"), k);
});

test("link tới một tweet cụ thể vẫn ra handle của chủ tweet", () => {
  assert.strictEqual(KT.displayHandle("https://x.com/foo/status/123456"), "foo");
});

test("tên có dấu tiếng Việt vẫn tra được", () => {
  assert.strictEqual(KT.handleKey("Tướng Tá"), KT.handleKey("tuongta"));
});

test("handle rỗng cho khoá rỗng (không được gom thành một người vô danh)", () => {
  assert.strictEqual(KT.handleKey(""), "");
  assert.strictEqual(KT.handleKey("   "), "");
});

test("avatar Twitter: bỏ hậu tố kích thước và query", () => {
  const a = KT.avatarKey("https://pbs.twimg.com/profile_images/1/abc_normal.jpg");
  assert.strictEqual(KT.avatarKey("https://pbs.twimg.com/profile_images/1/abc_400x400.jpg"), a);
  assert.strictEqual(KT.avatarKey("https://pbs.twimg.com/profile_images/1/abc.jpg?v=2"), a);
});

test("token bỏ $ và khoảng trắng", () => {
  assert.strictEqual(KT.tokenKey(" $pepe "), "PEPE");
});

test("aliases tách được bằng phẩy, chấm phẩy, gạch đứng, xuống dòng", () => {
  assert.deepStrictEqual(KT.splitList("a, b; c|d\ne"), ["a", "b", "c", "d", "e"]);
});

test("tier: 'Hạng A' không bị đọc thành T của chữ tier", () => {
  assert.strictEqual(KT.tierLetter("Hạng A"), "A");
  assert.strictEqual(KT.tierLetter("Tier S"), "S");
  assert.strictEqual(KT.tierLetter("S+"), "S");
  assert.strictEqual(KT.tierLetter(""), "");
});

test("tier chưa xếp hạng xuống cuối khi sắp xếp", () => {
  assert.ok(KT.tierRank("S") < KT.tierRank("C"));
  assert.ok(KT.tierRank("C") < KT.tierRank(""));
});
