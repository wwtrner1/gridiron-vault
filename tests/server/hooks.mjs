// Module hooks for the server tests: swap the platform packages the API function needs for local stand-ins.
const SWAP = {
  "drizzle-orm/netlify-db": new URL("./fake-db.ts", import.meta.url).href,
  "@netlify/identity": new URL("./fake-identity.ts", import.meta.url).href,
  "@netlify/blobs": new URL("./fake-blobs.ts", import.meta.url).href,
};

export async function resolve(specifier, context, next) {
  // The stand-ins themselves still reach the real packages for everything they don't replace.
  if (SWAP[specifier] && context.parentURL !== SWAP[specifier]) return { url: SWAP[specifier], shortCircuit: true, format: "module" };
  return next(specifier, context);
}
