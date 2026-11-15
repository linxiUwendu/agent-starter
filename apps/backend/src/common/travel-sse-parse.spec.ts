/**
 * 与前端 `travel-sse-parse.ts` 同逻辑的回归测试（防止 context 事件被 keepalive 拆碎后丢失）。
 */
function parseSseMessageBlock(part: string) {
  const normalized = part.replace(/\r\n/g, "\n");
  if (!normalized.trim() || normalized.trim().startsWith(":")) return null;

  let event = "message";
  const dataLines: string[] = [];
  let sawEventOrData = false;

  for (const line of normalized.split("\n")) {
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("event: ")) {
      event = line.slice(7).trim();
      sawEventOrData = true;
    } else if (line.startsWith("data: ")) {
      dataLines.push(line.slice(6).trim());
      sawEventOrData = true;
    }
  }

  if (!sawEventOrData) return null;

  return {
    event,
    data: dataLines.join("\n"),
    incomplete: dataLines.length === 0 && event !== "message",
  };
}

describe("travel SSE parse (frontend parity)", () => {
  it("parses context when ping comment is between event and data in same block", () => {
    const parsed = parseSseMessageBlock(
      'event: context\n: ping\ndata: {"city":"chengdu","cityName":"成都"}',
    );
    expect(parsed?.event).toBe("context");
    expect(parsed?.incomplete).toBe(false);
    expect(parsed?.data).toContain("chengdu");
  });

  it("marks head fragment incomplete when split before data line", () => {
    const head = parseSseMessageBlock("event: context\n: ping");
    expect(head?.incomplete).toBe(true);
    expect(head?.event).toBe("context");
  });

  it("parses context when lines use CRLF terminators", () => {
    const parsed = parseSseMessageBlock(
      'event: context\r\ndata: {"city":"chengdu"}\r\n',
    );
    expect(parsed?.event).toBe("context");
    expect(parsed?.data).toBe('{"city":"chengdu"}');
  });
});