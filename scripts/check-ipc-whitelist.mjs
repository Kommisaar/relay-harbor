// CON-009 / ADR-006 机器校验：IPC 命令白名单断言。
// 1) 已注册命令 ⊆ config/ipc-command-whitelist.json（白名单外命令 = 失败）；
// 2) interfaces 层标注 #[tauri::command] 的函数必须全部注册（无死命令）；
// 3) 白名单与已注册命令均不得含业务写前缀；
// 4) STRICT=1 时要求全等（M1 命令面完成后在 CI 启用）。
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const whitelistPath = join(root, "config", "ipc-command-whitelist.json");
const interfacesDir = join(root, "src-tauri", "src", "interfaces");

const config = JSON.parse(readFileSync(whitelistPath, "utf8"));
const whitelist = new Set(config.commands);

function listRustFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listRustFiles(full));
    else if (name.endsWith(".rs")) out.push(full);
  }
  return out;
}

// 收集 interfaces 层全部 #[tauri::command] 标注的函数名
const declared = [];
for (const file of listRustFiles(interfacesDir)) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes("#[tauri::command]")) continue;
    const fnLine = lines
      .slice(i + 1)
      .find((l) => /^\s*(pub\s+)?(async\s+)?fn\s+\w+/.test(l));
    const match = fnLine?.match(/fn\s+(\w+)/);
    if (match?.[1]) declared.push(match[1]);
  }
}

// 收集组合根注册的命令（collect_commands! / generate_handler!）
const registered = [];
const rootRs = join(root, "src-tauri", "src");
for (const file of listRustFiles(rootRs)) {
  const text = readFileSync(file, "utf8");
  for (const macro of text.matchAll(/(collect_commands|generate_handler)!\[([^\]]*)\]/g)) {
    for (const item of macro[2].split(",")) {
      const name = item.trim().split("::").pop()?.trim();
      if (name) registered.push(name);
    }
  }
}

const errors = [];
const declaredSet = new Set(declared);
const registeredSet = new Set(registered);

for (const name of declaredSet) {
  if (!whitelist.has(name)) errors.push(`命令 ${name} 不在白名单内（CON-009）`);
}
for (const name of declaredSet) {
  if (!registeredSet.has(name)) errors.push(`命令 ${name} 已声明 #[tauri::command] 但未注册`);
}
for (const name of [...whitelist, ...declaredSet]) {
  if (config.forbiddenPrefixes.some((p) => name.startsWith(p))) {
    errors.push(`命令 ${name} 命中业务写前缀（CON-009：UI 只读边界）`);
  }
}
if (process.env.STRICT === "1") {
  for (const name of whitelist) {
    if (!declaredSet.has(name)) errors.push(`[STRICT] 白名单命令 ${name} 尚未实现`);
  }
}

const missing = [...whitelist].filter((n) => !declaredSet.has(n));
console.log(`IPC 白名单：白名单 ${whitelist.size} 个，声明 ${declaredSet.size} 个，注册 ${registeredSet.size} 个`);
if (missing.length > 0) {
  console.log(`尚未实现（M1 实现任务落地，STRICT=1 时将失败）：${missing.join(", ")}`);
}
if (errors.length > 0) {
  console.error(`\nIPC 白名单检查失败：`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("IPC 白名单检查通过");
