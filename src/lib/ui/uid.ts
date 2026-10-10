let counter = 0;
/** Short unique id (crypto.randomUUID is unavailable on plain-HTTP dev servers). */
export function uid(): string {
  counter += 1;
  return `${Date.now().toString(36)}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
