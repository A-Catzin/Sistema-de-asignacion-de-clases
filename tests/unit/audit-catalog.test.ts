import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildAuditRecord, sanitizeAuditSnapshot } from "../../src/domain/audit/audit-catalog";

const rootDir = path.resolve(__dirname, "../..");

describe("T11 durable audit catalog", () => {
  it("strips sensitive keys recursively from before/after snapshots", () => {
    const clean = sanitizeAuditSnapshot({
      email: "user@institucion.edu.mx",
      password: "plain-password",
      nested: {
        idToken: "secret-token",
        sessionCookie: "cookie-value",
        privateKey: "key",
        displayName: "Nombre"
      },
      items: [{ secretCode: "x", role: "coordinator" }]
    });

    expect(clean).toEqual({
      email: "user@institucion.edu.mx",
      nested: {
        displayName: "Nombre"
      },
      items: [{ role: "coordinator" }]
    });
    expect(sanitizeAuditSnapshot(null)).toBeNull();
  });

  it("validates required audit metadata and stamps occurredAtIso", () => {
    const record = buildAuditRecord({
      id: "evt-1",
      eventType: "user.provision",
      entityType: "user_profile",
      entityId: "uid-1",
      actorUid: "admin-1",
      actorRole: "admin",
      correlationId: "corr-1",
      before: null,
      after: { role: "coordinator", password: "should-not-be-stored" }
    });

    expect(record.id).toBe("evt-1");
    expect(record.after).toEqual({ role: "coordinator" });
    expect(Number.isNaN(Date.parse(record.occurredAtIso))).toBe(false);

    expect(() =>
      buildAuditRecord({
        id: "evt-2",
        eventType: "user.provision",
        entityType: "user_profile",
        entityId: "uid-1",
        actorUid: "",
        actorRole: "admin",
        correlationId: "corr-2",
        before: null,
        after: {}
      })
    ).toThrow(/actorUid/);
  });

  it("protects audit-store.ts with server-only and uses immutable append-only create()", () => {
    const source = readFileSync(
      path.join(rootDir, "src/infrastructure/audit/audit-store.ts"),
      "utf8"
    );
    expect(source.trimStart().startsWith('import "server-only";')).toBe(true);
    expect(source).toContain("batch.create(");
    expect(source).toContain("tx.create(");
  });
});
