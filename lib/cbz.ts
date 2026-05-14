import fs from "fs";
import path from "path";
import archiver from "archiver";
import yauzl, { ZipFile, Entry } from "yauzl";

const IMG_EXT = /\.(jpg|jpeg|png|webp|gif)$/i;

export async function writeCbz(filePath: string, images: Buffer[]): Promise<void> {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.part`;

  await new Promise<void>((resolve, reject) => {
    const out = fs.createWriteStream(tmpPath);
    const archive = archiver("zip", { zlib: { level: 0 } }); // images don't compress; stay fast

    out.on("close", () => resolve());
    out.on("error", reject);
    archive.on("error", reject);

    archive.pipe(out);
    const pad = String(images.length).length;
    images.forEach((buf, i) => {
      const ext = sniffImageExt(buf);
      const name = `${String(i + 1).padStart(pad, "0")}${ext}`;
      archive.append(buf, { name });
    });
    archive.finalize();
  });

  await fs.promises.rename(tmpPath, filePath);
}

function sniffImageExt(buf: Buffer): string {
  if (buf.length < 4) return ".jpg";
  if (buf[0] === 0xff && buf[1] === 0xd8) return ".jpg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return ".png";
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return ".gif";
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) return ".webp";
  return ".jpg";
}

export interface CbzEntry { name: string; index: number; }

// Returns sorted image entries inside a CBZ (read-only).
export function listCbzImages(cbzPath: string): Promise<CbzEntry[]> {
  return new Promise((resolve, reject) => {
    yauzl.open(cbzPath, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err || new Error("zip open failed"));
      const entries: string[] = [];
      zip.on("error", reject);
      zip.on("entry", (entry: Entry) => {
        if (!entry.fileName.endsWith("/") && IMG_EXT.test(entry.fileName)) {
          entries.push(entry.fileName);
        }
        zip.readEntry();
      });
      zip.on("end", () => {
        entries.sort(naturalCompare);
        resolve(entries.map((name, index) => ({ name, index })));
      });
      zip.readEntry();
    });
  });
}

// Stream a single image (by index in the sorted list) from a CBZ to a writable.
export async function streamCbzImage(cbzPath: string, pageIndex: number): Promise<{ buffer: Buffer; name: string }> {
  const list = await listCbzImages(cbzPath);
  if (pageIndex < 0 || pageIndex >= list.length) {
    throw new Error("Page out of range");
  }
  const target = list[pageIndex].name;

  return new Promise((resolve, reject) => {
    yauzl.open(cbzPath, { lazyEntries: true }, (err, zip: ZipFile | undefined) => {
      if (err || !zip) return reject(err || new Error("zip open failed"));
      zip.on("error", reject);
      zip.on("entry", (entry: Entry) => {
        if (entry.fileName !== target) {
          zip.readEntry();
          return;
        }
        zip.openReadStream(entry, (e, stream) => {
          if (e || !stream) return reject(e || new Error("read stream failed"));
          const chunks: Buffer[] = [];
          stream.on("data", (c: Buffer) => chunks.push(c));
          stream.on("end", () => resolve({ buffer: Buffer.concat(chunks), name: entry.fileName }));
          stream.on("error", reject);
        });
      });
      zip.on("end", () => reject(new Error("entry not found")));
      zip.readEntry();
    });
  });
}

export function countCbzPages(cbzPath: string): Promise<number> {
  return listCbzImages(cbzPath).then((e) => e.length).catch(() => 0);
}

// Natural sort so "page 2" comes before "page 10".
function naturalCompare(a: string, b: string): number {
  const ax: (string | number)[] = [];
  const bx: (string | number)[] = [];
  a.replace(/(\d+)|(\D+)/g, (_, n, s) => { ax.push(n ? parseInt(n, 10) : s.toLowerCase()); return ""; });
  b.replace(/(\d+)|(\D+)/g, (_, n, s) => { bx.push(n ? parseInt(n, 10) : s.toLowerCase()); return ""; });
  while (ax.length && bx.length) {
    const av = ax.shift()!;
    const bv = bx.shift()!;
    if (av === bv) continue;
    return av > bv ? 1 : -1;
  }
  return ax.length - bx.length;
}

