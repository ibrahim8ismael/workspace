type StoragePort = Pick<Storage, 'length' | 'key' | 'removeItem'>;

/** Remove only the old auth and role secrets; keep non-sensitive personal preferences. */
export function clearLegacyAuthStorage(storage: StoragePort) {
  try {
    for (const key of ['office-session', 'office-user-ids']) storage.removeItem(key);
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (key?.startsWith('office-key-') || key?.startsWith('office-admin-'))
        storage.removeItem(key);
    }
  } catch {
    // Storage may be unavailable; the app never reads these values as authentication.
  }
}
