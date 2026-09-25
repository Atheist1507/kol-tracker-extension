/**
 * Các file trong src/lib/ là script thường (gắn vào globalThis.KT) chứ không
 * phải ES module — vì content script của Chrome không nạp được module. Để
 * test vẫn chạy được bằng `node --test`, mỗi file tự export thêm kiểu CommonJS.
 * Helper này nạp đúng THỨ TỰ phụ thuộc rồi trả về KT đã đủ hàm.
 */
const path = require("path");

// ⚠ styles.js CÓ mặt ở đây dù nó chỉ là chuỗi CSS: khối `kt-brief-*` được
// dựng ở render.js nhưng định dạng thì nằm bên styles.js, và hai chỗ đó lệch
// nhau thì chữ vẫn hiện mà mất sạch định dạng — không lỗi, không triệu chứng.
// tests/render-brief.test.js khoá cặp đó lại, nên file này phải nạp được.
const FILES = ["normalize", "csv", "tier", "datetime", "model", "gmgn", "tooltip-text", "geom", "x-page", "sheet-url", "styles", "render", "ca", "ledger", "config"];
for (const f of FILES) require(path.join(__dirname, "..", "src", "lib", f + ".js"));

module.exports = globalThis.KT;
