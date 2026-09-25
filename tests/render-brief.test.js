const test = require("node:test");
const assert = require("node:assert");
const KT = require("./load");

function person(over) {
  return Object.assign(
    { tier: "S", tierLetter: "S", noteCount: 2, summary: "call sớm", redFlags: "", notes: [] },
    over
  );
}
const NOTE = { note: "hô xong xả ngay", notedAt: "18/09/2026 lúc 14:37", token: "WIF", addedBy: "Nix" };

test("ghi chú + mốc thời gian dựng ra MỘT kiểu duy nhất", () => {
  const h = KT.render.noteLine(NOTE);
  assert.match(h, /kt-brief-note/);
  assert.match(h, /hô xong xả ngay/);
  assert.match(h, /18\/09\/2026 lúc 14:37 · \$WIF · Nix/);
});

test("không có ghi chú thì không đẻ ra khối rỗng", () => {
  assert.strictEqual(KT.render.noteLine(null), "");
  assert.strictEqual(KT.render.noteLine({ note: "" }), "");
});

test("ghi chú thiếu ngày/token/người ghi thì bỏ hẳn dòng meta, không để dấu · trơ", () => {
  const h = KT.render.noteLine({ note: "abc" });
  assert.match(h, /abc/);
  assert.doesNotMatch(h, /kt-brief-meta/);
  assert.doesNotMatch(h, /·/);
});

test("chữ từ Sheet phải bị esc trước khi vào HTML", () => {
  // Đây là chữ NGƯỜI KHÁC gõ, chèn vào một trang tài chính
  const h = KT.render.noteLine({ note: '<img src=x onerror=alert(1)>', addedBy: "<b>" });
  assert.doesNotMatch(h, /<img/);
  assert.doesNotMatch(h, /<b>/);
  const b = KT.render.personBrief(person({ summary: "<script>", redFlags: "<i>" }), {});
  assert.doesNotMatch(b, /<script>/);
  assert.doesNotMatch(b, /<i>/);
});

test("đầu khối: hạng + số ghi chú + cờ đỏ", () => {
  const h = KT.render.personBrief(person({ redFlags: "hô mà không mua" }), {});
  assert.match(h, /kt-brief-head/);
  assert.match(h, />S</);
  assert.match(h, /2 ghi chú/);
  assert.match(h, /⚑ hô mà không mua/);
});

test("chưa ghi chú lần nào thì KHÔNG hiện '0 ghi chú'", () => {
  const h = KT.render.personBrief(person({ noteCount: 0 }), {});
  assert.doesNotMatch(h, /ghi chú/);
});

test("người lạ hoàn toàn: chỉ hiện nhãn khi chỗ gọi xin, và hiện được lời mời ghi", () => {
  assert.strictEqual(KT.render.personBrief(null, {}), "");
  const h = KT.render.personBrief(null, { unknownHead: "chưa ghi chú", emptyNote: "bấm để ghi" });
  assert.match(h, /chưa ghi chú/);
  assert.match(h, /bấm để ghi/);
});

test("dòng trên chain chèn vào GIỮA đầu khối và phần tóm tắt", () => {
  const h = KT.render.personBrief(person(), { chainHtml: '<div class="kt-x-chain">đã thấy call 2 token</div>' });
  assert.ok(h.indexOf("kt-brief-head") < h.indexOf("kt-x-chain"), "chain phải sau đầu khối");
  assert.ok(h.indexOf("kt-x-chain") < h.indexOf("kt-brief-sum"), "chain phải trước tóm tắt");
});

test("mọi shadow root dùng personBrief đều phải có CSS của nó", () => {
  // Thiếu là khối chữ vẫn hiện nhưng mất sạch định dạng — không có lỗi nào
  for (const css of [KT.OVERLAY_CSS, KT.X_CSS]) {
    assert.match(css, /\.kt-brief-note/);
    assert.match(css, /\.kt-brief-meta/);
  }
});
