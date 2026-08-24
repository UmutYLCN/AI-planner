"use client";

/**
 * Single-user access gate.
 *
 * There is no sign-up, no profile and no user list — just one Google account, checked
 * against NEXT_PUBLIC_FIREBASE_OWNER_UID. Anything else is signed out immediately.
 *
 * When Firebase is not configured at all the gate stays out of the way and renders its
 * children, so the existing offline roadmap features keep working before setup.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { type User, onAuthStateChanged, getRedirectResult, signInWithPopup, signInWithRedirect, signOut } from "firebase/auth";
import { BookOpen, Loader2, Lock, LogOut, ShieldAlert } from "lucide-react";

import {
  createGoogleProvider,
  getFirebaseAuth,
  getOwnerUid,
  isFirebaseConfigured,
  isSetupBootstrapAllowed,
} from "@/lib/firebase/client";
import { resetCloudTaskStore } from "@/lib/cloudTaskStore";

type GateStatus =
  /** Waiting for Firebase to report the persisted session. */
  | "loading"
  /** Firebase env vars are absent — the app runs in local-only mode. */
  | "unconfigured"
  /** Firebase is configured but the owner UID is missing in production. */
  | "config-error"
  | "signed-out"
  /** Development only: signed in, but the owner UID has not been set yet. */
  | "bootstrap"
  /** Signed in with an account that is not the owner. */
  | "denied"
  | "ready";

interface OwnerAuthValue {
  status: GateStatus;
  /** The verified owner UID, or null when Firestore must not be queried. */
  ownerUid: string | null;
  signOutOwner: () => Promise<void>;
}

const OwnerAuthContext = createContext<OwnerAuthValue>({
  status: "unconfigured",
  ownerUid: null,
  signOutOwner: async () => {},
});

/**
 * Auth state for the current viewer. `ownerUid` is non-null only after the signed-in
 * account has been verified, so it doubles as the "safe to query Firestore" signal.
 */
export function useOwnerAuth(): OwnerAuthValue {
  return useContext(OwnerAuthContext);
}

// ── Shell ────────────────────────────────────────────────────────────────────

function Screen({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        background: "var(--cream)",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      {children}
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.2 17.6 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.2-.4-4.6H24v9.1h12.4c-.5 2.9-2.1 5.4-4.6 7l7.6 5.9c4.4-4.1 6.7-10.1 6.7-17.4z" />
      <path fill="#FBBC05" d="M10.4 28.7a14.5 14.5 0 0 1 0-9.4l-7.8-6.1a24 24 0 0 0 0 21.6l7.8-6.1z" />
      <path fill="#34A853" d="M24 48c6.2 0 11.5-2 15.4-5.6l-7.6-5.9c-2.1 1.4-4.8 2.3-7.8 2.3-6.4 0-11.7-3.7-13.6-8.9l-7.8 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

function Logo() {
  return (
    <div
      className="clay-card clay-card-green"
      style={{
        width: 56,
        height: 56,
        borderRadius: 18,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        margin: "0 auto 20px",
        boxShadow: "3px 3px 0 var(--border-clay)",
      }}
    >
      <BookOpen className="w-7 h-7" style={{ color: "var(--green-dark)" }} />
    </div>
  );
}

// ── Gate ─────────────────────────────────────────────────────────────────────

export default function OwnerGate({ children }: { children: ReactNode }) {
  // Lazily computed at first render rather than in an effect: isFirebaseConfigured() only
  // reads build-time-inlined env vars, so it is identical on server and client and needs
  // no round trip through an effect to settle.
  const [status, setStatus] = useState<GateStatus>(() => (isFirebaseConfigured() ? "loading" : "unconfigured"));
  const [user, setUser] = useState<User | null>(null);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [verifiedOwnerUid, setVerifiedOwnerUid] = useState<string | null>(null);

  useEffect(() => {
    // Effects only ever run in the browser, so when Firebase is configured this is always
    // non-null here; the guard just keeps this safe if that ever stops being true.
    const auth = getFirebaseAuth();
    if (!auth) return;

    // A redirect sign-in finishes here; failures surface as a message rather than a crash.
    getRedirectResult(auth).catch(() => {
      setSignInError("Google girişi tamamlanamadı. Lütfen tekrar dene.");
    });

    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setSigningIn(false);

      if (!nextUser) {
        setVerifiedOwnerUid(null);
        resetCloudTaskStore();
        setStatus("signed-out");
        return;
      }

      const ownerUid = getOwnerUid();
      if (!ownerUid) {
        setVerifiedOwnerUid(null);
        // No owner configured: never query Firestore. In development we show the UID so
        // it can be copied into the env files; in production this is a hard config error.
        setStatus(isSetupBootstrapAllowed() ? "bootstrap" : "config-error");
        return;
      }

      if (nextUser.uid !== ownerUid) {
        setVerifiedOwnerUid(null);
        resetCloudTaskStore();
        setStatus("denied");
        void signOut(auth).catch(() => {});
        return;
      }

      setVerifiedOwnerUid(ownerUid);
      setStatus("ready");
    });

    return unsubscribe;
  }, []);

  const handleSignIn = useCallback(async () => {
    const auth = getFirebaseAuth();
    if (!auth) return;

    setSignInError(null);
    setSigningIn(true);
    try {
      await signInWithPopup(auth, createGoogleProvider());
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
      if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
        // Popup unavailable (blocked, or an in-app/mobile browser) — fall back to redirect.
        try {
          await signInWithRedirect(auth, createGoogleProvider());
          return;
        } catch {
          setSignInError("Google girişi başlatılamadı. Lütfen tekrar dene.");
        }
      } else if (code === "auth/unauthorized-domain") {
        setSignInError("Bu alan adı Firebase'de yetkili değil. Firebase Console > Authentication > Settings.");
      } else if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") {
        setSignInError("Google girişi tamamlanamadı. Lütfen tekrar dene.");
      }
      setSigningIn(false);
    }
  }, []);

  const signOutOwner = useCallback(async () => {
    const auth = getFirebaseAuth();
    if (!auth) return;
    resetCloudTaskStore();
    await signOut(auth);
  }, []);

  const contextValue = useMemo<OwnerAuthValue>(
    () => ({
      status,
      // Guarded so no descendant can query Firestore before the owner is verified.
      ownerUid: status === "ready" ? verifiedOwnerUid : null,
      signOutOwner,
    }),
    [status, verifiedOwnerUid, signOutOwner],
  );

  if (status === "loading") {
    return (
      <Screen>
        <div style={{ textAlign: "center", color: "#64748b" }}>
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: "var(--green)" }} />
          <p style={{ marginTop: 12, fontSize: 14 }}>Oturum kontrol ediliyor…</p>
        </div>
      </Screen>
    );
  }

  if (status === "config-error") {
    return (
      <Screen>
        <div className="clay-card clay-card-orange" style={{ padding: 36, borderRadius: 24, maxWidth: 460, textAlign: "center" }}>
          <ShieldAlert className="w-8 h-8" style={{ margin: "0 auto 14px", color: "#c2410c" }} />
          <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 10 }}>Yapılandırma hatası</h1>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: "#475569" }}>
            <code>NEXT_PUBLIC_FIREBASE_OWNER_UID</code> tanımlı değil. Bu değer ayarlanmadan planner
            verilerine erişilemez.
          </p>
        </div>
      </Screen>
    );
  }

  if (status === "bootstrap") {
    return (
      <Screen>
        <div className="clay-card clay-card-yellow" style={{ padding: 36, borderRadius: 24, maxWidth: 500 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 10 }}>İlk kurulum</h1>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: "#475569", marginBottom: 16 }}>
            Giriş yaptın ama owner UID henüz ayarlanmamış. Aşağıdaki değeri{" "}
            <code>NEXT_PUBLIC_FIREBASE_OWNER_UID</code>, Worker&apos;daki <code>FIREBASE_OWNER_UID</code> ve{" "}
            <code>firestore.rules</code> içine yaz, sonra sayfayı yenile.
          </p>
          <div
            style={{
              background: "white",
              border: "2px solid var(--border-clay)",
              borderRadius: 12,
              padding: "12px 14px",
              fontFamily: "ui-monospace, monospace",
              fontSize: 13,
              wordBreak: "break-all",
            }}
          >
            {user?.uid}
          </div>
          <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 14 }}>
            Bu ekran yalnızca development modunda görünür.
          </p>
          <button onClick={signOutOwner} className="btn-clay btn-ghost btn-sm" style={{ marginTop: 16 }}>
            <LogOut className="w-4 h-4" /> Çıkış yap
          </button>
        </div>
      </Screen>
    );
  }

  if (status === "signed-out" || status === "denied") {
    return (
      <Screen>
        <div className="clay-card" style={{ padding: 40, borderRadius: 28, maxWidth: 420, width: "100%", textAlign: "center" }}>
          <Logo />
          <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Planner&apos;ın kilidini aç</h1>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: "#64748b", marginBottom: 28 }}>
            Claude görevlerini görmek için Google hesabınla devam et.
          </p>

          {status === "denied" && (
            <div
              role="alert"
              className="clay-card clay-card-orange"
              style={{ padding: "12px 16px", borderRadius: 14, marginBottom: 18, fontSize: 13, lineHeight: 1.5 }}
            >
              Bu Google hesabı planner erişimine yetkili değil.
            </div>
          )}

          {signInError && (
            <div
              role="alert"
              style={{ fontSize: 13, color: "#b91c1c", marginBottom: 16, lineHeight: 1.5 }}
            >
              {signInError}
            </div>
          )}

          <button
            onClick={handleSignIn}
            disabled={signingIn}
            className="btn-clay btn-ghost"
            style={{ width: "100%", justifyContent: "center", fontSize: 15, opacity: signingIn ? 0.6 : 1 }}
          >
            {signingIn ? <Loader2 className="w-4 h-4 animate-spin" /> : <GoogleMark />}
            {signingIn ? "Bağlanıyor…" : "Google ile devam et"}
          </button>

          <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 20, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <Lock className="w-3 h-3" /> Bu planner tek kullanıcılıdır.
          </p>
        </div>
      </Screen>
    );
  }

  // "ready" and "unconfigured" both render the app; only "ready" exposes an owner UID.
  return <OwnerAuthContext.Provider value={contextValue}>{children}</OwnerAuthContext.Provider>;
}
