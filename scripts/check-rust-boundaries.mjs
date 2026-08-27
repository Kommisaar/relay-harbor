// CON-002 / ADR-001 / ADR-008 机器校验：Rust 四层边界（单 crate 内的目录边界 lint）。
// 依赖方向：interfaces → services → domain ← infra；组合根 state.rs 装配。
//  1) domain 禁 tauri::/sqlx::/axum::，禁引用 crate::interfaces|infra|services；
//  2) services 禁 tauri::/sqlx::/axum::（不依赖框架），禁引用 crate::interfaces|infra；
//  3) infra 禁引用 crate::interfaces|services（infra → domain 单向）；
//  4) interfaces 禁引用 crate::state；
//  5) 全仓禁 mod.rs（2018 模块风格：xxx.rs + xxx/，ADR-001）。
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src-tauri", "src");

function listRustFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listRustFiles(full));
    else if (name.endsWith(".rs")) out.push(full);
  }
  return out;
}

const layerOf = (file) => {
  const rel = relative(srcDir, file).replace(/\\/g, "/");
  if (rel.startsWith("domain/")) return "domain";
  if (rel.startsWith("services/")) return "services";
  if (rel.startsWith("infra/")) return "infra";
  if (rel.startsWith("interfaces/")) return "interfaces";
  return "root"; // lib.rs / state.rs / main.rs（组合根）
};

const FRAMEWORKS = /\b(tauri|sqlx|axum)::/;
const rules = {
  domain: { frameworks: true, forbiddenModules: /crate::(interfaces|infra|services)\b/ },
  services: { frameworks: true, forbiddenModules: /crate::(interfaces|infra)\b/ },
  infra: { frameworks: false, forbiddenModules: /crate::(interfaces|services)\b/ },
  interfaces: { frameworks: false, forbiddenModules: /crate::state\b/ },
  root: { frameworks: false, forbiddenModules: null },
};

const errors = [];
for (const file of listRustFiles(srcDir)) {
  const rel = relative(srcDir, file).replace(/\\/g, "/");
  if (rel.endsWith("mod.rs") || rel.split("/").pop() === "mod.rs") {
    errors.push(`${rel}：禁用 mod.rs（2018 模块风格，ADR-001）`);
  }
  const layer = layerOf(file);
  const rule = rules[layer];
  const text = readFileSync(file, "utf8");
  if (rule.frameworks && FRAMEWORKS.test(text)) {
    errors.push(`${rel}：${layer} 层禁用 tauri::/sqlx::/axum::（ADR-001）`);
  }
  if (rule.forbiddenModules?.test(text)) {
    errors.push(`${rel}：违反依赖方向 interfaces → services → domain ← infra（ADR-001）`);
  }
}

if (errors.length > 0) {
  console.error("Rust 分层边界检查失败：");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("Rust 分层边界检查通过");
