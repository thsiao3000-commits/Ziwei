/**
 * OpenAI 的模型列表會混入影像、語音、embedding 等上百個模型，而且回傳內容沒有能力欄位，
 * 只能從名稱過濾出文字對話模型（HANDOFF 第 5.2 節）。規則集中在這裡，並有測試。
 */
const EXCLUDED = [
  'image',
  'audio',
  'realtime',
  'embedding',
  'moderation',
  'tts',
  'transcribe',
  'whisper',
  'dall-e',
  'search',
  'instruct',
  'codex',
  'computer-use',
  'vision-preview',
];

export function isChatModelId(id: string): boolean {
  const lower = id.toLowerCase();
  if (!lower.startsWith('gpt-')) return false;
  return !EXCLUDED.some((word) => lower.includes(word));
}

export function filterChatModels<T extends { id: string }>(models: readonly T[]): T[] {
  return models.filter((model) => isChatModelId(model.id));
}
