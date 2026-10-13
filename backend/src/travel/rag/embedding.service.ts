import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/**
 * @description 文本向量化服务：默认 TF-IDF（无网络）；可选 OpenAI embedding API。
 * 同步检索路径使用本地 VectorIndex；OpenAI 路径需预回填 kb_chunks.embedding。
 */
@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * @description 当前生效的 embedding 提供方：有 OPENAI_API_KEY 且配置 openai 时用 OpenAI，否则 tfidf。
   */
  get provider(): "tfidf" | "openai" {
    const configured = this.config.get<string>("RAG_EMBEDDING_PROVIDER") ?? "tfidf";
    if (configured === "openai" && this.apiKey) return "openai";
    return "tfidf";
  }

  /** @description 从环境变量读取 OpenAI API Key */
  private get apiKey() {
    return this.config.get<string>("OPENAI_API_KEY")?.trim();
  }

  /** @description embedding 模型名，默认 text-embedding-3-small */
  private get model() {
    return this.config.get<string>("OPENAI_EMBEDDING_MODEL") ?? "text-embedding-3-small";
  }

  /**
   * @description 调用 OpenAI Embeddings API 将文本转为向量；未配置或失败时返回 null。
   * @param text 待嵌入文本（截断至 8000 字符）
   * @returns 浮点向量或 null
   */
  async embed(text: string): Promise<number[] | null> {
    if (this.provider !== "openai" || !this.apiKey) return null;

    try {
      const response = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          input: text.slice(0, 8000),
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        this.logger.warn(`OpenAI embedding failed: ${response.status} ${body.slice(0, 200)}`);
        return null;
      }

      const json = (await response.json()) as {
        data?: Array<{ embedding?: number[] }>;
      };
      return json.data?.[0]?.embedding ?? null;
    } catch (error) {
      this.logger.warn(
        `OpenAI embedding error: ${error instanceof Error ? error.message : error}`,
      );
      return null;
    }
  }

  /**
   * @description 从 SQLite 中 JSON 字符串解析 embedding 向量。
   * @param raw kb_chunks.embedding 列值
   */
  parseStoredEmbedding(raw: string | null | undefined): number[] | null {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed.map(Number) : null;
    } catch {
      return null;
    }
  }

  /**
   * @description 将向量序列化为 JSON 字符串以便存入 SQLite。
   * @param values embedding 浮点数组
   */
  serializeEmbedding(values: number[]): string {
    return JSON.stringify(values);
  }
}
