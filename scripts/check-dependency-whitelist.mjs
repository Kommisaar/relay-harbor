// CON-008 / ADR-007 机器校验：npm 依赖白名单。
// package.json 中安装的每个包必须出现在 config/dependency-whitelist.json；
// 名单外的包（含 v8 组件库、Tailwind、编辑器、dnd、@xyflow）一律失败。
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const whitelist = JSON.parse(readFileSync(join(root, "config", "dependency-whitelist.json"), "utf8"));

const errors = [];
for (const section of ["dependencies", "devDependencies"]) {
  const installed = pkg[section] ?? {};
  for (const name of Object.keys(installed)) {
    if (!whitelist[section]?.includes(name)) {
      errors.push(`${section} 中的 ${name} 不在依赖白名单（先改 config/dependency-whitelist.json，经设计确认后再安装）`);
    }
  }
}

if (errors.length > 0) {
  console.error("依赖白名单检查失败：");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("依赖白名单检查通过");
