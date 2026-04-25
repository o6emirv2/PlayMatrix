export const GLOBAL_CHAT_RETENTION_DAYS = 7;

export function normalizeGlobalMessage(message = {}) {
  return {
    id: String(message.id || message.messageId || ""),
    uid: String(message.uid || ""),
    username: String(message.username || "Oyuncu"),
    text: String(message.text || "").slice(0, 500),
    createdAt: Number(message.createdAt || Date.now()),
    deleted: !!message.deleted
  };
}
