const test = require("node:test");
const assert = require("node:assert");
const KT = require("./load");

test("lấy được tay cầm từ đường dẫn hồ sơ", () => {
  assert.strictEqual(KT.xPage.handleFromPath("/FogoNFT"), "FogoNFT");
  assert.strictEqual(KT.xPage.handleFromPath("/FogoNFT/with_replies"), "FogoNFT");
  assert.strictEqual(KT.xPage.handleFromPath("/FogoNFT/media"), "FogoNFT");
});

test("trang chức năng KHÔNG phải hồ sơ", () => {
  // Sai chỗ này là nút Ghi chú mọc trên trang Cài đặt, bấm vào thì ghi một
  // người tên "settings" vào Sheet
  for (const p of ["/home", "/explore", "/settings/profile", "/i/flow/login", "/messages", "/"]) {
    assert.strictEqual(KT.xPage.handleFromPath(p), null, p + " không được ra tên người");
  }
});

test("trang một BÀI POST không phải trang hồ sơ", () => {
  assert.strictEqual(KT.xPage.handleFromPath("/FogoNFT/status/123456"), null);
  assert.strictEqual(KT.xPage.handleFromPath("/FogoNFT/status/123/photo/1"), null);
});

test("tay cầm sai dạng thì bỏ", () => {
  assert.strictEqual(KT.xPage.handleFromPath("/tên-có-dấu"), null);
  assert.strictEqual(KT.xPage.handleFromPath("/qua_dai_hon_muoi_lam_ky_tu"), null);
});

test("lấy id bài từ permalink, kể cả khi kèm /photo hay /analytics", () => {
  assert.strictEqual(KT.xPage.statusIdFromHref("/zachxbt/status/1968123456789012345"), "1968123456789012345");
  assert.strictEqual(KT.xPage.statusIdFromHref("/zachxbt/status/1968123456789012345/photo/1"), "1968123456789012345");
  assert.strictEqual(KT.xPage.statusIdFromHref("/zachxbt/status/1968123456789012345/analytics"), "1968123456789012345");
  assert.strictEqual(KT.xPage.statusIdFromHref("https://x.com/a/status/12345?s=20"), "12345");
});

test("link không phải bài thì không ra id", () => {
  for (const h of ["/zachxbt", "/zachxbt/status/abc", "/i/flow/login", "", null]) {
    assert.strictEqual(KT.xPage.statusIdFromHref(h), "", String(h) + " không được ra id");
  }
});

test("dựng link bài từ tay cầm + id", () => {
  assert.strictEqual(KT.xPage.statusUrl("zachxbt", "123"), "https://x.com/zachxbt/status/123");
  assert.strictEqual(KT.xPage.statusUrl("@zachxbt", "123"), "https://x.com/zachxbt/status/123");
  // Thiếu một nửa thì trả rỗng chứ đừng dựng link hỏng rồi ghi vào Sheet
  assert.strictEqual(KT.xPage.statusUrl("", "123"), "");
  assert.strictEqual(KT.xPage.statusUrl("zachxbt", ""), "");
});

test("ghép nguyên văn bài: GIỮ xuống dòng, gom emoji, bóp khoảng trắng", () => {
  // Bài call viết mỗi ý một dòng — dồn thành một đoạn liền là đọc lại không ra ý
  const got = KT.xPage.joinTweetText(["FOGO", "\n", "to 1B ", "🔥", "\n\n\n", "  ape now  "]);
  assert.strictEqual(got, "FOGO\nto 1B 🔥\n\nape now");
});

test("ghép bài rỗng ra chuỗi rỗng, không ra 'null'", () => {
  assert.strictEqual(KT.xPage.joinTweetText([null, undefined, "  "]), "");
  assert.strictEqual(KT.xPage.joinTweetText(null), "");
});

test("cắt bài dài, nhưng bài ngắn thì giữ nguyên từng ký tự", () => {
  assert.strictEqual(KT.xPage.trimPostText("ngan gon"), "ngan gon");
  const dai = "x".repeat(KT.xPage.POST_TEXT_MAX + 50);
  const cat = KT.xPage.trimPostText(dai);
  assert.strictEqual(cat.length, KT.xPage.POST_TEXT_MAX);
  assert.ok(cat.endsWith("…"));
});
