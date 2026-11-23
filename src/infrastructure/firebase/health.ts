import "server-only";

import { getServerFirebaseConfig, isLoopbackHost } from "@/lib/env";

export type EmulatorProbeStatus = "connected" | "unreachable" | "not-configured";

export type LocalEnvironmentStatus = Readonly<{
  projectId: string;
  emulators: {
    auth: { host: string | null; status: EmulatorProbeStatus };
    firestore: { host: string | null; status: EmulatorProbeStatus };
  };
  directClientRules: "deny-all";
}>;

export async function probeLoopbackService(
  host: string | undefined
): Promise<EmulatorProbeStatus> {
  if (!host) return "not-configured";
  if (!isLoopbackHost(host)) return "unreachable";

  try {
    await fetch(`http://${host}/`, {
      method: "GET",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(1500)
    });
    return "connected";
  } catch {
    return "unreachable";
  }
}

export async function getLocalEnvironmentStatus(): Promise<LocalEnvironmentStatus> {
  const config = getServerFirebaseConfig({
    ...process.env,
    FIREBASE_PROJECT_ID:
      process.env.FIREBASE_PROJECT_ID ??
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??
      "demo-sistema-asignacion"
  });

  const [authStatus, firestoreStatus] = await Promise.all([
    probeLoopbackService(config.authEmulatorHost),
    probeLoopbackService(config.firestoreEmulatorHost)
  ]);

  return {
    projectId: config.projectId,
    emulators: {
      auth: {
        host: config.authEmulatorHost ?? null,
        status: authStatus
      },
      firestore: {
        host: config.firestoreEmulatorHost ?? null,
        status: firestoreStatus
      }
    },
    directClientRules: "deny-all"
  };
}
