// Regenerates this app's logo files. The results are committed, so this only needs to run when the logo changes:
//   node scripts/make-icons.mjs
import { mkdirSync, writeFileSync } from "fs";
import { dirname } from "path";
import sharp from "sharp";

const GLYPH = `
    <ellipse cx="256" cy="256" rx="214" ry="74" transform="rotate(-24 256 256)" fill="none" stroke="#22d3ee" stroke-width="16" opacity="0.55"/>
    <path d="M154 122h204a42 42 0 0 1 42 42v132a42 42 0 0 1-42 42H262l-74 62 12-62h-46a42 42 0 0 1-42-42V164a42 42 0 0 1 42-42z" fill="url(#g)"/>
    <rect x="150" y="160" width="92" height="74" rx="10" fill="#0a0a12"/>
    <rect x="258" y="160" width="104" height="74" rx="10" fill="#0a0a12"/>
    <rect x="150" y="250" width="212" height="56" rx="10" fill="#0a0a12"/>
    <path d="M60.5 343.1A214 74 -24 0 0 451.5 168.9" fill="none" stroke="#22d3ee" stroke-width="16" stroke-linecap="round"/>
    <circle cx="433" cy="222" r="30" fill="#f472b6"/>
  `;

// scale shrinks the symbol inside the tile. rounded leaves see-through corners, for browsers. iOS and
// Android crop icons themselves, so theirs stay square.
const svg = (scale, rounded) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="bg" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="#241a3d"/><stop offset="1" stop-color="#0a0a12"/></radialGradient>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#22d3ee"/><stop offset="0.5" stop-color="#a855f7"/><stop offset="1" stop-color="#f472b6"/></linearGradient>
  </defs>
  <rect width="512" height="512" rx="${rounded ? 104 : 0}" fill="url(#bg)"/>
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">${GLYPH}</g>
</svg>`);

// A .ico file that wraps PNGs, which every current browser and Windows accepts.
async function ico(file) {
  const sizes = [16, 32, 48, 256];
  const images = await Promise.all(sizes.map(s => sharp(svg(0.9, true)).resize(s, s).png().toBuffer()));
  const head = Buffer.alloc(6 + 16 * sizes.length);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(sizes.length, 4);
  let offset = head.length;
  sizes.forEach((s, i) => {
    const e = 6 + 16 * i;
    head[e] = s === 256 ? 0 : s;
    head[e + 1] = s === 256 ? 0 : s;
    head.writeUInt16LE(1, e + 4);
    head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(images[i].length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += images[i].length;
  });
  writeFileSync(file, Buffer.concat([head, ...images]));
}

const OUT = [["public/favicon.png", 256, "any"], ["public/icons/icon-192x192.png", 192, "any"], ["public/icons/icon-512x512.png", 512, "any"], ["public/icons/apple-touch-icon-180x180.png", 180, "full"], ["public/icons/icon-maskable-512x512.png", 512, "mask"]];
for (const [file, size, kind] of OUT) {
  mkdirSync(dirname(file), { recursive: true });
  const scale = kind === "mask" ? 0.66 : 0.82;
  await sharp(svg(scale, kind === "any")).resize(size, size).png({ compressionLevel: 9 }).toFile(file);
  console.log(file);
}
await ico("ComicOrbit logo.ico");
mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icons/logo.svg", svg(0.82, true));
