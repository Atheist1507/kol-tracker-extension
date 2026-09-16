/**
 * Sinh icon PNG cho extension — `node scripts/gen-icons.mjs`.
 *
 * Tự vẽ + tự đóng gói PNG bằng zlib có sẵn của Node, KHÔNG thêm dependency:
 * cả project không có node_modules, thêm một thư viện vẽ ảnh chỉ để làm 4 cái
 * icon là đổi hẳn tính chất của repo (clone về là "Load unpacked" chạy luôn).
 *
 * Hình: vòng tròn màu quanh một avatar — đúng thứ extension làm trên chart.
 */
import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "icons");
const SIZES = [16, 32, 48, 128];
const SS = 3; // siêu lấy mẫu 3×3 để cạnh không răng cưa

const BG = [0x12, 0x16, 0x1c];
const FACE = [0x2a, 0x32, 0x3d];
const RING = [0xe8, 0xb8, 0x4b];

const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Màu của MỘT mẫu tại toạ độ (x, y) trong hệ 0..1. */
function sample(u, v) {
  // Nền bo góc
  const r = 0.22;
  const dx = Math.max(Math.abs(u - 0.5) - (0.5 - r), 0);
  const dy = Math.max(Math.abs(v - 0.5) - (0.5 - r), 0);
  if (Math.hypot(dx, dy) > r) return null; // ngoài khung → trong suốt

  const d = Math.hypot(u - 0.5, v - 0.5);
  if (d <= 0.235) return FACE; // mặt avatar
  if (d <= 0.325) return RING; // vòng tier
  return BG;
}

function render(size) {
  const buf = Buffer.alloc(size * size * 4);
  const n = SS * SS;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = sample((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size);
          if (c) {
            r += c[0];
            g += c[1];
            b += c[2];
            a += 255;
          }
        }
      }
      const i = (y * size + x) * 4;
      // Nhân alpha ngược lại để cạnh không bị viền đen
      buf[i] = a ? Math.round(r / (a / 255)) : 0;
      buf[i + 1] = a ? Math.round(g / (a / 255)) : 0;
      buf[i + 2] = a ? Math.round(b / (a / 255)) : 0;
      buf[i + 3] = Math.round(a / n);
    }
  }
  return encodePng(size, size, buf);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const size of SIZES) {
  const file = path.join(OUT_DIR, `icon-${size}.png`);
  fs.writeFileSync(file, render(size));
  console.log("wrote", path.relative(process.cwd(), file));
}
