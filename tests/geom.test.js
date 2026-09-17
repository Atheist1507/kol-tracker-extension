const test = require("node:test");
const assert = require("node:assert");
const KT = require("./load");

const box = { left: 100, top: 100, right: 140, bottom: 140 };

test("con trỏ nằm trong ô thì khoảng cách bằng 0", () => {
  assert.strictEqual(KT.distToRect(120, 120, box), 0);
  assert.strictEqual(KT.distToRect(100, 140, box), 0); // đúng trên cạnh
});

test("ngoài ô thì đo tới cạnh gần nhất, không phải tới tâm", () => {
  assert.strictEqual(KT.distToRect(160, 120, box), 20); // bên phải
  assert.strictEqual(KT.distToRect(120, 60, box), 40); // phía trên
});

test("lệch cả hai chiều thì đo theo đường chéo tới góc", () => {
  assert.strictEqual(KT.distToRect(143, 144, box), 5); // 3-4-5
});

// Đây là ca đã làm hỏng phím N: tooltip của GMGN mọc CẠNH avatar chứ không
// đè lên nó, nên "gần" phải nới đủ rộng — nhưng một cục DOM tự đổi ở góc màn
// hình thì vẫn phải bị loại.
test("tooltip cạnh con trỏ là gần, cục DOM ở góc màn hình thì không", () => {
  assert.strictEqual(KT.nearRect(120, 120, { left: 150, top: 110, right: 400, bottom: 260 }, 240), true);
  assert.strictEqual(KT.nearRect(120, 120, { left: 900, top: 700, right: 1200, bottom: 800 }, 240), false);
});

test("không có ô thì không bao giờ gần", () => {
  assert.strictEqual(KT.distToRect(0, 0, null), Infinity);
  assert.strictEqual(KT.nearRect(0, 0, null, 1e9), false);
});
