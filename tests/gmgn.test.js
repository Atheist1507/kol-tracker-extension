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
});

test("REGRESSION: 'đã xả sạch' KHÔNG phải cờ đỏ", () => {
  // Đo trên trang thật (17/09/2026): một token bình thường cho 46/50 người
  // dính cờ đỏ vì gần như ai post từ một tháng trước giờ cũng đã bán xong.
  // Cờ đỏ mà 92% dính thì không phân loại được gì. API không cho biết bán
  // LÚC NÀO, nên không suy ra được "xả ngay sau khi hô".
  assert.strictEqual(G.normalizeMessage(REAL).isHoldingRedFlag, false);
  assert.deepStrictEqual(G.HOLDING_RED_FLAGS, ["no_buy"]);
});

test("bán rồi nhưng còn giữ kha khá → xả một phần, không phải cờ đỏ", () => {
  const m = G.normalizeMessage(Object.assign({}, REAL, { sold_amount: "100", balance: "66.5" }));
  assert.strictEqual(m.holding, "sold_part");
  assert.strictEqual(m.isHoldingRedFlag, false);
});

test("còn giữ nguyên cũng không phải cờ đỏ — đó là tín hiệu tốt", () => {
  const m = G.normalizeMessage(Object.assign({}, REAL, { sold_amount: "0", balance: "166.5" }));
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

test("parseMessages: bóc đúng chỗ, bỏ bài trùng, lấy bài sớm nhất làm đại diện", () => {
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
  // Ba bài, một bài lặp lại do phân trang chồng nhau → còn hai bài THẬT, và cả
  // hai đều của cùng một ví nên chỉ ra MỘT dòng.
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].postId, "a");
  assert.strictEqual(list[0].postCount, 2);
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

// Ca thật trên $CASHCAT (17/09/2026): panel ghi "50 người đã post · 5 đã có hồ
// sơ" trong khi Sheet chỉ có 2 người. API trả từng BÀI, nên một thằng hô nhiều
// lần chiếm nhiều dòng và mọi con số đếm theo đều phồng lên.
function msg(over) {
  return Object.assign(
    {
      id: "p" + Math.random(),
      wallet_address: "0xAAA",
      username: "caller",
      created_at: "2026-09-01T00:00:00Z",
      multiplier: 2,
    },
    over
  );
}

test("nhiều bài của cùng một ví gộp thành một dòng", () => {
  const out = KT.gmgn.parseMessages({
    data: {
      messages: [
        msg({ id: "p1", created_at: "2026-09-01T00:00:00Z", display_content: "call sớm" }),
        msg({ id: "p2", created_at: "2026-09-05T00:00:00Z", display_content: "hô thêm" }),
        msg({ id: "p3", created_at: "2026-09-09T00:00:00Z", display_content: "hô nữa" }),
        msg({ id: "p9", wallet_address: "0xBBB", username: "khac" }),
      ],
    },
  });
  assert.strictEqual(out.length, 2);
  assert.strictEqual(out[0].postCount, 3);
  assert.strictEqual(out[1].postCount, 1);
});

test("giữ bài SỚM NHẤT làm đại diện, không phải bài mới nhất", () => {
  const out = KT.gmgn.parseMessages({
    data: {
      messages: [
        msg({ id: "muon", created_at: "2026-09-09T00:00:00Z", display_content: "vào muộn" }),
        msg({ id: "som", created_at: "2026-09-01T00:00:00Z", display_content: "vào sớm" }),
      ],
    },
  });
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].postId, "som");
  assert.strictEqual(out[0].postText, "vào sớm");
});

// Giữ hàng là chuyện của cả TÀI KHOẢN, không của riêng một bài — nên phải lấy
// bản mới nhất, kẻo "đã xả sạch" hôm nay bị một bài từ tháng trước ghi đè ngược.
test("tình trạng giữ hàng lấy theo bài mới nhất", () => {
  const out = KT.gmgn.parseMessages({
    data: {
      messages: [
        msg({ id: "a", created_at: "2026-09-01T00:00:00Z", bought_amount: 100, balance: 100 }),
        msg({ id: "b", created_at: "2026-09-09T00:00:00Z", bought_amount: 100, sold_amount: 100, balance: 0 }),
      ],
    },
  });
  assert.strictEqual(out[0].postId, "a");
  assert.strictEqual(out[0].holding, "sold_all");
});

test("không có ví lẫn username thì không bị gộp nhầm vào nhau", () => {
  const out = KT.gmgn.groupCallers([
    { wallet: "", username: "", postId: "x", postCount: undefined },
    { wallet: "", username: "", postId: "y" },
  ]);
  assert.strictEqual(out.length, 2);
});

/* ---------- lùng người trong API lạ (apiPath / scanPeople) ---------- */

test("apiPath gom mọi token về cùng một đường dẫn", () => {
  const a = KT.gmgn.apiPath("https://gmgn.ai/api/v1/token/sol/9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin/community/messages?limit=50");
  const b = KT.gmgn.apiPath("https://gmgn.ai/api/v1/token/eth/0x" + "a".repeat(40) + "/community/messages");
  assert.strictEqual(a, "/api/v1/token/{chain}/{dc}/community/messages");
  assert.strictEqual(a, b);
});

test("scanPeople nhặt người dù nằm sâu trong hình dạng lạ", () => {
  const people = KT.gmgn.scanPeople({
    data: { groups: [{ rows: [{ user: { twitter_username: "Shea1121", display_name: "Shea" } }] }] },
  });
  assert.deepStrictEqual(people.map((p) => p.username), ["Shea1121"]);
});

test("scanPeople KHÔNG nhặt nhầm token làm người", () => {
  // token cũng có name/address/logo — thiếu chốt chặn này là mỗi chart đẻ ra
  // một "người" tên CashCat
  const people = KT.gmgn.scanPeople({ data: [{ symbol: "CASH", name: "CashCat", address: "0x" + "a".repeat(40), logo: "l.png" }] });
  assert.deepStrictEqual(people, []);
});

test("scanPeople bỏ tay cầm không đúng dạng Twitter", () => {
  const people = KT.gmgn.scanPeople({ data: [{ username: "tên có dấu cách" }, { username: "ok_1" }] });
  assert.deepStrictEqual(people.map((p) => p.username), ["ok_1"]);
});

test("scanPeople gộp trùng theo tay cầm, không phân biệt hoa thường", () => {
  const people = KT.gmgn.scanPeople({ data: [{ username: "Shea1121" }, { username: "@shea1121", display_name: "x" }] });
  assert.strictEqual(people.length, 1);
});

test("scanPeople nhặt ID SỐ của tài khoản X khi có", () => {
  const people = KT.gmgn.scanPeople({ data: [{ username: "Shea", twitter_id: "1234567890" }] });
  assert.strictEqual(people[0].xId, "1234567890");
});

test("ID không phải dãy số thì bỏ, đừng lấy bừa làm khoá", () => {
  // Khoá sai là mọi dòng trong Sheet gắn nhầm người, mà không có triệu chứng gì
  const people = KT.gmgn.scanPeople({ data: [{ username: "Shea", user_id: "abc-def" }] });
  assert.strictEqual(people[0].xId, "");
});
