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

/* ---------- link tìm "nói về chuyện này trước chưa" ---------- */

const { narrativeSearchUrl } = require("../src/lib/x-page.js");

function qOf(url) {
  return decodeURIComponent(new URL(url).searchParams.get("q"));
}

test("tìm narrative: cắt ở ngày SỚM HƠN trong hai mốc (token ra đời, cú call)", () => {
  const url = narrativeSearchUrl({
    handle: "alice",
    keyword: "$GOAT",
    createdAt: Date.UTC(2026, 8, 10, 3),
    calledAt: Date.UTC(2026, 8, 12, 9),
  });
  assert.equal(qOf(url), "from:alice (GOAT OR $GOAT) until:2026-09-10");
});

test("tìm narrative: ngày theo UTC, không theo giờ máy", () => {
  // 23:30 UTC ngày 9 = sáng ngày 10 ở Việt Nam — vẫn phải cắt ở ngày 9
  const url = narrativeSearchUrl({ handle: "alice", calledAt: Date.UTC(2026, 8, 9, 23, 30) });
  assert.equal(qOf(url), "from:alice until:2026-09-09");
});

test("tìm narrative: không có mốc nào hoặc tay cầm hỏng → không dựng link", () => {
  assert.equal(narrativeSearchUrl({ handle: "alice" }), "");
  assert.equal(narrativeSearchUrl({ handle: "tên có dấu cách", calledAt: 1789000000000 }), "");
});

test("tìm narrative: từ khoá lạ không chen được toán tử vào câu tìm", () => {
  const url = narrativeSearchUrl({ handle: "alice", keyword: "x) OR from:bob (", calledAt: Date.UTC(2026, 0, 2) });
  assert.equal(qOf(url), "from:alice (xORfrombob OR $xORfrombob) until:2026-01-02");
});
