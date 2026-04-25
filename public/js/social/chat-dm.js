export const DIRECT_CHAT_RETENTION_DAYS = 14;

export function normalizeDirectMessage(message = {}) {
  return {
    id: String(message.id || message.messageId || ""),
    fromUid: String(message.fromUid || message.uid || ""),
    toUid: String(message.toUid || ""),
    text: String(message.text || "").slice(0, 1200),
    createdAt: Number(message.createdAt || Date.now()),
    deleted: !!message.deleted
  };
}
