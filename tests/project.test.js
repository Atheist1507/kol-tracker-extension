const test = require("node:test");
const assert = require("node:assert/strict");
const KT = require("./load");
const P = KT.project;

const DAY = 86400000;

test("ghi rồi đọc lại ra đúng phiếu chấm", () => {
  const card = { category: "launchpad", scores: { ship: 1, users: 0, team: 1, builder: -1, community: 0 }, text: "mới có testnet" };
  const text = P.format(card);
  assert.ok(text.startsWith("[Dự án] loại:launchpad · ship:có"));
  assert.deepEqual(P.parse(text), card);
});

test("ghi chú thường không phải dự án", () => {
  assert.equal(P.parse("call sớm, có luận điểm"), null);
  assert.equal(P.parse(""), null);
});

test("sửa tay trong Sheet: gõ không dấu, hoa thường lẫn lộn vẫn đọc được", () => {
  const r = P.parse("[du an] loai:DEX · Ship:có · nguoi dung:không");
  assert.equal(r.category, "DEX");
  assert.equal(r.scores.ship, 1);
  assert.equal(r.scores.users, -1);
});

test("giá trị lạ hoặc thiếu câu hỏi → 'chưa biết' (0), không đoán là có/không", () => {
  const r = P.parse("[Dự án] ship:chắc có · team:");
  assert.equal(r.scores.ship, 0);
  assert.equal(r.scores.team, 0);
  assert.equal(r.scores.builder, 0);
});

test("dấu gạch ngang trong phần ghi chú tự do không phá phiếu chấm", () => {
  const r = P.parse(P.format({ scores: { ship: 1 }, text: "v2 — ra tuần sau — chắc vậy" }));
  assert.equal(r.scores.ship, 1);
  assert.equal(r.text, "v2 — ra tuần sau — chắc vậy");
});

test("tóm tắt lấy lần kiểm MỚI NHẤT và so với lần trước", () => {
  const notes = [
    { note: P.format({ scores: { ship: 1, users: 1, team: 1 } }), notedTs: 3 * DAY },
    { note: "ghi chú thường chen giữa", notedTs: 2 * DAY },
    { note: P.format({ scores: { ship: 1 } }), notedTs: 1 * DAY },
  ];
  const p = P.fromNotes(notes);
  assert.equal(p.yes, 3);
  assert.equal(p.prevYes, 1);
  assert.equal(p.checks, 2);
  assert.equal(P.scoreLabel(p), "3/5 ↑ từ 1");
});

test("lần kiểm đầu tiên thì không có mũi tên", () => {
  const p = P.fromNotes([{ note: P.format({ scores: { ship: 1 } }), notedTs: DAY }]);
  assert.equal(P.scoreLabel(p), "1/5");
});

test("chưa có ghi chú dự án nào → không phải dự án", () => {
  assert.equal(P.fromNotes([{ note: "bình thường" }]), null);
});

test("quá 7 ngày chưa kiểm thì nhắc; không rõ ngày kiểm cũng nhắc", () => {
  const now = 30 * DAY;
  assert.equal(P.isStale({ checkedTs: now - 8 * DAY }, now), true);
  assert.equal(P.isStale({ checkedTs: now - 2 * DAY }, now), false);
  assert.equal(P.isStale({ checkedTs: null }, now), true);
});

test("buildDb gắn tóm tắt dự án vào hồ sơ", () => {
  const db = KT.buildDb(
    [{ wallet: "x:projx", username: "projx" }],
    [{ wallet: "x:projx", username: "projx", note: P.format({ category: "DEX", scores: { ship: 1 } }), noted_at: "2026-09-20" }]
  );
  assert.equal(db.people[0].project.category, "DEX");
  assert.equal(db.people[0].project.yes, 1);
});

test("hiển thị gọn: ghi chú dự án thành '◆ điểm · loại — chữ', ghi chú thường giữ nguyên", () => {
  assert.equal(P.displayNote(P.format({ category: "DEX", scores: { ship: 1, team: 1 }, text: "có mainnet" })), "◆ 2/5 · DEX — có mainnet");
  assert.equal(P.displayNote("call sớm"), "call sớm");
});
