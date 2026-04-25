export function canUseNativeNotifications() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getNotificationPermission() {
  return canUseNativeNotifications() ? Notification.permission : "unsupported";
}
