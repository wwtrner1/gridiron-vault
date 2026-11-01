export * from "@netlify/identity";

/** Netlify Identity in the server tests: whoever `signInAs` names is the signed-in coach for the next requests. */
type User = { id: string; email: string; name: string; confirmedAt: string; userMetadata: Record<string, string> };

let current: User | null = null;

export function signInAs(user: { id: string; email: string; name?: string } | null) {
  current = user ? { name: "Coach", confirmedAt: new Date().toISOString(), userMetadata: {}, ...user } : null;
}

export async function getUser() {
  return current;
}

export const admin = {
  getUser: async () => current,
  listUsers: async () => [],
  deleteUser: async () => undefined,
  updateUser: async () => current,
};
