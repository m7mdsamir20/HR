// Draws the app icons (PWA install icon, maskable icon, iOS touch icon) as PNGs with no image
// dependency: an approval stamp (two rings and a check) in the approval colour on the navy of the
// sign-in panel. It is a neutral mark, not a product logo (CLAUDE.md §1).
//   node scripts/make-icons.mjs        → public/icons/*.png
import { mkdirSync, writeFileSync } from "node:fs";
import { crc32, deflateSync } from "node:zlib";

const NAVY = [24, 35, 61];
const STAMP = [76, 180, 135];
const WHITE = [255, 255, 255];
const SS = 4; // supersampling per axis

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Colour of the artwork at a point in 0..1 space (content scaled about the centre by `scale`).
function sample(x, y, scale) {
  const px = (x - 0.5) / scale + 0.5;
  const py = (y - 0.5) / scale + 0.5;
  const r = Math.hypot(px - 0.5, py - 0.5);
  if (Math.abs(r - 0.34) < 0.019) return STAMP;
  if (Math.abs(r - 0.272) < 0.007) return [STAMP[0] * 0.6 + NAVY[0] * 0.4, STAMP[1] * 0.6 + NAVY[1] * 0.4, STAMP[2] * 0.6 + NAVY[2] * 0.4];
  const check = Math.min(distToSegment(px, py, 0.36, 0.52, 0.46, 0.62), distToSegment(px, py, 0.46, 0.62, 0.65, 0.4));
  if (check < 0.026) return WHITE;
  return NAVY;
}

function render(size, scale, rgba = false) {
  const channels = rgba ? 4 : 3;
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * channels);
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = sample((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size, scale);
          r += c[0]; g += c[1]; b += c[2];
        }
      }
      const n = SS * SS;
      row[1 + x * channels] = Math.round(r / n);
      row[2 + x * channels] = Math.round(g / n);
      row[3 + x * channels] = Math.round(b / n);
      if (rgba) row[4 + x * channels] = 255;
    }
    rows.push(row);
  }
  return png(size, Buffer.concat(rows), rgba);
}

function png(size, raw, rgba = false) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(8 + data.length + 4);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), 8 + data.length);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = rgba ? 6 : 2; // colour type: RGBA or RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync("public/icons", { recursive: true });
// "any" icons use the full artwork; the maskable one keeps it inside the 80% safe zone.
writeFileSync("public/icons/icon-192.png", render(192, 1));
writeFileSync("public/icons/icon-512.png", render(512, 1));
writeFileSync("public/icons/icon-maskable-512.png", render(512, 0.8));
writeFileSync("public/icons/apple-touch-icon.png", render(180, 1));
// favicon.ico: a one-image ICO container around the 48x48 PNG (replaces the framework's default icon).
const fav = render(48, 1, true); // the framework needs RGBA inside an ICO
const ico = Buffer.alloc(22);
ico.writeUInt16LE(0, 0); // reserved
ico.writeUInt16LE(1, 2); // type: icon
ico.writeUInt16LE(1, 4); // one image
ico[6] = 48; // width
ico[7] = 48; // height
ico.writeUInt16LE(1, 10); // colour planes
ico.writeUInt16LE(32, 12); // bits per pixel
ico.writeUInt32LE(fav.length, 14); // image size
ico.writeUInt32LE(22, 18); // image offset
writeFileSync("src/app/favicon.ico", Buffer.concat([ico, fav]));
console.log("icons written to public/icons and src/app/favicon.ico");
