const CHUNK_SIZE = 380;
const CHUNK_OVERLAP = 60;

/**
 * 混合检索：每路召回 ≈ limit×MULTIPLIER（业界常见每路 50–100 或 3–10× final K，小库取偏小倍数）。
 * 与 HYBRID_RERANK_POOL_MIN 一并用于 recall 与 RRF 后 rerank 池下限。
 */
export const HYBRID_RECALL_MULTIPLIER = 4;
export const HYBRID_RERANK_POOL_MIN = 20;

const RECURSIVE_SEPARATORS = ["\n\n", "\n", "。", "！", "？", "；", ". ", " "] as const;

function splitMarkdownSections(text: string): Array<{ heading?: string; body: string }> {
  const lines = text.split("\n");
  const sections: Array<{ heading?: string; body: string }> = [];
  let heading: string | undefined;
  let bodyLines: string[] = [];
  let sawHeader = false;

  const flush = () => {
    const body = bodyLines.join("\n").trim();
    if (heading !== undefined || body) {
      sections.push({ heading, body });
    }
    bodyLines = [];
    heading = undefined;
  };

  for (const line of lines) {
    const headerMatch = line.match(/^#{1,6}\s+(.+)$/);
    if (headerMatch) {
      if (sawHeader || bodyLines.length > 0) flush();
      sawHeader = true;
      heading = (headerMatch[1] ?? "").trim();
      continue;
    }
    bodyLines.push(line);
  }
  flush();

  if (sections.length === 0) return [{ body: text }];
  return sections;
}

function splitWithSeparator(text: string, separator: string): string[] {
  if (!separator) return [text];
  const parts = text.split(separator);
  if (parts.length <= 1) return [text];
  return parts.map((part, index) =>
    index < parts.length - 1 ? part + separator : part,
  );
}

function splitTextRecursive(text: string, chunkSize: number, overlap: number): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= chunkSize) return [trimmed];

  for (const separator of RECURSIVE_SEPARATORS) {
    const parts = splitWithSeparator(trimmed, separator).map((p) => p.trim()).filter(Boolean);
    if (parts.length <= 1) continue;

    const chunks: string[] = [];
    let buffer = "";

    const pushBuffer = () => {
      const piece = buffer.trim();
      buffer = "";
      if (!piece) return;
      if (piece.length <= chunkSize) chunks.push(piece);
      else chunks.push(...splitTextRecursive(piece, chunkSize, overlap));
    };

    for (const part of parts) {
      const candidate = buffer ? `${buffer}${separator}${part}` : part;
      if (candidate.length <= chunkSize) {
        buffer = candidate;
        continue;
      }
      pushBuffer();
      buffer = part;
    }
    pushBuffer();
    return chunks;
  }

  const windowed: string[] = [];
  const step = Math.max(1, chunkSize - overlap);
  for (let i = 0; i < trimmed.length; i += step) {
    const piece = trimmed.slice(i, i + chunkSize).trim();
    if (piece) windowed.push(piece);
  }
  return windowed;
}

/**
 * @description 将长文档切分为 RAG 块：Markdown 标题优先分段，段内再按段落/句号等递归切分，超长则滑动窗口。
 * @param text 原始文档正文
 * @param chunkSize 单块最大字符数，默认 380
 * @param overlap 滑动窗口重叠字符数，默认 60
 * @returns 非空 trimmed 分块字符串数组
 */
export function chunkText(text: string, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  const sections = splitMarkdownSections(text);
  const chunks: string[] = [];

  for (const section of sections) {
    const prefix = section.heading ? `## ${section.heading}\n\n` : "";
    const body = section.body.trim();
    if (!body && section.heading) {
      chunks.push(prefix.trim());
      continue;
    }
    if (!body) continue;

    const bodyLimit = Math.max(80, chunkSize - prefix.length);
    const bodyChunks = splitTextRecursive(body, bodyLimit, overlap);

    bodyChunks.forEach((bodyChunk, index) => {
      const withHeading = index === 0 && prefix ? `${prefix}${bodyChunk}` : bodyChunk;
      if (withHeading.length <= chunkSize) {
        chunks.push(withHeading.trim());
        return;
      }
      if (prefix && index === 0) chunks.push(prefix.trim());
      chunks.push(...splitTextRecursive(bodyChunk, chunkSize, overlap));
    });
  }

  if (chunks.length === 0 && text.trim()) {
    return splitTextRecursive(text.trim(), chunkSize, overlap);
  }
  return chunks;
}

/**
 * @description 将 extractSearchTerms 的词条展开为与 FTS 查询一致的字面 token（中文单字 + 英文整词）。
 */
export function expandTermsToLexicalTokens(terms: string[]): string[] {
  const tokens = new Set<string>();

  for (const term of terms) {
    const cleaned = term.replace(/["']/g, "").trim();
    if (!cleaned) continue;

    if (/^[a-zA-Z0-9_]+$/.test(cleaned)) {
      tokens.add(cleaned.toLowerCase());
      continue;
    }

    for (const char of cleaned) {
      if (/[\u4e00-\u9fff]/.test(char)) tokens.add(char);
    }
  }

  return [...tokens];
}

/**
 * @description TF-IDF 回退分词：与 FTS 稀疏路对齐（字级 + 抽词），不做双字 n-gram。
 * 第二轨优先 embedding 时，此函数仅在没有向量或未回填时启用。
 */
export function tokenizeForSearch(text: string): string[] {
  const tokens = new Set<string>();

  for (const term of expandTermsToLexicalTokens(extractSearchTerms(text))) {
    tokens.add(term);
  }

  for (const char of text.match(/[\u4e00-\u9fff]/g) ?? []) {
    tokens.add(char);
  }

  for (const word of text.match(/[a-zA-Z]{3,}/g) ?? []) {
    tokens.add(word.toLowerCase());
  }

  return [...tokens];
}

const TRAVEL_KEYWORDS = [
  "火锅",
  "美食",
  "熊猫",
  "拍照",
  "行程",
  "早茶",
  "樱花",
  "兵马俑",
  "西湖",
  "生腌",
  "牛肉",
  "避坑",
  "交通",
  "季节",
  "小吃",
  "夜景",
  "海岛",
  "胡同",
  "湘菜",
  "热干面",
  "攻略",
  "出片",
  "机位",
  "排队",
  "亲子",
];

/**
 * @description 从用户消息提取 RAG/FTS 检索词：旅行关键词命中、中文片段与英文单词，最多 10 个。
 * @param message 用户查询文本
 * @returns 去重后的检索词条数组
 */
export function extractSearchTerms(message: string): string[] {
  const terms = new Set<string>();

  for (const word of message.match(/[a-zA-Z]{3,}/g) ?? []) {
    terms.add(word.toLowerCase());
  }

  for (const kw of TRAVEL_KEYWORDS) {
    if (message.includes(kw)) terms.add(kw);
  }

  for (const seg of message.split(/[\s，。！？、；：""''（）\-\—]+/)) {
    const trimmed = seg.trim();
    if (trimmed.length >= 2 && trimmed.length <= 10) terms.add(trimmed);
  }

  return [...terms].slice(0, 10);
}

/**
 * @description 写入 FTS5 前格式化正文：unicode61 对连续 CJK 子串几乎无法 MATCH，按字加空格便于倒排。
 */
export function formatTextForFtsIndex(text: string): string {
  return text
    .replace(/([\u4e00-\u9fff])/g, "$1 ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @description 将检索词条组装为 SQLite FTS5 查询串（unicode61：中文拆单字 OR，英文保留整词）。
 * @param terms extractSearchTerms 产出的词条列表
 * @returns FTS 查询字符串；无词条时返回 null
 */
export function buildFtsQuery(terms: string[]): string | null {
  const tokens = expandTermsToLexicalTokens(terms);
  if (tokens.length === 0) return null;
  return tokens.join(" OR ");
}

/**
 * @description 粗估文本注入 LLM prompt 时的 token 数（CJK 按 1.5 字/token，其余按 4 字符/token）。
 * @param text 待估算的字符串
 * @returns 向上取整的 token 估算值
 */
export function estimateTokens(text: string): number {
  const cjk = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const other = Math.max(0, text.length - cjk);
  return Math.ceil(cjk / 1.5 + other / 4);
}

/**
 * @description Reciprocal Rank Fusion（RRF）：将多路排序列表按 chunkId 融合为统一相关性分数。
 * @param rankedLists 多路检索结果，每项须含 chunkId 字段
 * @param k RRF 平滑常数，默认 60
 * @returns chunkId → 融合分数 的 Map，分数越高排名越靠前
 */
export function reciprocalRankFusion<T extends { chunkId: string }>(
  rankedLists: T[][],
  k = 60,
): Map<string, number> {
  const scores = new Map<string, number>();
  for (const list of rankedLists) {
    if (list.length === 0) continue;
    list.forEach((item, index) => {
      scores.set(item.chunkId, (scores.get(item.chunkId) ?? 0) + 1 / (k + index + 1));
    });
  }
  return scores;
}

export interface LexicalRerankInput {
  chunkId: string;
  documentTitle: string;
  content: string;
}

/**
 * @description 轻量精排：query 短语 + 检索词在标题/正文中的命中，与 RRF 分数加权合并（无 cross-encoder 依赖）。
 */
export function lexicalRerankScore(
  query: string,
  terms: string[],
  item: LexicalRerankInput,
): number {
  const haystack = `${item.documentTitle}\n${item.content}`.toLowerCase();
  const normalizedQuery = query.trim().toLowerCase();
  let score = 0;

  if (normalizedQuery.length >= 2 && haystack.includes(normalizedQuery)) {
    score += 3;
  }

  for (const term of terms) {
    const t = term.toLowerCase();
    if (t.length >= 2 && haystack.includes(t)) score += 1;
  }

  return score;
}

/**
 * @description 对 RRF 候选池做 lexical rerank，返回按综合分排序后的 chunkId 列表（长度不超过 limit）。
 */
export function rerankByLexicalOverlap<T extends LexicalRerankInput>(
  query: string,
  terms: string[],
  candidates: T[],
  rrfScores: Map<string, number>,
  limit: number,
): Array<{ item: T; score: number }> {
  const maxRrf = Math.max(...[...rrfScores.values()], 1e-9);
  const lexicalDenom = Math.max(terms.length + 3, 1);

  return candidates
    .map((item) => {
      const lexical = lexicalRerankScore(query, terms, item) / lexicalDenom;
      const rrf = (rrfScores.get(item.chunkId) ?? 0) / maxRrf;
      const score = lexical * 0.55 + rrf * 0.45;
      return { item, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
