import nodejieba from "nodejieba";

const CJK = /[\u4e00-\u9fff]/;
const EN_WORD = /[a-zA-Z][a-zA-Z0-9_-]*/g;

function addToken(tokens: Set<string>, raw: string) {
  const w = raw.trim().toLowerCase();
  if (!w) return;
  if (/^[a-z0-9_-]+$/i.test(w)) {
    if (w.length >= 2) tokens.add(w);
    return;
  }
  if (CJK.test(w)) tokens.add(w);
}

/**
 * 结巴「搜索引擎模式」分词：用于 RAG 的 FTS 入库、FTS 查询、TF-IDF 向量，保证三路 token 一致。
 */
export function segmentTextToTokens(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const tokens = new Set<string>();

  for (const match of trimmed.match(EN_WORD) ?? []) {
    addToken(tokens, match);
  }

  if (CJK.test(trimmed)) {
    for (const word of nodejieba.cutForSearch(trimmed)) {
      addToken(tokens, word);
    }
  }

  return [...tokens];
}

/** FTS5 unicode61：将正文切成空格分隔的词序列写入倒排索引 */
export function formatTextForFtsIndex(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";

  const parts: string[] = [];
  if (CJK.test(trimmed)) {
    for (const word of nodejieba.cutForSearch(trimmed)) {
      const w = word.trim();
      if (w && (CJK.test(w) || /^[a-z0-9_-]+$/i.test(w))) parts.push(w);
    }
  }
  for (const match of trimmed.match(EN_WORD) ?? []) {
    parts.push(match.toLowerCase());
  }

  return [...new Set(parts)].join(" ");
}
