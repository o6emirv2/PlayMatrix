export const SOCIAL_STATUS = Object.freeze({ offline: "offline", online: "online", ingame: "ingame" });

export function normalizeSocialStatus(value) {
  return Object.values(SOCIAL_STATUS).includes(value) ? value : SOCIAL_STATUS.offline;
}

export function createSocialState(seed = {}) {
  return { friends: [], requests: [], conversations: [], invites: [], status: SOCIAL_STATUS.offline, ...seed };
}
