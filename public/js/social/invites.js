export const INVITE_TTL_MS = 60_000;

export function isInviteExpired(invite = {}, now = Date.now()) {
  const expiresAt = Number(invite.expiresAt || 0);
  return expiresAt > 0 ? expiresAt <= now : (Number(invite.createdAt || 0) + INVITE_TTL_MS) <= now;
}
