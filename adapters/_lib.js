// MCC Adapter shared library (纯 Node.js，无外部依赖)
// Windows 兼容，幂等，错误明确

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ---------- FS 工具 ----------

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function pathExists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

function assertExists(p, hint) {
  if (!pathExists(p)) {
    throw new Error(
      `[MCC adapter] 源文件/目录不存在: ${p}` +
        (hint ? `\n  提示: ${hint}` : '')
    );
  }
}

function listDir(dir) {
  if (!pathExists(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true });
}

// 递归列出目录里所有文件（相对路径）
function walkFiles(root) {
  const out = [];
  if (!pathExists(root)) return out;
  const stack = [''];
  while (stack.length) {
    const rel = stack.pop();
    const abs = path.join(root, rel);
    const entries = fs.readdirSync(abs, { withFileTypes: true });
    for (const e of entries) {
      const childRel = rel ? path.join(rel, e.name) : e.name;
      if (e.isDirectory()) {
        stack.push(childRel);
      } else if (e.isFile()) {
        out.push(childRel);
      }
    }
  }
  return out.sort();
}

function readText(p) {
  assertExists(p);
  return fs.readFileSync(p, 'utf8');
}

function writeText(p, content) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, content, 'utf8');
}

function copyFile(src, dst) {
  assertExists(src);
  ensureDir(path.dirname(dst));
  fs.copyFileSync(src, dst);
}

// 递归拷贝目录（保持相对结构）
function copyDir(srcDir, dstDir) {
  assertExists(srcDir);
  ensureDir(dstDir);
  const files = walkFiles(srcDir);
  const copied = [];
  for (const rel of files) {
    const src = path.join(srcDir, rel);
    const dst = path.join(dstDir, rel);
    copyFile(src, dst);
    copied.push(rel);
  }
  return copied;
}

// 写 .gitkeep 占位
function placeholderDir(dir) {
  ensureDir(dir);
  const keep = path.join(dir, '.gitkeep');
  if (!pathExists(keep)) {
    fs.writeFileSync(keep, '');
  }
}

// 清空一个目录的内容（幂等重建前用），保留目录本身
function clearDir(dir) {
  if (!pathExists(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    fs.rmSync(p, { recursive: true, force: true });
  }
}

// ---------- Frontmatter 解析 ----------

// 极简 YAML frontmatter 解析（只支持 MCC 用到的：name / description / tools / model / argument-hint）
// 返回 { frontmatter, body, raw }
function parseFrontmatter(md) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(md);
  if (!m) {
    return { frontmatter: null, body: md, raw: md, hasFrontmatter: false };
  }
  const block = m[1];
  const body = m[2];
  // 按行解析
  const fm = {};
  const lines = block.split(/\r?\n/);
  let currentKey = null;
  for (const line of lines) {
    if (!line.trim()) continue;
    // 顶级 key: value
    const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (kv) {
      const key = kv[1];
      let val = kv[2];
      // 数组 inline: [a, b, c]
      if (/^\[.*\]$/.test(val.trim())) {
        const inner = val.trim().slice(1, -1).trim();
        const items = inner
          ? inner
              .split(',')
              .map((s) => stripQuotes(s.trim()))
              .filter((s) => s.length > 0)
          : [];
        fm[key] = items;
      } else if (val === '' || val === '|' || val === '>') {
        fm[key] = '';
        currentKey = key;
      } else {
        fm[key] = stripQuotes(val.trim());
      }
    }
  }
  return { frontmatter: fm, body, raw: md, hasFrontmatter: true, block };
}

function stripQuotes(s) {
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    return s.slice(1, -1);
  }
  return s;
}

// 把 frontmatter 对象序列化回 YAML（MCC 专用简版）
function serializeFrontmatter(fm) {
  const order = ['name', 'description', 'tools', 'model', 'argument-hint'];
  const keys = [
    ...order.filter((k) => k in fm),
    ...Object.keys(fm).filter((k) => !order.includes(k)),
  ];
  const lines = [];
  for (const k of keys) {
    const v = fm[k];
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      const inner = v.map(yamlScalar).join(', ');
      lines.push(`${k}: [${inner}]`);
    } else if (typeof v === 'string') {
      lines.push(`${k}: ${yamlScalar(v)}`);
    } else {
      lines.push(`${k}: ${String(v)}`);
    }
  }
  return lines.join('\n');
}

function yamlScalar(s) {
  if (typeof s !== 'string') return String(s);
  // 如果有冒号、引号、开头空格等，用双引号包
  if (/[:\n"'#]|^\s|\s$/.test(s)) {
    return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  }
  return s;
}

// ---------- 校验 / Manifest ----------

function sha256OfFile(p) {
  const data = fs.readFileSync(p);
  return crypto.createHash('sha256').update(data).digest('hex');
}

function statSize(p) {
  return fs.statSync(p).size;
}

// ---------- Logger ----------

function makeLogger(prefix) {
  return {
    info: (msg) => console.log(`[${prefix}] ${msg}`),
    warn: (msg) => console.warn(`[${prefix}] WARN: ${msg}`),
    step: (msg) => console.log(`[${prefix}]  · ${msg}`),
  };
}

module.exports = {
  ensureDir,
  pathExists,
  assertExists,
  listDir,
  walkFiles,
  readText,
  writeText,
  copyFile,
  copyDir,
  placeholderDir,
  clearDir,
  parseFrontmatter,
  serializeFrontmatter,
  sha256OfFile,
  statSize,
  makeLogger,
};
