/** Netlify Blobs in the server tests: every store is a Map in this process, so a test can see what was kept or dropped. */
export const stores = new Map<string, Map<string, ArrayBuffer>>();

export function getStore(opts: string | { name: string }) {
  const name = typeof opts === "string" ? opts : opts.name;
  if (!stores.has(name)) stores.set(name, new Map());
  const map = stores.get(name)!;
  return {
    async set(key: string, value: ArrayBuffer | string) {
      map.set(key, typeof value === "string" ? new TextEncoder().encode(value).buffer : value);
    },
    async get(key: string) {
      return map.get(key) ?? null;
    },
    async delete(key: string) {
      map.delete(key);
    },
  };
}
