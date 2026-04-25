export function normalizeFriendEntry(entry = {}) {
  return {
    uid: String(entry.uid || entry.friendUid || ""),
    username: String(entry.username || "Oyuncu"),
    avatar: String(entry.avatar || ""),
    status: String(entry.status || "offline"),
    frameLevel: Math.max(0, Number(entry.frameLevel || entry.selectedFrame || 0) || 0)
  };
}
