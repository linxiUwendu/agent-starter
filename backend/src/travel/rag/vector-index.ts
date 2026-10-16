import { tokenizeForSearch } from "./rag.util";

export interface VectorDocument {
  id: string;
  content: string;
  cityId: string | null;
}

/**
 * @description 基于文档集合计算各 token 的逆文档频率（IDF），用于 TF-IDF 加权。
 * @param docs 向量索引中的全部文档
 * @returns token → IDF 权重 的 Map
 */
function buildIdf(docs: VectorDocument[]): Map<string, number> {
  const docFreq = new Map<string, number>();
  for (const doc of docs) {
    const seen = new Set(tokenizeForSearch(doc.content));
    for (const token of seen) {
      docFreq.set(token, (docFreq.get(token) ?? 0) + 1);
    }
  }

  const n = docs.length || 1;
  const idf = new Map<string, number>();
  for (const [token, freq] of docFreq) {
    idf.set(token, Math.log((n + 1) / (freq + 1)) + 1);
  }
  return idf;
}

/**
 * @description 将 token 列表转为稀疏 TF-IDF 向量（Map 表示，仅含 IDF 表中有权重的维度）。
 * @param tokens 分词结果
 * @param idf 全局 IDF 权重表
 * @returns token → TF×IDF 权重 的稀疏向量
 */
function buildTfidfVector(tokens: string[], idf: Map<string, number>): Map<string, number> {
  const tf = new Map<string, number>();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) ?? 0) + 1);
  }

  const vector = new Map<string, number>();
  for (const [token, count] of tf) {
    const weight = idf.get(token);
    if (weight != null) {
      vector.set(token, count * weight);
    }
  }
  return vector;
}

/**
 * @description 计算两个稀疏 TF-IDF 向量的余弦相似度，用于文档-查询匹配打分。
 * @param a 查询或文档向量 A
 * @param b 文档向量 B
 * @returns [0, 1] 区间的相似度；任一向量范数为 0 时返回 0
 */
function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (const [key, val] of a) {
    normA += val * val;
    const other = b.get(key);
    if (other != null) dot += val * other;
  }
  for (const val of b.values()) {
    normB += val * val;
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** 内存 TF-IDF 向量索引，用于本地混合检索（无外部 embedding 服务）。 */
export class VectorIndex {
  private docs: VectorDocument[] = [];
  private idf = new Map<string, number>();
  private vectors = new Map<string, Map<string, number>>();

  /**
   * @description 用新文档集合重建索引：重算 IDF 并为每篇文档预计算 TF-IDF 稀疏向量。
   * @param docs 待索引的 VectorDocument 数组
   * @returns void
   */
  build(docs: VectorDocument[]) {
    this.docs = docs;
    this.idf = buildIdf(docs);
    this.vectors.clear();

    for (const doc of docs) {
      const tokens = tokenizeForSearch(doc.content);
      this.vectors.set(doc.id, buildTfidfVector(tokens, this.idf));
    }
  }

  /**
   * @description 返回当前索引中的文档数量。
   * @returns 文档条数
   */
  size() {
    return this.docs.length;
  }

  /**
   * @description 对查询文本做 TF-IDF 向量化，按余弦相似度返回 Top-K（分区内全量扫描，无 city 过滤）。
   * 用于已按城市预分区的索引。
   */
  searchUnscoped(query: string, limit: number) {
    if (this.docs.length === 0 || limit <= 0) return [];

    const queryVector = buildTfidfVector(tokenizeForSearch(query), this.idf);
    const scored: Array<{ id: string; score: number }> = [];

    for (const doc of this.docs) {
      const vector = this.vectors.get(doc.id);
      if (!vector) continue;
      const score = cosineSimilarity(queryVector, vector);
      if (score > 0) scored.push({ id: doc.id, score });
    }

    return scored.sort((a, b) => b.score - a.score).slice(0, limit);
  }

}

/**
 * @description 计算两个稠密数值向量的余弦相似度，供 embedding 数组对比或测试使用。
 * @param a 向量 A
 * @param b 向量 B
 * @returns [0, 1] 区间的相似度；长度取 min(a,b)，范数为 0 时返回 0
 */
export function cosineSimilarityArrays(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
