import pdf from "pdf-parse";

const MAX_PDF_BYTES = 10 * 1024 * 1024;

/**
 * @description 从 PDF 二进制提取纯文本，供知识库入库与分块。
 */
export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  if (buffer.length === 0) {
    throw new Error("PDF file is empty.");
  }
  if (buffer.length > MAX_PDF_BYTES) {
    throw new Error(`PDF exceeds ${MAX_PDF_BYTES / (1024 * 1024)}MB limit.`);
  }

  const data = await pdf(buffer);
  const text = (data.text ?? "").replace(/\r\n/g, "\n").trim();
  if (!text) {
    throw new Error("PDF contains no extractable text (scanned images are not supported).");
  }
  return text;
}

export { MAX_PDF_BYTES };
