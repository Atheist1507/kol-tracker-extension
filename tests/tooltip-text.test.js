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

test("thẻ trên chart tách dấu @ ra mẩu riêng — vẫn phải ra đúng handle", () => {
  // Đo trên trang thật 19/09/2026: GMGN dựng "@" thành một text node, tên
  // thành text node kế bên. Không ghép lại thì tên rơi xuống `plain`, lẫn với
  // "Thesis" và "13h" — và đó là lý do DUY NHẤT thẻ trên chart không dùng được.
  const out = KT.candidateHandles(["Triggered", "Thesis", "13h", "@", "Triggeredtrad3s", "CATE JUST HIT 100M"]);
  assert.deepStrictEqual(out.standalone, ["Triggeredtrad3s"]);
  assert.ok(out.plain.indexOf("Triggeredtrad3s") < 0, "tên đã dùng rồi thì đừng để rơi xuống plain nữa");
});

test("dấu @ trơ trọi mà mẩu sau không phải tên thì không ghép bừa", () => {
  const out = KT.candidateHandles(["@", "câu văn dài có dấu cách"]);
  assert.deepStrictEqual(out.standalone, []);
});

/* ---------- cardFacts: thời điểm call trên thẻ chart ---------- */

const MOC = Date.parse("2026-09-21T10:04:00Z");

test("tuổi bài trên thẻ quy về mốc TUYỆT ĐỐI ngay lúc đọc", () => {
  // Để nguyên "6h" thì tuần sau đọc lại là sai một tuần, không triệu chứng nào
  const f = KT.cardFacts(["Soko", "Thesis", "6h", "@", "soko_eth", "CAT leader will reign supreme"], MOC);
  assert.strictEqual(f.handle, "soko_eth");
  assert.strictEqual(new Date(f.postedTs).toISOString(), "2026-09-21T04:04:00.000Z");
  assert.strictEqual(f.saiSoMs, 3600000); // "6h" chỉ chính xác tới GIỜ
});

test("bài post là mẩu dài nhất, không phải nhãn hay tên", () => {
  const f = KT.cardFacts(["Manifesto", "Best Callout", "Yeon", "@", "yeon__", "75d", "The most valuable cat with the clearest narrative."], MOC);
  assert.strictEqual(f.postText, "The most valuable cat with the clearest narrative.");
  assert.strictEqual(f.saiSoMs, 86400000); // "75d" sai số cả NGÀY
});

test("thẻ không có tuổi thì trả null, KHÔNG lấy giờ hiện tại", () => {
  // Lấy bừa now() là ghi vào Sheet một mốc call hoàn toàn bịa
  const f = KT.cardFacts(["Ai Đó", "@", "ai_do", "câu gì đó dài hơn hai mươi ký tự"], MOC);
  assert.strictEqual(f.postedTs, null);
  assert.strictEqual(f.ageMs, null);
});

test("ageToMs không nuốt chuỗi lạ", () => {
  assert.strictEqual(KT.ageToMs("6h"), 6 * 3600000);
  assert.strictEqual(KT.ageToMs("2mo"), 2 * 30 * 86400000);
  assert.strictEqual(KT.ageToMs("100M"), null); // "100M" là vốn hoá, không phải tuổi
  assert.strictEqual(KT.ageToMs("abc"), null);
});

test('"100M" là VỐN HOÁ, không phải 100 phút', () => {
  // Bật cờ /i là một mốc call bịa được ghi thẳng vào Sheet, không triệu chứng
  assert.strictEqual(KT.ageToMs("100M"), null);
  assert.strictEqual(KT.ageToMs("2B"), null);
  assert.strictEqual(KT.ageToMs("6h"), 6 * 3600000);
});
