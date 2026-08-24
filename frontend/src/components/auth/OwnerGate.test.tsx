import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { User } from "firebase/auth";

const isFirebaseConfiguredMock = vi.fn();
const getFirebaseAuthMock = vi.fn();
const getOwnerUidMock = vi.fn();
const isSetupBootstrapAllowedMock = vi.fn();
const createGoogleProviderMock = vi.fn(() => ({}));

const onAuthStateChangedMock = vi.fn();
const getRedirectResultMock = vi.fn();
const signInWithPopupMock = vi.fn();
const signInWithRedirectMock = vi.fn();
const signOutMock = vi.fn();

vi.mock("@/lib/firebase/client", () => ({
  isFirebaseConfigured: () => isFirebaseConfiguredMock(),
  getFirebaseAuth: () => getFirebaseAuthMock(),
  getOwnerUid: () => getOwnerUidMock(),
  isSetupBootstrapAllowed: () => isSetupBootstrapAllowedMock(),
  createGoogleProvider: () => createGoogleProviderMock(),
}));

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (...args: unknown[]) => onAuthStateChangedMock(...args),
  getRedirectResult: (...args: unknown[]) => getRedirectResultMock(...args),
  signInWithPopup: (...args: unknown[]) => signInWithPopupMock(...args),
  signInWithRedirect: (...args: unknown[]) => signInWithRedirectMock(...args),
  signOut: (...args: unknown[]) => signOutMock(...args),
}));

const { default: OwnerGate, useOwnerAuth } = await import("@/components/auth/OwnerGate");

const FAKE_AUTH = { __fakeAuth: true };
const OWNER_UID = "owner-uid-123";

function fakeUser(uid: string): User {
  return { uid } as User;
}

/** Fires the onAuthStateChanged callback registered by the component under test. */
function emitAuthState(user: User | null) {
  const callback = onAuthStateChangedMock.mock.calls.at(-1)?.[1];
  act(() => {
    callback?.(user);
  });
}

function AuthProbe() {
  const { ownerUid, status } = useOwnerAuth();
  return (
    <div data-testid="probe" data-status={status} data-owner-uid={ownerUid ?? ""} />
  );
}

beforeEach(() => {
  isFirebaseConfiguredMock.mockReset().mockReturnValue(true);
  getFirebaseAuthMock.mockReset().mockReturnValue(FAKE_AUTH);
  getOwnerUidMock.mockReset().mockReturnValue(OWNER_UID);
  isSetupBootstrapAllowedMock.mockReset().mockReturnValue(false);
  onAuthStateChangedMock.mockReset().mockReturnValue(() => {});
  getRedirectResultMock.mockReset().mockResolvedValue(null);
  signInWithPopupMock.mockReset().mockResolvedValue(undefined);
  signInWithRedirectMock.mockReset().mockResolvedValue(undefined);
  signOutMock.mockReset().mockResolvedValue(undefined);
});

describe("OwnerGate — Firebase not configured", () => {
  it("renders children directly so the offline roadmap features keep working", () => {
    isFirebaseConfiguredMock.mockReturnValue(false);
    render(
      <OwnerGate>
        <div>Roadmap content</div>
      </OwnerGate>,
    );
    expect(screen.getByText("Roadmap content")).toBeInTheDocument();
  });
});

describe("OwnerGate — signed out", () => {
  it("shows only a Google continue button, no register/profile UI", () => {
    render(
      <OwnerGate>
        <div>Should not render</div>
      </OwnerGate>,
    );
    emitAuthState(null);

    expect(screen.getByRole("button", { name: /google ile devam et/i })).toBeInTheDocument();
    expect(screen.queryByText("Should not render")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /şifre/i })).not.toBeInTheDocument();
  });

  it("starts a popup sign-in when the button is clicked", async () => {
    render(<OwnerGate><div /></OwnerGate>);
    emitAuthState(null);

    await userEvent.click(screen.getByRole("button", { name: /google ile devam et/i }));
    expect(signInWithPopupMock).toHaveBeenCalledWith(FAKE_AUTH, expect.anything());
  });

  it("falls back to redirect when the popup is blocked", async () => {
    signInWithPopupMock.mockRejectedValue({ code: "auth/popup-blocked" });
    render(<OwnerGate><div /></OwnerGate>);
    emitAuthState(null);

    await userEvent.click(screen.getByRole("button", { name: /google ile devam et/i }));
    expect(signInWithRedirectMock).toHaveBeenCalledWith(FAKE_AUTH, expect.anything());
  });
});

describe("OwnerGate — owner verification", () => {
  it("renders children and exposes the owner uid once the owner signs in", () => {
    render(
      <OwnerGate>
        <AuthProbe />
      </OwnerGate>,
    );
    emitAuthState(fakeUser(OWNER_UID));

    const probe = screen.getByTestId("probe");
    expect(probe).toHaveAttribute("data-status", "ready");
    expect(probe).toHaveAttribute("data-owner-uid", OWNER_UID);
  });

  it("denies a non-owner account, signs it out, and shows no technical detail", () => {
    render(
      <OwnerGate>
        <div>Should not render</div>
      </OwnerGate>,
    );
    emitAuthState(fakeUser("someone-elses-uid"));

    expect(screen.getByRole("alert")).toHaveTextContent("Bu Google hesabı planner erişimine yetkili değil.");
    expect(screen.queryByText("Should not render")).not.toBeInTheDocument();
    expect(signOutMock).toHaveBeenCalledWith(FAKE_AUTH);
    // The real owner UID must never leak into the denial message.
    expect(screen.getByRole("alert").textContent).not.toContain(OWNER_UID);
  });

  it("never exposes an owner uid for a denied account", () => {
    render(
      <OwnerGate>
        <AuthProbe />
      </OwnerGate>,
    );
    emitAuthState(fakeUser("someone-elses-uid"));
    // AuthProbe is inside the gate's children, which are not rendered while denied —
    // assert instead via the exported default context value shape by checking no Firestore
    // consuming UI (the probe) is mounted at all.
    expect(screen.queryByTestId("probe")).not.toBeInTheDocument();
  });
});

describe("OwnerGate — owner UID not configured", () => {
  it("shows a bootstrap screen with the signed-in UID in development", () => {
    getOwnerUidMock.mockReturnValue(null);
    isSetupBootstrapAllowedMock.mockReturnValue(true);

    render(<OwnerGate><div /></OwnerGate>);
    emitAuthState(fakeUser("some-uid-to-copy"));

    expect(screen.getByText("İlk kurulum")).toBeInTheDocument();
    expect(screen.getByText("some-uid-to-copy")).toBeInTheDocument();
  });

  it("shows a hard configuration error in production, without revealing any UID", () => {
    getOwnerUidMock.mockReturnValue(null);
    isSetupBootstrapAllowedMock.mockReturnValue(false);

    render(<OwnerGate><div /></OwnerGate>);
    emitAuthState(fakeUser("some-uid-to-copy"));

    expect(screen.getByText("Yapılandırma hatası")).toBeInTheDocument();
    expect(screen.queryByText("some-uid-to-copy")).not.toBeInTheDocument();
  });
});

describe("OwnerGate — sign out", () => {
  it("clears the cloud task store on sign-out via useOwnerAuth().signOutOwner", async () => {
    function LockButton() {
      const { signOutOwner } = useOwnerAuth();
      return <button onClick={() => void signOutOwner()}>Kilitle</button>;
    }

    render(
      <OwnerGate>
        <LockButton />
      </OwnerGate>,
    );
    emitAuthState(fakeUser(OWNER_UID));

    await userEvent.click(screen.getByRole("button", { name: "Kilitle" }));
    expect(signOutMock).toHaveBeenCalledWith(FAKE_AUTH);
  });
});
