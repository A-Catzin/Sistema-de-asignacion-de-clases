import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { getPublicFirebaseConfig } from "@/lib/env";

let authEmulatorConnected = false;

export function getFirebaseClientApp(): FirebaseApp {
  if (getApps().length > 0) {
    return getApp();
  }
  const config = getPublicFirebaseConfig({
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    NEXT_PUBLIC_USE_FIREBASE_EMULATORS: process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS,
    NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST: process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST
  });

  return initializeApp({
    projectId: config.projectId,
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    appId: config.appId
  });
}

export function getFirebaseClientAuth(): Auth {
  const app = getFirebaseClientApp();
  const auth = getAuth(app);
  const useEmulators = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true";
  const authEmulatorHost = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST;

  if (useEmulators && authEmulatorHost && !authEmulatorConnected) {
    connectAuthEmulator(auth, `http://${authEmulatorHost}`, { disableWarnings: true });
    authEmulatorConnected = true;
  }

  return auth;
}
