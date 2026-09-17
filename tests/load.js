/**
 * Các file trong src/lib/ là script thường (gắn vào globalThis.KT) chứ không
 * phải ES module — vì content script của Chrome không nạp được module. Để
 * test vẫn chạy được bằng `node --test`, mỗi file tự export thêm kiểu CommonJS.
 * Helper này nạp đúng THỨ TỰ phụ thuộc rồi trả về KT đã đủ hàm.
 */
const path = require("path");

const FILES = ["normalize", "csv", "tier", "stats", "model", "gmgn", "tooltip-text", "geom", "sheet-url", "render", "config"];
for (const f of FILES) require(path.join(__dirname, "..", "src", "lib", f + ".js"));

module.exports = globalThis.KT;
