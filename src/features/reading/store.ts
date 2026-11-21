import { getDB } from '../../lib/storage/db';
import type { Conversation } from './types';

function newId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(36).padStart(2, '0')).join('').slice(0, 16);
}

export function createConversation(chartId: string, title = '新對話'): Conversation {
  const now = new Date().toISOString();
  return { id: newId(), chartId, title, messages: [], createdAt: now, updatedAt: now };
}

/** 對話依命盤保存在本機（IndexedDB）。 */
export async function saveConversation(conversation: Conversation): Promise<void> {
  await (await getDB()).put('conversations', { ...conversation, updatedAt: new Date().toISOString() });
}

/** 某張命盤的對話，最近更新的在前。 */
export async function listConversations(chartId: string): Promise<Conversation[]> {
  const all = await (await getDB()).getAllFromIndex('conversations', 'chartId', chartId);
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function deleteConversation(id: string): Promise<void> {
  await (await getDB()).delete('conversations', id);
}

/** 刪除命盤時，一併刪除它的對話。 */
export async function deleteConversationsOf(chartId: string): Promise<void> {
  const db = await getDB();
  const keys = await db.getAllKeysFromIndex('conversations', 'chartId', chartId);
  const tx = db.transaction('conversations', 'readwrite');
  await Promise.all([...keys.map((key) => tx.store.delete(key)), tx.done]);
}
