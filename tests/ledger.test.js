const test = require("node:test");
const assert = require("node:assert");
const KT = require("./load");

const A = "So11111111111111111111111111111111111111112";
const B = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";

function row(over) {
  return Object.assign(
    {
      xId: "1234567890",
      authorId: "1234567890",
      username: "Seful",
      displayName: "Seful",
      tokenAddress: A,
      tokenSymbol: "WSOL",
      chain: "sol",
      tradeUsd: 1000,
      pnlUsd: 200,
      holdingUsd: 1200,
      postedTs: 1_700_000_000_000,
      postId: "p1",
    },
    over
  );
}

test("nhập một lượt feed rồi tra ra được bằng tay cầm", () => {
  const so = KT.ledger.mergeThesis(null, [row()], 1000);
  const e = KT.ledger.lookup(so, { username: "seful" }); // khác hoa thường vẫn ra
  assert.ok(e);
  assert.strictEqual(KT.ledger.totals(e).tokens, 1);
  assert.strictEqual(KT.ledger.totals(e).tradeUsd, 1000);
});

test("⚠ nhập LẠI cùng một token KHÔNG được nhân đôi số tiền", () => {
  // F5 ba lần cái chart đó là feed về lại y nguyên. Cộng dồn thì "bỏ vào"
  // gấp ba, và không ai nhìn ra được.
  let so = KT.ledger.mergeThesis(null, [row()], 1000);
  so = KT.ledger.mergeThesis(so, [row()], 2000);
  so = KT.ledger.mergeThesis(so, [row()], 3000);
  const t = KT.ledger.totals(KT.ledger.lookup(so, { username: "Seful" }));
  assert.strictEqual(t.tokens, 1);
  assert.strictEqual(t.tradeUsd, 1000);
  assert.strictEqual(t.pnlUsd, 200);
});

test("token thứ hai thì cộng vào", () => {
  let so = KT.ledger.mergeThesis(null, [row()], 1000);
  so = KT.ledger.mergeThesis(so, [row({ tokenAddress: B, tokenSymbol: "BONK", tradeUsd: 500, pnlUsd: -100 })], 2000);
  const t = KT.ledger.totals(KT.ledger.lookup(so, { username: "Seful" }));
  assert.strictEqual(t.tokens, 2);
  assert.strictEqual(t.tradeUsd, 1500);
  assert.strictEqual(t.pnlUsd, 100);
});

test("lỗ thì câu chữ nói lỗ, không nói lãi âm", () => {
  const so = KT.ledger.mergeThesis(null, [row({ pnlUsd: -3000 })], 1000);
  const line = KT.ledger.line(KT.ledger.lookup(so, { username: "Seful" }));
  assert.match(line, /lỗ /);
  assert.doesNotMatch(line, /lãi/);
});

test("GMGN không trả tiền thì KHÔNG được ghi là bỏ vào $0", () => {
  // Cộng một đống null ra 0, mà 0 ở đây nghĩa là "bỏ vào 0 đồng" — sai hẳn nghĩa.
  const so = KT.ledger.mergeThesis(null, [row({ tradeUsd: null, pnlUsd: null })], 1000);
  const t = KT.ledger.totals(KT.ledger.lookup(so, { username: "Seful" }));
  assert.strictEqual(t.tradeUsd, null);
  assert.strictEqual(t.pnlUsd, null);
  const line = KT.ledger.line(KT.ledger.lookup(so, { username: "Seful" }));
  assert.strictEqual(line, "đã thấy call 1 token");
});

test("đổi tên: tra theo id vẫn ra đúng người, và lịch sử không mất", () => {
  let so = KT.ledger.mergeThesis(null, [row({ username: "ten_cu" })], 1000);
  so = KT.ledger.mergeThesis(so, [row({ username: "ten_moi", tokenAddress: B })], 2000);
  const e = KT.ledger.lookup(so, { xId: "1234567890" });
  assert.strictEqual(KT.ledger.totals(e).tokens, 2);
  assert.strictEqual(e.handle, "ten_moi");
  // Tên CŨ không được còn trỏ vào ai: chỉ mục dựng lại mỗi lượt
  assert.strictEqual(KT.ledger.lookup(so, { username: "ten_cu" }), null);
});

test("lần đầu chỉ biết tên, lần sau biết id → GỘP chứ không thành hai dòng", () => {
  let so = KT.ledger.mergeThesis(null, [row({ xId: "", authorId: "" })], 1000);
  assert.ok(so.people["h:seful"]);
  so = KT.ledger.mergeThesis(so, [row({ tokenAddress: B })], 2000);
  assert.strictEqual(so.people["h:seful"], undefined, "khoá theo tên phải bị gộp đi");
  const e = KT.ledger.lookup(so, { username: "Seful" });
  assert.strictEqual(KT.ledger.totals(e).tokens, 2);
});

test("một người không có tay cầm lẫn id thì bỏ, không đẻ dòng rỗng", () => {
  const so = KT.ledger.mergeThesis(null, [row({ xId: "", authorId: "", username: "" })], 1000);
  assert.strictEqual(Object.keys(so.people).length, 0);
});

test("vượt trần thì bỏ người LÂU KHÔNG GẶP nhất", () => {
  const cu = [];
  for (let i = 0; i < KT.ledger.MAX_PEOPLE; i++) cu.push(row({ xId: "9" + i, authorId: "9" + i, username: "cu" + i }));
  let so = KT.ledger.mergeThesis(null, cu, 1000);
  assert.strictEqual(Object.keys(so.people).length, KT.ledger.MAX_PEOPLE);
  so = KT.ledger.mergeThesis(so, [row({ xId: "777", authorId: "777", username: "moi" })], 5000);
  assert.strictEqual(Object.keys(so.people).length, KT.ledger.MAX_PEOPLE);
  assert.ok(KT.ledger.lookup(so, { username: "moi" }), "người mới gặp phải còn");
});

test("token gần nhất đứng đầu", () => {
  let so = KT.ledger.mergeThesis(null, [row({ postedTs: 1000 })], 1000);
  so = KT.ledger.mergeThesis(so, [row({ tokenAddress: B, tokenSymbol: "BONK", postedTs: 9000 })], 2000);
  const top = KT.ledger.recentTokens(KT.ledger.lookup(so, { username: "Seful" }), 3);
  assert.strictEqual(top[0].symbol, "BONK");
});

test("sổ rỗng / feed rỗng không vỡ", () => {
  assert.strictEqual(KT.ledger.lookup(null, { username: "a" }), null);
  assert.strictEqual(KT.ledger.line(null), "");
  assert.deepStrictEqual(KT.ledger.mergeThesis(null, [], 1).people, {});
});
