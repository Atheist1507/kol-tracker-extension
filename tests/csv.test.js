const test = require("node:test");
const assert = require("node:assert");
const KT = require("./load");

test("giữ nguyên dấu phẩy nằm trong ô có nháy kép", () => {
  const rows = KT.parseCSV('a,"b,c",d');
  assert.deepStrictEqual(rows, [["a", "b,c", "d"]]);
});

test("ô nhiều dòng không làm vỡ hàng", () => {
  const rows = KT.parseCSV('handle,note\nfoo,"dòng 1\ndòng 2"');
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[1][1], "dòng 1\ndòng 2");
});

test("nháy kép đôi bên trong ô", () => {
  assert.deepStrictEqual(KT.parseCSV('"anh ""tướng"" này"'), [['anh "tướng" này']]);
});

test("bỏ BOM và xử lý CRLF", () => {
  const rows = KT.parseCSV('﻿a,b\r\nc,d\r\n');
  assert.deepStrictEqual(rows, [["a", "b"], ["c", "d"]]);
});

test("dòng trống cuối file không thành một hàng rỗng", () => {
  assert.strictEqual(KT.parseCSV("a,b\n").length, 1);
});

test("ô rỗng ở cuối hàng vẫn được đếm", () => {
  assert.deepStrictEqual(KT.parseCSV("a,b,"), [["a", "b", ""]]);
});

test("header tiếng Việt map về khoá chuẩn", () => {
  const { rows } = KT.parseTable("Tên,Hạng,Cờ đỏ\n@foo,S,xả sớm");
  assert.strictEqual(rows[0].handle, "@foo");
  assert.strictEqual(rows[0].tier, "S");
  assert.strictEqual(rows[0].red_flags, "xả sớm");
});

test("cột lạ không bị vứt đi mà nằm trong extra", () => {
  const { rows } = KT.parseTable("handle,Telegram\n@foo,t.me/foo");
  assert.strictEqual(rows[0].extra.Telegram, "t.me/foo");
});

test("hàng toàn ô trống bị bỏ qua (Sheet publish hay kèm dòng rỗng)", () => {
  const { rows } = KT.parseTable("handle,tier\n@foo,S\n,\n,\n");
  assert.strictEqual(rows.length, 1);
});

test("giữ số dòng thật trên Sheet để còn đối chiếu", () => {
  const { rows } = KT.parseTable("handle\n@a\n@b");
  assert.strictEqual(rows[1]._row, 3);
});
