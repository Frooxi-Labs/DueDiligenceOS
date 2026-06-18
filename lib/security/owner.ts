import { cookies } from 'next/headers';

/** Cookie name for the anonymous per-browser visitor id (set in middleware). */
export const OWNER_COOKIE = 'ddos_uid';

/** Deals created before scoping (and shared seed deals) use this owner and stay
 *  visible to everyone. */
export const SHARED_OWNER = 'demo-user';

/** The current visitor's anonymous id, or null if the cookie isn't set yet. */
export async function ownerToken(): Promise<string | null> {
  try {
    return (await cookies()).get(OWNER_COOKIE)?.value ?? null;
  } catch {
    return null;
  }
}
