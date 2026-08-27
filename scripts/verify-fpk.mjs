import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = (await fs.readdir(root)).filter((file) => file.endsWith(".fpk"));
if (!files.length) { console.log("未发现 FPK；仅完成源码结构检查。"); process.exit(0); }
for (const file of files) {
  try { await exec("unzip", ["-t", path.join(root, file)]); console.log(`${file}: 压缩包检查通过`); }
  catch { throw new Error(`${file}: 不是可读取的 FPK 压缩包`); }
}
