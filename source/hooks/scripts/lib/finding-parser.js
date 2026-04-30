'use strict';

/**
 * finding-parser — 把 codex audit 的自由文本输出解析成结构化 finding 列表。
 *
 * codex 输出风格大致：
 *
 *   [Critical/High/Medium/Low] file.js:line — 一句话问题描述
 *     - 攻击向量/触发场景
 *     - 修复建议
 *
 * 但 LLM 输出不稳定，可能有变化（中文标点 / emoji / 不同分隔符）。
 * 这个 parser 用宽松正则尽力解析；解析不出的也保留 raw 文本让 Claude 兜底。
 *
 * 用法:
 *   const { parseFindings } = require('./finding-parser');
 *   const findings = parseFindings(codexOutput);
 *   for (const f of findings) {
 *     // f = { severity, file, line, summary, raw }
 *   }
 */

// 严重度关键词（中英都支持）
const SEVERITY_PATTERNS = [
  { name: 'critical', re: /\b(critical|严重|致命)\b/i },
  { name: 'high',     re: /\b(high|高危|高)\b/i },
  { name: 'medium',   re: /\b(medium|中危|中)\b/i },
  { name: 'low',      re: /\b(low|低危|低|nit)\b/i },
];

const SEVERITY_RANK = { critical: 4, high: 3, medium: 2, low: 1 };

/**
 * 从一行字符串里抽 severity（找到第一个匹配的）。
 */
function extractSeverity(line) {
  // 先看带方括号的：[Critical] / [HIGH]
  const bracketed = line.match(/\[(critical|high|medium|low|nit|严重|致命|高危|中危|低危)\]/i);
  if (bracketed) {
    const word = bracketed[1].toLowerCase();
    for (const p of SEVERITY_PATTERNS) {
      if (p.re.test(word)) return p.name;
    }
  }
  // fallback: 行首关键词
  for (const p of SEVERITY_PATTERNS) {
    if (p.re.test(line)) return p.name;
  }
  return null;
}

/**
 * 从一行抽 file:line（多种格式: file.js:42 / file.js#L42 / file.js, line 42）
 */
function extractFileLine(line) {
  // file.js:42 或 path/to/file.js:42 (最常见)
  let m = line.match(/([\w\-./\\]+\.\w{1,5}):(\d+)/);
  if (m) return { file: m[1], line: parseInt(m[2], 10) };
  // file.js, line 42 / file.js (line 42)
  m = line.match(/([\w\-./\\]+\.\w{1,5})\s*[,(]\s*(?:line|行)\s*(\d+)/i);
  if (m) return { file: m[1], line: parseInt(m[2], 10) };
  return { file: null, line: null };
}

/**
 * 主入口：解析 codex output 成 finding 数组。
 * 不漏掉 raw 文本——每个 finding 带 raw 让 Claude 二审时拿全 context。
 *
 * @param {string} output - codex stdout
 * @returns {Array<{severity, file, line, summary, raw, index}>}
 */
function parseFindings(output) {
  if (!output || typeof output !== 'string') return [];

  const lines = output.split(/\r?\n/);
  const findings = [];
  let current = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;

    const severity = extractSeverity(trimmed);
    const { file, line: lineNum } = extractFileLine(trimmed);

    // 启发式：含 severity 标记 OR 含 file:line 引用 → 视为新 finding 起点
    const isFindingHeader = severity || (file && lineNum);

    if (isFindingHeader) {
      // close 上一条
      if (current) findings.push(current);

      // 标 summary：去掉 [Severity] 前缀，留主体
      let summary = trimmed
        .replace(/^[-•*]\s*/, '')
        .replace(/^\[(critical|high|medium|low|nit|严重|致命|高危|中危|低危)\]\s*/i, '')
        .trim();

      current = {
        index: findings.length + 1,
        severity: severity || 'unknown',
        file: file || null,
        line: lineNum || null,
        summary: summary,
        raw: line, // 起始行
      };
    } else if (current) {
      // 继续累积到 current.raw（缩进的子项 / 解释行）
      current.raw += '\n' + line;
    }
    // 没 current 也不是新 header → 忽略（preamble / 摘要）
  }

  // close 最后一条
  if (current) findings.push(current);

  return findings;
}

/**
 * 排序：critical → high → medium → low → unknown
 */
function sortBySeverity(findings) {
  return [...findings].sort((a, b) => {
    const ra = SEVERITY_RANK[a.severity] || 0;
    const rb = SEVERITY_RANK[b.severity] || 0;
    return rb - ra;
  });
}

/**
 * 摘要给用户：一句话总览
 */
function summarize(findings) {
  if (findings.length === 0) return '0 findings';
  const counts = { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 };
  for (const f of findings) counts[f.severity || 'unknown']++;
  const parts = [];
  if (counts.critical) parts.push(`${counts.critical} CRITICAL`);
  if (counts.high)     parts.push(`${counts.high} HIGH`);
  if (counts.medium)   parts.push(`${counts.medium} MEDIUM`);
  if (counts.low)      parts.push(`${counts.low} LOW`);
  if (counts.unknown)  parts.push(`${counts.unknown} unrated`);
  return parts.join(' · ');
}

module.exports = {
  parseFindings,
  sortBySeverity,
  summarize,
  extractSeverity,
  extractFileLine,
  SEVERITY_RANK,
};
