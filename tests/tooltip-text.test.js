const test = require("node:test");
const assert = require("node:assert");
const KT = require("./load");

// Đúng cấu trúc tooltip của GMGN (ảnh chụp 17/09/2026): tên hiển thị, nhãn,
// thời gian, @handle, rồi nội dung post — mỗi thứ một element.
const GMGN_TOOLTIP = ["nolifeloser", "Thesis", "2d", "@nolifeloser", "Ahaa Only up from here stack up!!!!!"];

test("lấy đúng @handle của chủ thẻ từ tooltip GMGN", () => {
  const { standalone } = KT.candidateHandles(GMGN_TOOLTIP);
  assert.deepStrictEqual(standalone, ["nolifeloser"]);
});

test("tên hiển thị vào nhóm plain để còn khớp với cột aliases", () => {
  const { plain } = KT.candidateHandles(GMGN_TOOLTIP);
  assert.ok(plain.includes("nolifeloser"));
  assert.ok(plain.includes("Thesis"));
});

test("nội dung post dài không bị coi là một cái tên", () => {
  const { plain } = KT.candidateHandles(["x".repeat(80)]);
  assert.deepStrictEqual(plain, []);
});

test("@ai_đó nhắc TRONG câu không được coi là chủ thẻ", () => {
  const { standalone, at } = KT.candidateHandles(["@realowner", "shoutout @someoneelse nhé"]);
  assert.deepStrictEqual(standalone, ["realowner"]);
  assert.deepStrictEqual(at, ["someoneelse"]);
});

test("REGRESSION: vì sao phải tách theo text node, không dùng textContent", () => {
  // textContent nối hết lại KHÔNG có dấu cách — đây là chuỗi bản đầu đã đọc
  const flattened = GMGN_TOOLTIP.join("");
  const { standalone, at } = KT.candidateHandles([flattened]);
  assert.deepStrictEqual(standalone, [], "cả cục chữ thì không còn mẩu nào chỉ là @handle");
  assert.strictEqual(at[0], "nolifeloserAhaa", "regex nuốt luôn chữ bên cạnh");
  assert.notStrictEqual(KT.handleKey(at[0]), KT.handleKey("nolifeloser"));
});

test("mẩu rỗng và giá trị lạ không làm vỡ", () => {
  const r = KT.candidateHandles(["", "   ", null, undefined]);
  assert.deepStrictEqual(r, { standalone: [], at: [], plain: [] });
  assert.deepStrictEqual(KT.candidateHandles(null), { standalone: [], at: [], plain: [] });
});

test("@ đứng một mình hoặc handle quá ngắn không tính", () => {
  const { standalone, at } = KT.candidateHandles(["@", "@a"]);
  assert.deepStrictEqual(standalone, []);
  assert.deepStrictEqual(at, []);
});
