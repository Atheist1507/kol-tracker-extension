const test = require("node:test");
const assert = require("node:assert");
const KT = require("./load");

test("ngày dd/mm/yyyy đọc theo kiểu Việt, không lộn thành tháng", () => {
  const d = new Date(KT.parseDateLoose("03/09/2026"));
  assert.strictEqual(d.getUTCMonth(), 8); // tháng 9
  assert.strictEqual(d.getUTCDate(), 3);
});

test("ngày ISO và ngày không đọc được", () => {
  assert.strictEqual(KT.parseDateLoose("2026-01-15"), Date.UTC(2026, 0, 15));
  assert.strictEqual(KT.parseDateLoose("hôm nọ"), null);
});

test("ngày giờ viết kiểu người Việt đọc được", () => {
  assert.strictEqual(KT.fmtDate("2026-09-18"), "18/09/2026");
  assert.strictEqual(KT.fmtDateTime("18/09/2026 lúc 14:37"), "18/09/2026 lúc 14:37");
  assert.strictEqual(KT.fmtDateTime("18/9/26 lúc 9 giờ"), "18/09/2026 lúc 09:00");
  assert.strictEqual(KT.fmtDateTime(""), "");
  assert.strictEqual(KT.fmtDateTime(null), "");
  assert.strictEqual(KT.fmtDateTime("chưa rõ"), "");
});

// Ô CHỈ có ngày thì đừng bịa ra giờ: "lúc 00:00" trông như một mốc chính xác
// trong khi thật ra là không ai biết mấy giờ.
test("chỉ có ngày thì không đẻ ra giờ 00:00", () => {
  assert.strictEqual(KT.fmtDateTime("2026-09-18"), "18/09/2026");
  assert.strictEqual(KT.fmtDateTime("18/09/2026"), "18/09/2026");
});

// Hai ghi chú cùng ngày phải xếp được thứ tự — bản cũ cắt chuỗi ở phần ngày
// nên cả hai đều về 00:00 và thứ tự giữa chúng là ngẫu nhiên.
test("giờ phút trong chuỗi Sheet được đọc, không bị cắt mất", () => {
  const sang = KT.parseDateLoose("18/09/2026 lúc 09:15");
  const chieu = KT.parseDateLoose("18/09/2026 lúc 14:37");
  assert.ok(chieu > sang, "buổi chiều phải sau buổi sáng");
  assert.strictEqual(chieu - sang, (5 * 60 + 22) * 60000);
});

test("chuỗi ISO có giờ thì giữ nguyên giờ, chỉ có ngày thì vẫn là nửa đêm UTC", () => {
  assert.strictEqual(KT.parseDateLoose("2026-09-17T16:05:22Z"), Date.UTC(2026, 8, 17, 16, 5, 22));
  assert.strictEqual(KT.parseDateLoose("2026-09-17"), Date.UTC(2026, 8, 17));
});
