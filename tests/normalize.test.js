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

// GMGN bọc ảnh Twitter qua proxy của nó (quan sát trên trang thật 17/09/2026).
// Không gỡ lớp này ra thì overlay không khớp được avatar nào.
test("gỡ proxy ảnh: URL bọc và URL gốc cho cùng một khoá", () => {
  const goc = "https://pbs.twimg.com/profile_images/1/abc_400x400.jpg";
  const boc = "https://gmgn.ai/external/img?url=" + encodeURIComponent(goc) + "&w=96&q=75";
  assert.strictEqual(KT.avatarKey(boc), KT.avatarKey(goc));
});

test("gỡ proxy rồi vẫn bỏ được hậu tố kích thước của Twitter", () => {
  const boc = "https://gmgn.ai/external/img?url=" +
    encodeURIComponent("https://pbs.twimg.com/profile_images/1/abc_normal.jpg");
  assert.strictEqual(KT.avatarKey(boc), KT.avatarKey("https://pbs.twimg.com/profile_images/1/abc.jpg"));
});

test("proxy nhét URL vào đường dẫn thay vì query", () => {
  const goc = "https://pbs.twimg.com/profile_images/1/abc.jpg";
  const boc = "https://gmgn.ai/img/" + encodeURIComponent(goc);
  assert.strictEqual(KT.avatarKey(boc), KT.avatarKey(goc));
});

test("URL thường không bị đụng vào", () => {
  const u = "https://example.com/a/b.jpg?w=100";
  assert.strictEqual(KT.unwrapProxyUrl(u), u);
  assert.strictEqual(KT.unwrapProxyUrl("không phải url"), "không phải url");
  assert.strictEqual(KT.unwrapProxyUrl(""), "");
});

test("proxy lồng proxy vẫn về tới URL trong cùng", () => {
  const goc = "https://pbs.twimg.com/profile_images/1/abc.jpg";
  const l1 = "https://cdn.a/img?url=" + encodeURIComponent(goc);
  const l2 = "https://gmgn.ai/external/img?url=" + encodeURIComponent(l1);
  assert.strictEqual(KT.avatarKey(l2), KT.avatarKey(goc));
});
