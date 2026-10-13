import type Database from "better-sqlite3";

/** KB 检索：目标城市 + 通用（无 city_id）文档 */
export const KB_CITY_OR_GLOBAL = "(city_id = ? OR city_id IS NULL OR city_id = '')";
export const KB_CHUNK_CITY_OR_GLOBAL = "(c.city_id = ? OR c.city_id IS NULL OR c.city_id = '')";

export const KB_CHUNK_WITH_DOC_FROM = `
  FROM kb_chunks c
  JOIN kb_documents d ON d.id = c.document_id
`;

/** @description 通用 COUNT(*) 查询 */
export function countRows(
  db: Database.Database,
  table: string,
  where?: string,
  params: unknown[] = [],
): number {
  const sql = where
    ? `SELECT COUNT(*) AS c FROM ${table} WHERE ${where}`
    : `SELECT COUNT(*) AS c FROM ${table}`;
  return (db.prepare(sql).get(...params) as { c: number }).c;
}

/** @description 启动校验用：城市数 + 知识库文档数 */
export function readBootstrapStats(db: Database.Database) {
  return {
    cities: countRows(db, "cities"),
    kbDocs: countRows(db, "kb_documents"),
  };
}
