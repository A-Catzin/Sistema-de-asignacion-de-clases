import "server-only";

import { cert, getApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getServerFirebaseConfig } from "@/lib/env";

export function getFirebaseAdminApp(): App {
  if (getApps().length > 0) {
    return getApp();
  }

  const config = getServerFirebaseConfig();
  const usingEmulators = Boolean(config.authEmulatorHost || config.firestoreEmulatorHost);

  if (!usingEmulators && config.clientEmail && config.privateKey) {
    return initializeApp({
      credential: cert({
        projectId: config.projectId,
        clientEmail: config.clientEmail,
        privateKey: config.privateKey
      }),
      projectId: config.projectId
    });
  }

  return initializeApp({ projectId: config.projectId });
}

export function getAdminAuth(): Auth {
  return getAuth(getFirebaseAdminApp());
}

export function getAdminFirestore(): Firestore {
  return getFirestore(getFirebaseAdminApp());
}
