const OPEN = '<followups>';
const CLOSE = '</followups>';

export type ParsedReply = {
  /** 給使用者看的正文，已移除建議追問區塊 */
  body: string;
  /** 2–3 個建議追問；區塊還沒收完或解析失敗時為空陣列 */
  followups: string[];
};

/**
 * 把模型回覆結尾的 <followups> 區塊從正文分出來（HANDOFF 第 6.5 節）。
 * 串流中也能用：區塊才出現一半（甚至只收到「<fol」）就先藏起來，不會在畫面上閃現。
 * 解析失敗就不顯示追問，不影響正文。
 */
export function parseReply(raw: string): ParsedReply {
  const start = raw.indexOf(OPEN);
  if (start === -1) {
    // 結尾若是開始標籤的前幾個字元，先不顯示。
    for (let length = Math.min(OPEN.length - 1, raw.length); length > 0; length -= 1) {
      if (raw.endsWith(OPEN.slice(0, length))) return { body: raw.slice(0, -length).trimEnd(), followups: [] };
    }
    return { body: raw, followups: [] };
  }

  const body = raw.slice(0, start).trimEnd();
  const rest = raw.slice(start + OPEN.length);
  const end = rest.indexOf(CLOSE);
  if (end === -1) return { body, followups: [] };

  const followups = rest
    .slice(0, end)
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*・•]|\d+[.、)])\s*/, '').trim())
    .filter((line) => line.length > 0 && line.length <= 80)
    .slice(0, 3);
  return { body, followups };
}
