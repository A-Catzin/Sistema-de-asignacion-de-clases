import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import tailwindConfig from "../../tailwind.config";
import { getPublicFirebaseConfig, getServerFirebaseConfig } from "../../src/lib/env";

const rootDir = path.resolve(__dirname, "../..");

describe("T06 foundation contracts", () => {
  it("accepts loopback emulator hosts and rejects non-loopback hosts", () => {
    const valid = getServerFirebaseConfig({
      FIREBASE_PROJECT_ID: "demo-sistema-asignacion",
      FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
      FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080"
    });
    expect(valid.projectId).toBe("demo-sistema-asignacion");
    expect(valid.authEmulatorHost).toBe("127.0.0.1:9099");
    expect(valid.firestoreEmulatorHost).toBe("127.0.0.1:8080");

    expect(() =>
      getServerFirebaseConfig({
        FIREBASE_PROJECT_ID: "demo-sistema-asignacion",
        FIRESTORE_EMULATOR_HOST: "firestore.googleapis.com:443"
      })
    ).toThrow(/loopback/);

    expect(() =>
      getServerFirebaseConfig({
        FIREBASE_PROJECT_ID: "demo-sistema-asignacion",
        FIREBASE_AUTH_EMULATOR_HOST: "example.com:9099"
      })
    ).toThrow(/loopback/);
  });

  it("never exposes server-only credentials from getPublicFirebaseConfig", () => {
    const publicConfig = getPublicFirebaseConfig({
      NEXT_PUBLIC_USE_FIREBASE_EMULATORS: "true",
      NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
      FIREBASE_CLIENT_EMAIL: "admin@example.iam.gserviceaccount.com",
      FIREBASE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----secret-----END PRIVATE KEY-----"
    });

    const serialized = JSON.stringify(publicConfig);
    expect(serialized).not.toContain("FIREBASE_PRIVATE_KEY");
    expect(serialized).not.toContain("FIREBASE_CLIENT_EMAIL");
    expect(serialized).not.toContain("BEGIN PRIVATE KEY");
    expect(publicConfig).not.toHaveProperty("privateKey");
    expect(publicConfig).not.toHaveProperty("clientEmail");
  });

  it("maps muted-foreground and line-subtle in Tailwind color tokens (K07)", () => {
    const colors = tailwindConfig.theme?.extend?.colors as Record<string, string>;
    expect(colors["muted-foreground"]).toBe("var(--muted-foreground)");
    expect(colors["line-subtle"]).toBe("var(--line-subtle)");
  });

  it("enforces default-deny in firestore.rules", () => {
    const rules = readFileSync(path.join(rootDir, "firestore.rules"), "utf8");
    expect(rules).toContain("allow read, write: if false;");
    expect(rules).not.toContain("if true");
  });

  it("guards Firebase Admin SDK module with server-only", () => {
    const adminSource = readFileSync(
      path.join(rootDir, "src/infrastructure/firebase/admin.ts"),
      "utf8"
    );
    expect(adminSource.trimStart().startsWith('import "server-only";')).toBe(true);
  });
});
