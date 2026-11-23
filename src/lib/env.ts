import { z } from "zod";

const loopbackHostPattern = /^(?:127\.0\.0\.1|localhost|\[::1\]):[1-9]\d{0,4}$/;
const defaultDemoProjectId = "demo-sistema-asignacion";

export function isLoopbackHost(host: string): boolean {
  return loopbackHostPattern.test(host);
}

const publicConfigSchema = z.object({
  projectId: z.string().min(1),
  apiKey: z.string().min(1),
  authDomain: z.string().min(1),
  appId: z.string().min(1),
  useEmulators: z.boolean(),
  authEmulatorHost: z.string().optional()
});

export type PublicFirebaseConfig = z.infer<typeof publicConfigSchema>;

const serverConfigSchema = z.object({
  projectId: z.string().min(1),
  authEmulatorHost: z.string().optional(),
  firestoreEmulatorHost: z.string().optional(),
  clientEmail: z.string().min(1).optional(),
  privateKey: z.string().min(1).optional()
});

export type ServerFirebaseConfig = z.infer<typeof serverConfigSchema>;

function optionalNonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function getPublicFirebaseConfig(
  env: Record<string, string | undefined> = process.env
): PublicFirebaseConfig {
  const useEmulators = env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true";
  const authEmulatorHost = optionalNonEmpty(env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST);

  if (authEmulatorHost && !isLoopbackHost(authEmulatorHost)) {
    throw new Error("NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST must be a loopback host:port.");
  }

  return publicConfigSchema.parse({
    projectId:
      optionalNonEmpty(env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) ??
      (useEmulators ? defaultDemoProjectId : undefined),
    apiKey:
      optionalNonEmpty(env.NEXT_PUBLIC_FIREBASE_API_KEY) ??
      (useEmulators ? "demo-local-api-key" : undefined),
    authDomain:
      optionalNonEmpty(env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN) ??
      (useEmulators ? `${defaultDemoProjectId}.firebaseapp.com` : undefined),
    appId:
      optionalNonEmpty(env.NEXT_PUBLIC_FIREBASE_APP_ID) ??
      (useEmulators ? "1:000000000000:web:localdemo" : undefined),
    useEmulators,
    authEmulatorHost
  });
}

export function getServerFirebaseConfig(
  env: Record<string, string | undefined> = process.env
): ServerFirebaseConfig {
  const authEmulatorHost = optionalNonEmpty(env.FIREBASE_AUTH_EMULATOR_HOST);
  const firestoreEmulatorHost = optionalNonEmpty(env.FIRESTORE_EMULATOR_HOST);

  if (authEmulatorHost && !isLoopbackHost(authEmulatorHost)) {
    throw new Error("FIREBASE_AUTH_EMULATOR_HOST must be a loopback host:port.");
  }
  if (firestoreEmulatorHost && !isLoopbackHost(firestoreEmulatorHost)) {
    throw new Error("FIRESTORE_EMULATOR_HOST must be a loopback host:port.");
  }

  const hasEmulator = Boolean(authEmulatorHost || firestoreEmulatorHost);
  const projectId =
    optionalNonEmpty(env.FIREBASE_PROJECT_ID) ??
    (hasEmulator
      ? optionalNonEmpty(env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) ?? defaultDemoProjectId
      : undefined);

  const rawPrivateKey = optionalNonEmpty(env.FIREBASE_PRIVATE_KEY);

  return serverConfigSchema.parse({
    projectId,
    authEmulatorHost,
    firestoreEmulatorHost,
    clientEmail: optionalNonEmpty(env.FIREBASE_CLIENT_EMAIL),
    privateKey: rawPrivateKey ? rawPrivateKey.replace(/\\n/g, "\n") : undefined
  });
}
