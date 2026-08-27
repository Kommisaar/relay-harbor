// 生成应用源图 app-icon.png（1024×1024 对角渐变，零依赖：Node 内置 zlib 手写 PNG）。
// 用途：`npx tauri icon app-icon.png` 的输入，派生 src-tauri/icons/ 全套图标。
// 换正式品牌图时：替换本脚本或直接放一张 1024×1024 PNG 为 app-icon.png 后重跑 tauri icon。
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const W = 1024;
const H = 1024;

// 对角渐变：深海军蓝 (11,46,79) → 港湾蓝 (61,139,255)
const raw = Buffer.alloc(H * (1 + W * 4));
const lerp = (a, b, t) => Math.round(a + (b - a) * t);
for (let y = 0; y < H; y++) {
  const row = y * (1 + W * 4);
  raw[row] = 0; // PNG 行滤波：None
  for (let x = 0; x < W; x++) {
    const t = (x / (W - 1) + y / (H - 1)) / 2;
    const o = row + 1 + x * 4;
    raw[o] = lerp(11, 61, t);
    raw[o + 1] = lerp(46, 139, t);
    raw[o + 2] = lerp(79, 255, t);
    raw[o + 3] = 255;
  }
}

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // 位深
ihdr[9] = 6; // RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

writeFileSync(new URL("../app-icon.png", import.meta.url), png);
console.log("app-icon.png 已生成（1024×1024，RGBA）");
