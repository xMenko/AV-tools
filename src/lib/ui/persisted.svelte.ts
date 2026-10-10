/**
 * Reactive state that survives reloads (per device, in localStorage).
 * Only for convenience (last inputs) – the app works the same when storage is unavailable.
 * Must be called during component initialisation (uses $effect).
 */
const PREFIX = 'avtools:';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function readStored<T>(key: string, initial: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return initial;
    const parsed: unknown = JSON.parse(raw);
    // Merge so that fields added in newer versions get their defaults.
    if (isPlainObject(initial) && isPlainObject(parsed)) return { ...initial, ...parsed } as T;
    return parsed as T;
  } catch {
    return initial;
  }
}

export function writeStored(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode, quota) – ignore */
  }
}

export function clearAllStored(): void {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

export function persisted<T>(key: string, initial: T): { value: T } {
  let value = $state<T>(readStored(key, initial));
  $effect(() => {
    writeStored(key, $state.snapshot(value));
  });
  return {
    get value() {
      return value;
    },
    set value(v: T) {
      value = v;
    },
  };
}
