export function bindCrashSocket(socket, handlers = {}) {
  if (!socket || typeof socket.on !== "function") return () => {};
  const bindings = Object.entries(handlers).filter(([, handler]) => typeof handler === "function");
  bindings.forEach(([eventName, handler]) => socket.on(eventName, handler));
  return () => bindings.forEach(([eventName, handler]) => socket.off?.(eventName, handler));
}
