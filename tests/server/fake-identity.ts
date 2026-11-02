export * from "@netlify/identity";

/** Netlify Identity in the server tests: whoever `signInAs` names is the signed-in coach for the next requests. */
type User = { id: string; email: string; name: string; confirmedAt: string; userMetadata: Record<string, string> };

let current: User | null = null;
let adminDown = false;

/** With `down`, Identity's admin API fails (as it can on a Deploy Preview); getUser() still answers from the token. */
export function identityAdmin(down: boolean) {
  adminDown = down;
}

/** `confirmedAt: ""` is a token-only answer: getUser() fell back to the sign-in token's claims, which carry no stamp. */
export function signInAs(user: { id: string; email: string; name?: string; confirmedAt?: string } | null) {
  current = user ? { name: "Coach", confirmedAt: new Date().toISOString(), userMetadata: {}, ...user } : null;
}

export async function getUser() {
  return current;
}

export const admin = {
  getUser: async () => {
    if (adminDown) throw new Error("Identity admin API unreachable");
    return current;
  },
  listUsers: async () => [],
  deleteUser: async () => undefined,
  updateUser: async () => current,
};
