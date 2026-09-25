const test = require("node:test");
const assert = require("node:assert/strict");
const KT = require("./load");
const L = KT.ledger;

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 8, 25, 12, 0, 0);

function call(over) {
  return L.makeCall(
    Object.assign(
      { id: "x:1:tok", source: "x", handle: "alice", tokenKey: "tok", calledAt: NOW - 10 * MIN, seenAt: NOW },
      over
    ),
    NOW
  );
}

/* ---------- khoá người ---------- */

test("khoá người GIỮ dấu gạch dưới: foo_bar và foobar là hai người", () => {
  assert.notEqual(L.personKeyOf({ handle: "foo_bar" }), L.personKeyOf({ handle: "foobar" }));
});

test("khoá người không phân biệt hoa thường và bỏ @", () => {
  assert.equal(L.personKeyOf({ handle: "@Alice" }), L.personKeyOf({ handle: "alice" }));
});

test("tay cầm không hợp lệ rơi về ví, không có gì thì rỗng (không ghi)", () => {
  assert.equal(L.personKeyOf({ handle: "không phải tên", wallet: "0xABC" }), "w:0xabc");
  assert.equal(L.personKeyOf({}), "");
  assert.equal(L.makeCall({ id: "a", tokenKey: "t", handle: "" }, NOW), null);
});

/* ---------- đọc CA ---------- */

const SOL = "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr";
const EVM = "0x6982508145454ce325ddbe47a25d4ec3d2311933";

test("tweet có cashtag + CA → một cú call", () => {
  const r = L.extractContracts("$POPCAT sending it " + SOL);
  assert.equal(r.length, 1);
  assert.equal(r[0].chain, "sol");
});

test("địa chỉ trơ trọi không có dấu hiệu gọi kèo → KHÔNG phải cú call (có thể là ví)", () => {
  assert.deepEqual(L.extractContracts("copy ví tao " + SOL), []);
  assert.deepEqual(L.extractContracts("donate " + EVM), []);
});

test("chữ CA / contract là dấu hiệu gọi kèo", () => {
  assert.equal(L.extractContracts("CA: " + EVM).length, 1);
  assert.equal(L.extractContracts("contract " + SOL).length, 1);
});

test("địa chỉ EVM không bị đọc thêm thành một địa chỉ Solana nằm bên trong nó", () => {
  const r = L.extractContracts("$PEPE CA: " + EVM);
  assert.equal(r.length, 1);
  assert.equal(r[0].chain, "evm");
});

test("chữ 'ca' nằm trong từ khác không tính (cat, local…)", () => {
  assert.deepEqual(L.extractContracts("my cat is local " + SOL), []);
});

test("đuôi 'pump' tự nó là dấu hiệu token", () => {
  const pump = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9Puspump";
  assert.equal(L.extractContracts("lfg " + pump).length, 1);
});

test("địa chỉ nằm trong link (sau dấu /) bị bỏ — đó có thể là địa chỉ PAIR", () => {
  assert.deepEqual(L.extractContracts("$X dexscreener.com/solana/" + SOL), []);
});

test("chuỗi dài toàn chữ không bị nhận nhầm là địa chỉ Solana", () => {
  assert.deepEqual(L.extractContracts("$X " + "abcdefghijkmnopqrstuvwxyzABCDEFGH"), []);
});

test("cùng một CA hai lần trong tweet chỉ tính một", () => {
  assert.equal(L.extractContracts("$A " + SOL + " again " + SOL).length, 1);
});

test("cashtag: không nhận $100, không trùng, viết hoa", () => {
  assert.deepEqual(L.cashtags("$wif $WIF $100 and $bonk"), ["WIF", "BONK"]);
});

/* ---------- ghi trước / ghi muộn ---------- */

test("thấy trong 30 phút, không biết hệ số x → ghi trước", () => {
  assert.equal(L.observationClass(call({ calledAt: NOW - 20 * MIN })), "truoc");
});

test("thấy sau 30 phút, không biết hệ số x → ghi muộn (dù kèo thua hay thắng)", () => {
  assert.equal(L.observationClass(call({ calledAt: NOW - 45 * MIN })), "muon");
});

test("biết hệ số x: kèo chưa chạy + trong 2 giờ → ghi trước", () => {
  assert.equal(L.observationClass(call({ calledAt: NOW - 90 * MIN, multiple: 1.2 })), "truoc");
});

test("biết hệ số x: kèo đã chạy ≥1.5x thì dù mới 5 phút vẫn là ghi muộn", () => {
  assert.equal(L.observationClass(call({ calledAt: NOW - 5 * MIN, multiple: 3 })), "muon");
});

test("kèo đã SẬP (0.3x) nhưng thấy muộn → vẫn ghi muộn: luật theo giờ thấy, không theo kết quả", () => {
  assert.equal(L.observationClass(call({ calledAt: NOW - 5 * HOUR, multiple: 0.3 })), "muon");
});

test("thiếu giờ call → không rõ, KHÔNG tính là ghi trước", () => {
  assert.equal(L.observationClass(call({ calledAt: null })), "khong_ro");
});

test("thấy TRƯỚC giờ call quá 5 phút = giờ hỏng → không rõ", () => {
  assert.equal(L.observationClass(call({ calledAt: NOW + 10 * MIN })), "khong_ro");
  assert.equal(L.observationClass(call({ calledAt: NOW + 2 * MIN })), "truoc"); // lệch đồng hồ nhẹ
});

/* ---------- gộp ---------- */

test("thấy lại muộn hơn KHÔNG làm cú call ghi trước thành ghi muộn", () => {
  const first = call({ calledAt: NOW - 10 * MIN, seenAt: NOW });
  const later = call({ calledAt: NOW - 10 * MIN, seenAt: NOW + 3 * DAY, multiple: 20 });
  const merged = L.mergeCall(first, later);
  assert.equal(merged.firstSeenAt, NOW);
  assert.equal(merged.multipleAtFirstSeen, null);
  assert.equal(L.observationClass(merged), "truoc");
  assert.equal(merged.lastSeenAt, NOW + 3 * DAY);
});

test("lần thấy SỚM hơn về sau (thứ tự tin đảo) thì lấy lần sớm đó", () => {
  const late = call({ seenAt: NOW + 2 * HOUR, multiple: 4 });
  const early = call({ seenAt: NOW, multiple: 1.1 });
  const merged = L.mergeCall(late, early);
  assert.equal(merged.firstSeenAt, NOW);
  assert.equal(merged.multipleAtFirstSeen, 1.1);
});

test("gộp điền chỗ trống, không ghi đè thứ đã có", () => {
  const a = call({ tokenSymbol: "" });
  const b = call({ tokenSymbol: "PEPE", handle: "alice" });
  assert.equal(L.mergeCall(a, b).tokenSymbol, "PEPE");
  const c = call({ tokenSymbol: "OLD" });
  assert.equal(L.mergeCall(c, b).tokenSymbol, "OLD");
});

/* ---------- mốc token ---------- */

test("mốc tạo token: đọc giây lẫn mili giây, bỏ open_timestamp", () => {
  const t = Math.floor((NOW - DAY) / 1000);
  assert.equal(L.tokenCreatedAt({ creation_timestamp: t }, NOW).ts, t * 1000);
  assert.equal(L.tokenCreatedAt({ open_timestamp: t }, NOW), null);
  assert.equal(L.tokenCreatedAt({ created_at: NOW - HOUR }, NOW).key, "created_at");
});

test("mốc tạo token vô lý (0, tương lai xa) → không nhận", () => {
  assert.equal(L.tokenCreatedAt({ creation_timestamp: 0 }, NOW), null);
  assert.equal(L.tokenCreatedAt({ creation_timestamp: NOW + 30 * DAY }, NOW), null);
});

test("mốc tạo token: cột tin cậy hơn thắng", () => {
  const r = L.tokenCreatedAt({ created_at: NOW - HOUR, creation_timestamp: NOW - 2 * HOUR }, NOW);
  assert.equal(r.key, "creation_timestamp");
});

/* ---------- tóm tắt ---------- */

test("đếm theo (người, token): hô 5 lần một kèo vẫn là MỘT kèo", () => {
  const list = [1, 2, 3, 4, 5].map((i) => call({ id: "x:" + i + ":tok", tweetId: String(10000 + i) }));
  assert.equal(L.summarize(list, {}, NOW).calls, 1);
});

test("một kèo có một lần ghi trước là tính ghi trước", () => {
  const a = call({ id: "a", calledAt: NOW - 5 * HOUR }); // muộn
  const b = call({ id: "b", calledAt: NOW - 10 * MIN }); // trước
  const s = L.summarize([a, b], {}, NOW);
  assert.equal(s.truoc, 1);
  assert.equal(s.muon, 0);
});

test("số kèo nhiều nhất trong một ngày tính theo token khác nhau", () => {
  const day = new Date(2026, 8, 20, 10).getTime();
  const list = ["a", "b", "c"].map((t, i) => call({ id: "x:" + t, tokenKey: t, calledAt: day + i * HOUR }));
  list.push(call({ id: "x:d", tokenKey: "d", calledAt: day + 3 * DAY }));
  const s = L.summarize(list, {}, NOW);
  assert.equal(s.maxPerDay, 3);
  assert.equal(s.activeDays, 2);
});

test("tốc độ: dưới 3 kèo có mốc thì KHÔNG kết luận 'thường call…'", () => {
  const list = [call({ id: "1", tokenKey: "a", calledAt: NOW - 1 * HOUR })];
  const s = L.summarize(list, { a: { createdAt: NOW - 1 * HOUR - 30 * 1000 } }, NOW);
  assert.equal(s.speed.n, 1);
  assert.equal(s.speed.medianLabel, "");
  assert.ok(L.summaryParts(s).some((p) => p.includes("chưa đủ mốc")));
});

test("tốc độ: trung vị theo ô", () => {
  const created = NOW - 10 * DAY;
  const tokens = { a: { createdAt: created }, b: { createdAt: created }, c: { createdAt: created } };
  const list = [
    call({ id: "1", tokenKey: "a", calledAt: created + 30 * 1000 }), // ≤1 phút
    call({ id: "2", tokenKey: "b", calledAt: created + 3 * MIN }), // ≤5 phút
    call({ id: "3", tokenKey: "c", calledAt: created + 2 * DAY }), // ≤7 ngày
  ];
  const s = L.summarize(list, tokens, NOW);
  assert.equal(s.speed.n, 3);
  assert.equal(s.speed.medianLabel, "5 phút");
});

test("tốc độ: call TRƯỚC khi token tồn tại → loại, đếm riêng (mốc sai, không phải tiên tri)", () => {
  const list = [call({ id: "1", tokenKey: "a", calledAt: NOW - 2 * HOUR })];
  const s = L.summarize(list, { a: { createdAt: NOW - HOUR } }, NOW);
  assert.equal(s.speed.n, 0);
  assert.equal(s.speed.invalid, 1);
});

test("tốc độ lấy cú call SỚM NHẤT của người đó với token", () => {
  const created = NOW - DAY;
  const list = [
    call({ id: "1", tokenKey: "a", calledAt: created + 5 * HOUR }),
    call({ id: "2", tokenKey: "a", calledAt: created + 30 * 1000 }),
  ];
  const s = L.summarize(list, { a: { createdAt: created } }, NOW);
  assert.equal(s.speed.buckets[0], 1);
  assert.equal(s.speed.n, 1);
});

/* ---------- xoá bài ---------- */

function checked(over, results) {
  let c = call(over);
  for (const [result, at] of results) c = L.applyCheck(c, result, at);
  return c;
}

test("chỉ 404 là 'mất'; 429/403/500/mất mạng là 'không biết'", () => {
  assert.equal(L.classifyCheck(404, false), "missing");
  assert.equal(L.classifyCheck(200, true), "alive");
  assert.equal(L.classifyCheck(200, false), "unknown");
  for (const s of [0, 403, 429, 500]) assert.equal(L.classifyCheck(s, false), "unknown");
});

test("mất MỘT lần chưa tính; mất hai lần sát nhau chưa tính; cách ≥20h mới tính", () => {
  const t0 = NOW;
  assert.equal(L.confirmedMissing(checked({}, [["missing", t0]])), false);
  assert.equal(L.confirmedMissing(checked({}, [["missing", t0], ["missing", t0 + HOUR]])), false);
  assert.equal(L.confirmedMissing(checked({}, [["missing", t0], ["missing", t0 + 21 * HOUR]])), true);
});

test("mất rồi thấy lại = trục trặc tạm thời, xoá dấu mất", () => {
  const c = checked({}, [["missing", NOW], ["alive", NOW + DAY], ["missing", NOW + 2 * DAY]]);
  assert.equal(c.check.missCount, 1);
  assert.equal(L.confirmedMissing(c), false);
});

test("'không biết' không đụng vào dấu mất", () => {
  const c = checked({}, [["missing", NOW], ["unknown", NOW + DAY]]);
  assert.equal(c.check.missCount, 1);
});

test("xoá CHỌN LỌC: bài này mất nhưng bài khác cùng người còn sống → tính là xoá", () => {
  const gone = checked({ id: "g", tweetId: "11111", tokenKey: "a" }, [["missing", NOW], ["missing", NOW + DAY]]);
  const alive = checked({ id: "l", tweetId: "22222", tokenKey: "b" }, [["alive", NOW + DAY]]);
  const s = L.summarize([gone, alive], {}, NOW);
  assert.equal(s.deleted, 1);
  assert.equal(s.unreachable, 0);
});

test("MỌI bài đều mất = tài khoản khoá/xoá, KHÔNG tính là xoá chọn lọc", () => {
  const a = checked({ id: "a", tweetId: "11111", tokenKey: "a" }, [["missing", NOW], ["missing", NOW + DAY]]);
  const b = checked({ id: "b", tweetId: "22222", tokenKey: "b" }, [["missing", NOW], ["missing", NOW + DAY]]);
  const s = L.summarize([a, b], {}, NOW);
  assert.equal(s.deleted, 0);
  assert.equal(s.unreachable, 2);
});

test("bài còn sống từ TRƯỚC khi bài kia mất thì không làm bằng chứng", () => {
  const alive = checked({ id: "l", tweetId: "22222", tokenKey: "b" }, [["alive", NOW - DAY]]);
  const gone = checked({ id: "g", tweetId: "11111", tokenKey: "a" }, [["missing", NOW], ["missing", NOW + DAY]]);
  assert.equal(L.summarize([gone, alive], {}, NOW).deleted, 0);
});

test("chỉ tweet trên X, đủ 1 ngày tuổi, chưa quá 30 ngày mới đến lượt kiểm", () => {
  const list = [
    call({ id: "young", tweetId: "10001", calledAt: NOW - HOUR }),
    call({ id: "ok", tweetId: "10002", calledAt: NOW - 2 * DAY }),
    call({ id: "old", tweetId: "10003", calledAt: NOW - 40 * DAY }),
    call({ id: "thesis", source: "thesis", tweetId: "", calledAt: NOW - 2 * DAY }),
  ];
  assert.deepEqual(
    L.pickForCheck(list, NOW, 10).map((c) => c.id),
    ["ok"]
  );
});

test("vừa kiểm chưa đủ 24h thì chưa kiểm lại; đã xác nhận mất thì thôi", () => {
  const recent = checked({ id: "r", tweetId: "10004", calledAt: NOW - 3 * DAY }, [["alive", NOW - HOUR]]);
  const done = checked({ id: "d", tweetId: "10005", calledAt: NOW - 3 * DAY }, [
    ["missing", NOW - 3 * DAY],
    ["missing", NOW - 2 * DAY],
  ]);
  assert.deepEqual(L.pickForCheck([recent, done], NOW, 10), []);
});

/* ---------- dọn ---------- */

test("dọn: quá 90 ngày thì xoá, trừ người đã có hồ sơ", () => {
  const old = call({ id: "old", calledAt: NOW - 100 * DAY });
  const kept = call({ id: "kept", handle: "bob", calledAt: NOW - 100 * DAY });
  const fresh = call({ id: "fresh", calledAt: NOW - DAY });
  assert.deepEqual(L.pruneIds([old, kept, fresh], NOW, new Set(["x:bob"])), ["old"]);
});

/* ---------- chữ hiển thị ---------- */

test("không có kèo nào thì không có chữ nào (không bịa '0 kèo')", () => {
  assert.deepEqual(L.summaryParts(L.summarize([], {}, NOW)), []);
});

test("không có bài bị xoá thì không nhắc tới xoá bài", () => {
  const s = L.summarize([call({})], {}, NOW);
  assert.ok(!L.summaryParts(s).some((p) => p.includes("xoá")));
});
