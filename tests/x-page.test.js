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
