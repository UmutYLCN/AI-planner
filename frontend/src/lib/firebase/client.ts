/**
 * Browser-only Firebase bootstrap.
 *
 * Everything here is lazy and guarded: the Firebase app is created once, only in the
 * browser, and only when the public config is actually present. That keeps SSR safe
 * (no `window`/`localStorage` at module scope) and lets the rest of the app — including
 * the existing Dexie roadmap features — keep working before Firebase is configured.
 *
 * Only NEXT_PUBLIC_ values are used. Service-account credentials belong to the MCP
 * Worker and must never appear in this bundle.
 */
import { type FirebaseApp, getApps, initializeApp } from "firebase/app";
import {
  type Auth,
  GoogleAuthProvider,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  getAuth,
  initializeAuth,
} from "firebase/auth";
import { type Firestore, getFirestore } from "firebase/firestore";

const APP_NAME = "ai-planner";

export interface FirebasePublicConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

function readConfig(): FirebasePublicConfig | null {
  // Next.js inlines these at build time, so they must be referenced literally.
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };

  // authDomain/storageBucket are not strictly needed to boot, but the three below are.
  if (!config.apiKey || !config.authDomain || !config.projectId || !config.appId) return null;

  return {
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    projectId: config.projectId,
    storageBucket: config.storageBucket ?? "",
    messagingSenderId: config.messagingSenderId ?? "",
    appId: config.appId,
  };
}

/** True when enough NEXT_PUBLIC_FIREBASE_* values exist to talk to Firebase at all. */
export function isFirebaseConfigured(): boolean {
  return readConfig() !== null;
}

/** The single owner allowed to use the planner, or null when it has not been set yet. */
export function getOwnerUid(): string | null {
  const uid = process.env.NEXT_PUBLIC_FIREBASE_OWNER_UID?.trim();
  return uid && uid.length > 0 ? uid : null;
}

/**
 * Development-only bootstrap: before the owner UID is known you have to sign in once to
 * discover it. Outside development a missing UID is a configuration error, never a
 * temporary "anyone may pass" state.
 */
export function isSetupBootstrapAllowed(): boolean {
  return process.env.NODE_ENV === "development";
}

let cachedApp: FirebaseApp | null = null;
let cachedAuth: Auth | null = null;
let cachedFirestore: Firestore | null = null;

function getFirebaseApp(): FirebaseApp | null {
  if (typeof window === "undefined") return null;
  if (cachedApp) return cachedApp;

  const config = readConfig();
  if (!config) return null;

  // Guard against Fast Refresh / double-import creating a second app.
  const existing = getApps().find((app) => app.name === APP_NAME);
  cachedApp = existing ?? initializeApp(config, APP_NAME);
  return cachedApp;
}

/** The browser Auth instance, or null when Firebase is not configured / not in a browser. */
export function getFirebaseAuth(): Auth | null {
  if (cachedAuth) return cachedAuth;
  const app = getFirebaseApp();
  if (!app) return null;

  try {
    // Explicit local persistence: the session survives closing the browser, so the user
    // does not have to sign in again on every visit.
    cachedAuth = initializeAuth(app, {
      persistence: browserLocalPersistence,
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch {
    // initializeAuth throws if auth was already initialised for this app (Fast Refresh).
    cachedAuth = getAuth(app);
  }
  return cachedAuth;
}

/** The Firestore instance, or null when Firebase is not configured / not in a browser. */
export function getFirebaseFirestore(): Firestore | null {
  if (cachedFirestore) return cachedFirestore;
  const app = getFirebaseApp();
  if (!app) return null;
  cachedFirestore = getFirestore(app);
  return cachedFirestore;
}

export function createGoogleProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  // Always show the chooser so the wrong Google account can be swapped out easily.
  provider.setCustomParameters({ prompt: "select_account" });
  return provider;
}

/** Test seam — drops the memoised app/auth/firestore handles. */
export function resetFirebaseForTests(): void {
  cachedApp = null;
  cachedAuth = null;
  cachedFirestore = null;
}
