const test = require("node:test");
const assert = require("node:assert");
const KT = require("./load");

const SOL = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin"; // 44 ký tự
const EVM = "0x" + "aF".repeat(20);

test("bắt được địa chỉ Solana giữa một câu", () => {
  const got = KT.ca.findAddresses("ape this now " + SOL + " 100x ez");
  assert.deepStrictEqual(got, [{ addr: SOL, chain: "sol" }]);
});

test("bắt được địa chỉ EVM", () => {
  const got = KT.ca.findAddresses("CA: " + EVM);
  assert.deepStrictEqual(got, [{ addr: EVM, chain: "evm" }]);
});

test("CHỮ KÝ giao dịch 88 ký tự KHÔNG được thành địa chỉ", () => {
  // Đây là cái bẫy của regex quét giữa câu: nó trượt sang vị trí 44 rồi khớp
  // trọn 44 ký tự cuối, ra một "địa chỉ" là nửa sau của một chữ ký giao dịch.
  const sig = "5".repeat(1) + "2".repeat(87); // 88 ký tự base58
  assert.strictEqual(sig.length, 88);
  assert.deepStrictEqual(KT.ca.findAddresses("tx " + sig), []);
});

test("hash hex 32 ký tự (kiểu tên ảnh của GMGN) không phải contract", () => {
  assert.deepStrictEqual(KT.ca.findAddresses("0488b03e9e3403dd0ad3fd9b58f31d2c"), []);
});

test("chữ thường thông thường không bị nhận nhầm", () => {
  const cau = "thang nay hay ho thue roi xoa bai, khong tin duoc dau nhe ban oi";
  assert.deepStrictEqual(KT.ca.findAddresses(cau), []);
});

test("dán hai lần cùng một địa chỉ chỉ ra một chip", () => {
  const got = KT.ca.findAddresses(SOL + " ... " + SOL);
  assert.strictEqual(got.length, 1);
});

test("EVM khác hoa thường vẫn là một địa chỉ", () => {
  const got = KT.ca.findAddresses(EVM + " " + EVM.toLowerCase());
  assert.strictEqual(got.length, 1);
});

test("link GMGN: sol đi sol, 0x thì ĐOÁN eth", () => {
  assert.strictEqual(KT.ca.gmgnUrl(SOL, "sol"), "https://gmgn.ai/sol/token/" + SOL);
  assert.strictEqual(KT.ca.gmgnUrl(EVM, "evm"), "https://gmgn.ai/eth/token/" + EVM);
});

test("địa chỉ rút gọn vẫn nhận ra được", () => {
  assert.strictEqual(KT.ca.shortAddr(SOL), "9xQeWv…usVFin");
  assert.strictEqual(KT.ca.shortAddr("ngan"), "ngan");
});

test("URL có chứa địa chỉ vẫn bắt được (dấu / là ranh giới từ)", () => {
  const got = KT.ca.findAddresses("https://dexscreener.com/solana/" + SOL);
  assert.deepStrictEqual(got, [{ addr: SOL, chain: "sol" }]);
});
