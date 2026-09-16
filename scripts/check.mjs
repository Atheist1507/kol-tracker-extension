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
