/**
 * Kiểm tra tĩnh trước khi "Load unpacked" — `node scripts/check.mjs`.
 *
 * Chrome báo lỗi manifest rất tệ: sai một đường dẫn thì nó chỉ nói "Could not
 * load javascript ..." rồi tắt cả extension, còn thiếu một file trong danh
 * sách content script thì KHÔNG báo gì cả, panel chỉ đơn giản không hiện.
 * Ba phép kiểm dưới đây bắt đúng những ca đó.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const errors = [];
const checked = [];

function exists(rel, why) {
  if (!fs.existsSync(path.join(ROOT, rel))) errors.push(`Thiếu file: ${rel} (${why})`);
  else checked.push(rel);
}

/* 1. manifest trỏ tới file có thật */
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));

for (const size of Object.keys(manifest.icons || {})) exists(manifest.icons[size], "icons");
for (const size of Object.keys((manifest.action && manifest.action.default_icon) || {})) {
  exists(manifest.action.default_icon[size], "action.default_icon");
}
exists(manifest.background.service_worker, "background");
exists(manifest.action.default_popup, "action.default_popup");
exists(manifest.options_ui.page, "options_ui");
for (const cs of manifest.content_scripts) for (const f of cs.js) exists(f, "content_scripts");

/* 2. danh sách content script trong manifest == KT.CONTENT_FILES */
require(path.join(ROOT, "src/lib/config.js"));
const shared = globalThis.KT.CONTENT_FILES;
const inManifest = manifest.content_scripts[0].js;
if (JSON.stringify(shared) !== JSON.stringify(inManifest)) {
  errors.push(
    "manifest.content_scripts[0].js lệch với KT.CONTENT_FILES trong src/lib/config.js.\n" +
      `  manifest: ${inManifest.join(", ")}\n` +
      `  config:   ${shared.join(", ")}`
  );
}

function walkCollect(dir, into) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkCollect(full, into);
    else if (entry.name.endsWith(".js") || entry.name.endsWith(".html")) into.push(full);
  }
}

/* 3. mọi file .js trong repo phải parse được */
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith(".js") || entry.name.endsWith(".mjs")) {
      try {
        execFileSync(process.execPath, ["--check", full], { stdio: "pipe" });
      } catch (e) {
        errors.push(`Lỗi cú pháp: ${path.relative(ROOT, full)}\n${e.stderr}`);
      }
    }
  }
}
walk(ROOT);

/* 3b. dev/preview.html phải nạp ĐỦ content script
 *
 * Preview nạp script bằng tay nên rất dễ quên một file mới. Lúc đó content.js
 * ném lỗi giữa chừng và panel đơn giản là KHÔNG hiện — không có thông báo nào,
 * dễ tưởng mình vừa làm hỏng CSS. (Đã dính đúng ca này với note-box.js.)
 */
const previewPath = path.join(ROOT, "dev/preview.html");
if (fs.existsSync(previewPath)) {
  const preview = fs.readFileSync(previewPath, "utf8");
  const missing = shared.filter((f) => !preview.includes(f.replace(/^src\/|^content\//, "")));
  const reallyMissing = shared.filter((f) => !preview.includes("../" + f));
  if (reallyMissing.length) {
    errors.push(
      "dev/preview.html thiếu content script: " +
        reallyMissing.join(", ") +
        "\n  (thiếu là content.js ném lỗi giữa init, panel không hiện mà không báo gì)"
    );
  }
  void missing;
}

/* 3c. dev/x-preview.html phải nạp đủ content script của trang X
 *
 * Cùng một cách hỏng, chỉ khác trang: thiếu một file là x.js ném lỗi giữa
 * init, nút Ghi chú đơn giản không mọc, không có thông báo nào. Trước đây chỉ
 * preview của GMGN được kiểm — thêm file mới vào block X thì không ai nhắc.
 * (Đường dẫn ở đây TUYỆT ĐỐI vì trang tự đổi base URL — xem comment trong file.)
 */
const xPreviewPath = path.join(ROOT, "dev/x-preview.html");
if (fs.existsSync(xPreviewPath)) {
  const xPreview = fs.readFileSync(xPreviewPath, "utf8");
  const xFiles = (manifest.content_scripts.find((cs) => cs.js.includes("content/x.js")) || { js: [] }).js;
  const thieu = xFiles.filter((f) => !xPreview.includes('"/' + f + '"'));
  if (thieu.length) {
    errors.push(
      "dev/x-preview.html thiếu content script: " +
        thieu.join(", ") +
        "\n  (thiếu là x.js ném lỗi giữa init, nút Ghi chú không mọc mà không báo gì)"
    );
  }
}

/* 3d. KHÔNG được có hàm export ra KT mà chẳng ai gọi
 *
 * Đây là phép kiểm sinh ra sau khi xoá `stats.js`: 170 dòng chấm điểm track
 * record đã nằm đó không có một chỗ gọi nào, kèm 128 dòng test canh gác
 * chúng, kèm hai ô cài đặt trong Options chỉnh mà không đổi được gì. Không ai
 * cố tình để lại — chỉ là tính năng đổi hướng, code cũ không có gì nhắc nên
 * ở lại. Lần sau thì `npm run check` nhắc.
 *
 * Luật: mỗi `KT.<tên> = ...` trong `src/lib/` phải có ít nhất một chỗ đọc
 * `KT.<tên>` Ở FILE KHÁC (app hoặc test). Chỉ mình nó nhắc tên mình thì đó là
 * mặt tiền công khai không dẫn đi đâu cả.
 *
 * ⚠ Cố ý KHÔNG tính chỗ dùng trong `tests/` là đủ để sống: một hàm chỉ có
 * test gọi thì cái test đó đang chứng minh một thứ không ai dùng. Nhưng cũng
 * không báo đỏ ngay — liệt kê riêng để người đọc tự quyết.
 */
{
  const libFiles = fs
    .readdirSync(path.join(ROOT, "src/lib"))
    .filter((f) => f.endsWith(".js"))
    .map((f) => path.join("src/lib", f));

  const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
  const allFiles = [];
  walkCollect(path.join(ROOT, "src"), allFiles);
  for (const d of ["content", "background", "popup", "options", "dev", "tests"]) {
    walkCollect(path.join(ROOT, d), allFiles);
  }

  const mocCoi = [];
  for (const lib of libFiles) {
    const src = read(lib);
    for (const m of src.matchAll(/^\s*KT\.([A-Za-z_][A-Za-z0-9_]*)\s*=/gm)) {
      const ten = m[1];
      const re = new RegExp("KT\\." + ten + "\\b");
      let app = 0;
      let test = 0;
      for (const f of allFiles) {
        const rel = path.relative(ROOT, f);
        if (rel === lib) continue;
        if (!re.test(fs.readFileSync(f, "utf8"))) continue;
        if (rel.startsWith("tests" + path.sep)) test++;
        else app++;
      }
      // ⚠ Chỗ dùng trong `tests/` CŨNG tính là sống. Repo không có ES module
      // nên helper nội bộ phải export ra KT mới test được — bắt lỗi chúng là
      // ép người ta bỏ test, đúng thứ mình đang muốn có thêm.
      if (!app && !test) mocCoi.push(`${lib} → KT.${ten}`);
    }
  }

  if (mocCoi.length) {
    errors.push(
      "Export ra KT mà KHÔNG file nào khác đọc (code chết):\n  " +
        mocCoi.join("\n  ") +
        "\n  (xoá đi, hoặc nếu cố ý để dành thì đừng export)"
    );
  }
}

/* 4. <script src> và <link href> trong HTML trỏ đúng chỗ */
for (const html of ["popup/popup.html", "options/options.html"]) {
  const dir = path.dirname(path.join(ROOT, html));
  const src = fs.readFileSync(path.join(ROOT, html), "utf8");
  for (const m of src.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (/^(https?:)?\/\//.test(m[1])) continue;
    if (!fs.existsSync(path.join(dir, m[1]))) errors.push(`${html} trỏ tới file không có: ${m[1]}`);
  }
}

if (errors.length) {
  console.error("✕ " + errors.length + " vấn đề:\n\n" + errors.join("\n\n"));
  process.exit(1);
}
console.log(`✓ manifest, ${checked.length} file tham chiếu, cú pháp JS và link trong HTML đều ổn.`);
