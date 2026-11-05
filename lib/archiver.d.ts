// archiver 8 ships without type definitions. This covers the parts used here.
declare module "archiver" {
  import { Transform } from "stream";
  export class ZipArchive extends Transform {
    constructor(options?: { zlib?: { level?: number } });
    append(source: Buffer | string, data: { name: string }): this;
    directory(dirpath: string, destpath: string | false): this;
    finalize(): Promise<void>;
    abort(): this;
  }
}
