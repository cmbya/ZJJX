import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = (await fs.readdir(root)).filter((file) => file.endsWith(".fpk"));

if (!files.length) {
  console.log("未发现 FPK；仅完成源码结构检查。");
  process.exit(0);
}

for (const file of files) {
  const fullPath = path.join(root, file);
  const stat = await fs.stat(fullPath);
  if (!stat.isFile() || stat.size === 0) {
    throw new Error(`${file}: FPK 文件不存在或为空`);
  }
  console.log(`${file}: FPK 产物检查通过（${stat.size} bytes）`);
}
