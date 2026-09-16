const test = require("node:test");
const assert = require("node:assert");
const KT = require("./load");

test("đọc được mọi kiểu ghi hệ số nhân", () => {
  assert.strictEqual(KT.parseMultiple("x5"), 5);
  assert.strictEqual(KT.parseMultiple("5x"), 5);
  assert.strictEqual(KT.parseMultiple("X 1.8"), 1.8);
  assert.strictEqual(KT.parseMultiple("+300%"), 4);
  assert.ok(Math.abs(KT.parseMultiple("-70%") - 0.3) < 1e-9);
  assert.strictEqual(KT.parseMultiple("chưa rõ"), null);
});

test("có số thì SỐ quyết định, không có số mới đọc chữ", () => {
  assert.strictEqual(KT.parseResult("x5").outcome, "win");
  assert.strictEqual(KT.parseResult("x0.3").outcome, "loss");
  assert.strictEqual(KT.parseResult("x1.2").outcome, "neutral");
  assert.strictEqual(KT.parseResult("đúng").outcome, "win");
  assert.strictEqual(KT.parseResult("sai bét").outcome, "loss");
  assert.strictEqual(KT.parseResult("rug").outcome, "loss");
});

test("ngưỡng thắng chỉnh được", () => {
  assert.strictEqual(KT.parseResult("x1.5", 1.5).outcome, "win");
  assert.strictEqual(KT.parseResult("x1.5", 3).outcome, "neutral");
});

test("từ khoá có dấu vẫn ăn (\\b của JS không hiểu chữ có dấu)", () => {
  assert.strictEqual(KT.parseResult("lãi to").outcome, "win");
  assert.strictEqual(KT.parseResult("thắng").outcome, "win");
  assert.strictEqual(KT.parseResult("mất trắng").outcome, "loss");
});

test("ô rỗng là 'chưa rõ', không phải thua", () => {
  assert.strictEqual(KT.parseResult("").outcome, "unknown");
  assert.strictEqual(KT.parseResult(null).outcome, "unknown");
});

test("vị trí trên sóng quy về 3 nhóm", () => {
  assert.strictEqual(KT.parsePosition("đu đỉnh"), "late");
  assert.strictEqual(KT.parsePosition("Đầu sóng"), "early");
  assert.strictEqual(KT.parsePosition("giữa"), "mid");
  assert.strictEqual(KT.parsePosition("hmm"), "");
});

test("ngày dd/mm/yyyy đọc theo kiểu Việt, không lộn thành tháng", () => {
  const d = new Date(KT.parseDateLoose("03/09/2026"));
  assert.strictEqual(d.getUTCMonth(), 8); // tháng 9
  assert.strictEqual(d.getUTCDate(), 3);
});

test("ngày ISO và ngày không đọc được", () => {
  assert.strictEqual(KT.parseDateLoose("2026-01-15"), Date.UTC(2026, 0, 15));
  assert.strictEqual(KT.parseDateLoose("hôm nọ"), null);
});

test("win rate chỉ tính trên case phân loại được, không tính case chưa rõ", () => {
  const s = KT.calcStats([
    { result: "x5" },
    { result: "x3" },
    { result: "x0.2" },
    { result: "" },
    { result: "???" },
  ]);
  assert.strictEqual(s.total, 5);
  assert.strictEqual(s.win, 2);
  assert.strictEqual(s.loss, 1);
  assert.strictEqual(s.classified, 3);
  assert.strictEqual(s.winRate, 2 / 3);
});

test("dưới ngưỡng mẫu thì đánh dấu là chưa đủ tin", () => {
  assert.strictEqual(KT.calcStats([{ result: "x5" }]).enoughSample, false);
  const many = Array.from({ length: 5 }, () => ({ result: "x5" }));
  assert.strictEqual(KT.calcStats(many).enoughSample, true);
});

test("hệ số cao nhất và trung vị", () => {
  const s = KT.calcStats([{ result: "x2" }, { result: "x10" }, { result: "x4" }]);
  assert.strictEqual(s.bestMultiple, 10);
  assert.strictEqual(s.medianMultiple, 4);
});

test("đếm timing và lấy mốc call gần nhất", () => {
  const s = KT.calcStats([
    { result: "x2", chart_position: "đu đỉnh", called_at: "2026-01-01" },
    { result: "x2", chart_position: "đầu sóng", called_at: "2026-05-05" },
  ]);
  assert.deepStrictEqual(s.position, { early: 1, mid: 0, late: 1 });
  assert.strictEqual(s.lastCallAt, Date.UTC(2026, 4, 5));
});

test("không có call nào thì không ra NaN", () => {
  const s = KT.calcStats([]);
  assert.strictEqual(s.total, 0);
  assert.strictEqual(s.winRate, null);
  assert.strictEqual(s.bestMultiple, null);
});
