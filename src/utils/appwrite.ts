import { Client, Account, Databases, Query, type Models } from 'appwrite';

/**
 * Appwrite client for the Raidar desktop app — lets a user sign in with their
 * raidar.tech account and surfaces their subscription plan inside the app.
 * Email/password only (OAuth redirects don't fit a desktop webview cleanly).
 */
const ENDPOINT = (import.meta as any).env?.VITE_APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1';
const PROJECT_ID = (import.meta as any).env?.VITE_APPWRITE_PROJECT_ID || '6a35ee58000329887b08';
export const DB_ID = (import.meta as any).env?.VITE_APPWRITE_DB_ID || 'raidar';
export const SUBSCRIPTIONS_COLLECTION_ID = (import.meta as any).env?.VITE_APPWRITE_SUBSCRIPTIONS_COLLECTION_ID || 'subscriptions';

export const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID);
export const account = new Account(client);
export const databases = new Databases(client);
export { Query };

export type AppUser = Models.User<Models.Preferences>;

export interface Subscription extends Models.Document {
  userId: string;
  planId: string;
  planName: string;
  status: 'active' | 'cancelled' | 'past_due';
  comp?: boolean;
  expiresAt?: string;
  renewsAt?: string;
}

/** The signed-in user's current plan (or null if none/free). */
export async function fetchSubscription(userId: string): Promise<Subscription | null> {
  try {
    const res = await databases.listDocuments<Subscription>(DB_ID, SUBSCRIPTIONS_COLLECTION_ID, [
      Query.equal('userId', userId), Query.orderDesc('$createdAt'), Query.limit(1),
    ]);
    const sub = res.documents[0];
    if (!sub || sub.status !== 'active') return null;
    // Expire complimentary grants whose window has passed.
    if (sub.comp && sub.expiresAt && new Date(sub.expiresAt).getTime() < Date.now()) return null;
    return sub;
  } catch {
    return null;
  }
}
