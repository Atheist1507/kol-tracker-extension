const test = require("node:test");
const assert = require("node:assert");
const KT = require("./load");

test("URL profile, @ và khoảng trắng quy về cùng một khoá", () => {
  const k = KT.handleKey("@CryptoApe");
  assert.strictEqual(KT.handleKey("https://x.com/CryptoApe"), k);
  assert.strictEqual(KT.handleKey("twitter.com/@cryptoape"), k);
  assert.strictEqual(KT.handleKey("  Crypto Ape "), k);
});

// ⚠ Test này từng khoá điều NGƯỢC LẠI ("crypto_ape" ≡ "cryptoape"). Đổi theo
// quyết định 25/09/2026: trên X đó là HAI tài khoản khác nhau, gộp làm một là
// dán ghi chú/hạng của người này lên người kia.
test("dấu gạch dưới là một phần của tên: foo_bar và foobar là hai người", () => {
  assert.notStrictEqual(KT.handleKey("crypto_ape"), KT.handleKey("cryptoape"));
  assert.strictEqual(KT.handleKey("@Crypto_Ape"), KT.handleKey("x.com/crypto_ape"));
});

test("khoá dễ dãi (chỉ cho ô tìm kiếm) vẫn bỏ qua dấu gạch dưới", () => {
  assert.strictEqual(KT.looseHandleKey("crypto_ape"), KT.looseHandleKey("Crypto Ape"));
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

// URL thật lấy từ tooltip GMGN (17/09/2026): ảnh KHÔNG nằm ở pbs.twimg.com mà
// ở bucket riêng, và hậu tố cỡ ảnh là "_small" chứ không phải "_normal".
test("hậu tố cỡ ảnh của bucket GMGN đang dùng", () => {
  const base = "https://prod-fomo-profile-pics.s3.amazonaws.com/d98b47e147219beacb43a82e189ea285";
  const k = KT.avatarKey(base + "_small.jpg");
  assert.strictEqual(KT.avatarKey(base + "_large.jpg"), k);
  assert.strictEqual(KT.avatarKey(base + ".jpg"), k);
});

// Chẩn đoán trên $CASHCAT (18/09/2026): API trả /defi/images/twitter/<md5>.jpg
// còn thẻ <img> trên trang dùng /external-res/<md5>_v2.webp. Cùng một ảnh, hai
// URL — so nguyên URL thì chỉ 7/71 avatar khớp được.
test("cùng một avatar phục vụ qua hai đường của GMGN vẫn là một", () => {
  const api = "https://gmgn.ai/defi/images/twitter/629e7bf29d935b8901225741bb0754bd.jpg";
  const trang = "https://gmgn.ai/external-res/629e7bf29d935b8901225741bb0754bd_v2.webp";
  assert.strictEqual(KT.avatarKey(api), KT.avatarKey(trang));
});

test("hai người khác nhau thì hash khác nhau, không gộp bừa", () => {
  const a = "https://gmgn.ai/external-res/629e7bf29d935b8901225741bb0754bd_v2.webp";
  const b = "https://gmgn.ai/external-res/d3a2ce6af2d57d8d2490582b7f872b20_v2.webp";
  assert.notStrictEqual(KT.avatarKey(a), KT.avatarKey(b));
});

// Chỉ rút gọn khi tên file ĐÚNG là một hash 32 ký tự hex — đường dẫn thường
// phải giữ nguyên, nếu không hai ảnh khác nhau có thể đụng vào nhau.
test("URL thường không bị rút thành hash", () => {
  assert.strictEqual(
    KT.avatarKey("https://pbs.twimg.com/profile_images/123/abc_normal.jpg"),
    "pbs.twimg.com/profile_images/123/abc.jpg"
  );
  assert.strictEqual(KT.avatarKey("https://gmgn.ai/static/no_message.svg"), "gmgn.ai/static/no_message.svg");
});
