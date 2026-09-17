const test = require("node:test");
const assert = require("node:assert");
const KT = require("./load");
const G = KT.gmgn;

// Message THẬT lấy từ API GMGN ngày 17/09/2026 — giữ nguyên văn làm mốc.
const REAL = {
  id: "gmgn_01M1MRA95JX9A0FPENYZ5Q1RBH",
  content: "giga runner",
  media_url: null,
  username: "randomguytradin",
  display_name: "marv",
  profile_image_url: "https://gmgn.ai/defi/images/twitter/0488b03e9e3403dd0ad3fd9b58f31d2c.jpg",
  wallet_address: "0xF1B6A4D6AECC5A618ADE56A53FA9956EA508E16C",
  user_twitter_url: "https://x.com/randomguytradin",
  follower_count: 8,
  like_count: 0,
  reply_count: 0,
  created_at: "2026-09-03T23:05:28Z",
  source: "gmgn",
  multiplier: "1.0369514952153787",
  ulid: "01M1MRA95JX9A0FPENYZ5Q1RBH",
  display_content: "giga runner",
  is_blue_verified: false,
  is_kol: false,
  encrypted_user_id: "AAAAATs6QsunYcdxBPIzV2g4CR28KgPA1xwO7VH4JljlQXnRm3rB1gev747TrX8eNHWLhFaqU9dwS/zKCEQv30+fvg4=",
  is_safe: "safe",
  balance: "0",
  accu_cost: "0",
  accu_fee: "0",
  bought_amount: "166.514153911168574356",
  sold_amount: "166.514153911168574356",
  transfer_out_amount: "0",
  accu_amount: "0",
  current_holding_usd: "0",
  current_pnl_usd: "0",
  unrealized_profit: "0",
};

test("message thật: lấy đủ danh tính và nội dung", () => {
  const m = G.normalizeMessage(REAL);
  assert.strictEqual(m.username, "randomguytradin");
  assert.strictEqual(m.displayName, "marv");
  assert.strictEqual(m.postText, "giga runner");
  assert.strictEqual(m.postId, "gmgn_01M1MRA95JX9A0FPENYZ5Q1RBH");
  assert.strictEqual(m.followers, 8);
  assert.ok(Math.abs(m.multiple - 1.03695) < 1e-4);
});

test("wallet luôn về chữ thường — khoá nối 2 tab không được lệch hoa/thường", () => {
  assert.strictEqual(G.normalizeMessage(REAL).wallet, "0xf1b6a4d6aecc5a618ade56a53fa9956ea508e16c");
});

test("mua bao nhiêu bán đúng bấy nhiêu, còn 0 → đã xả sạch", () => {
  const m = G.normalizeMessage(REAL);
  assert.strictEqual(m.holding, "sold_all");
  assert.strictEqual(m.holdingLabel, "đã xả sạch");
  assert.strictEqual(m.isHoldingRedFlag, true);
});

test("bán rồi nhưng còn giữ kha khá → xả một phần, không phải cờ đỏ", () => {
  const m = G.normalizeMessage(Object.assign({}, REAL, { sold_amount: "100", balance: "66.5" }));
  assert.strictEqual(m.holding, "sold_part");
  assert.strictEqual(m.isHoldingRedFlag, false);
});

test("mua mà chưa bán gì → còn giữ", () => {
  const m = G.normalizeMessage(Object.assign({}, REAL, { sold_amount: "0", balance: "166.5" }));
  assert.strictEqual(m.holding, "holding");
});

test("hô mà không mua đồng nào → cờ đỏ", () => {
  const m = G.normalizeMessage(
    Object.assign({}, REAL, { bought_amount: "0", sold_amount: "0", balance: "0" })
  );
  assert.strictEqual(m.holding, "no_buy");
  assert.strictEqual(m.isHoldingRedFlag, true);
});

test("còn vài đồng bụi sau khi bán vẫn tính là xả sạch", () => {
  // Bán gần hết, còn lại 0.00001 trên tổng 166 — đòi đúng 0 là bỏ sót cờ đỏ
  const m = G.normalizeMessage(Object.assign({}, REAL, { sold_amount: "166.5", balance: "0.00001" }));
  assert.strictEqual(m.holding, "sold_all");
});

test("chuyển đi ví khác cũng tính là đã ra hàng", () => {
  const m = G.normalizeMessage(
    Object.assign({}, REAL, { sold_amount: "0", balance: "0", transfer_out_amount: "166.5" })
  );
  assert.strictEqual(m.holding, "sold_all");
});

test("thiếu hẳn mấy cột số → 'không biết', KHÔNG quy về 0", () => {
  const bare = { username: "ai_do", wallet_address: "0xabc", content: "gm" };
  const m = G.normalizeMessage(bare);
  assert.strictEqual(m.holding, "unknown");
  assert.strictEqual(m.holdingLabel, "");
  assert.strictEqual(m.isHoldingRedFlag, false);
  assert.strictEqual(m.bought, null);
  assert.strictEqual(m.multiple, null);
});

test("hàng không có cả ví lẫn username thì bỏ qua", () => {
  assert.strictEqual(G.normalizeMessage({ content: "gm" }), null);
  assert.strictEqual(G.normalizeMessage(null), null);
});

test("parseMessages: bóc đúng chỗ, bỏ trùng, xếp người post sớm lên đầu", () => {
  const payload = {
    code: 0,
    data: {
      messages: [
        Object.assign({}, REAL, { id: "b", created_at: "2026-09-05T00:00:00Z" }),
        Object.assign({}, REAL, { id: "a", created_at: "2026-09-01T00:00:00Z" }),
        Object.assign({}, REAL, { id: "b", created_at: "2026-09-05T00:00:00Z" }), // trùng
      ],
    },
  };
  const list = G.parseMessages(payload);
  assert.strictEqual(list.length, 2);
  assert.strictEqual(list[0].postId, "a");
});

test("payload lạ không làm vỡ", () => {
  assert.deepStrictEqual(G.parseMessages(null), []);
  assert.deepStrictEqual(G.parseMessages({}), []);
  assert.deepStrictEqual(G.parseMessages({ data: { messages: "không phải mảng" } }), []);
});

test("bóc chain + địa chỉ token từ URL endpoint", () => {
  const url =
    "/api/v1/token/robinhood/0x020bfc650a365f8bb26819deaabf3e21291018b4/community/messages?limit=50";
  assert.deepStrictEqual(G.parseEndpoint(url), {
    chain: "robinhood",
    tokenAddress: "0x020bfc650a365f8bb26819deaabf3e21291018b4",
  });
  assert.strictEqual(G.parseEndpoint("/api/v1/khac"), null);
});

test("encrypted_user_id KHÔNG được lọt vào dữ liệu chuẩn hoá", () => {
  // Đo trên trang thật: cùng một message, ba lần gọi ra ba giá trị khác nhau.
  // Nếu có ngày nào đó ai thêm nó vào đây thì test này phải đỏ.
  const m = G.normalizeMessage(REAL);
  assert.strictEqual(JSON.stringify(m).includes("encrypted"), false);
});
