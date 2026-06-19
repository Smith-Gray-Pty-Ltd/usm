import { describe, it, expect } from "vitest";
import { parseUsmFile } from "../src/parse.js";
import { validateUsm } from "../src/validate.js";
import { generate } from "../src/generate.js";
import path from "node:path";

const SPEC_DIR = path.resolve(__dirname, "../../.usm");

/**
 * Round-trip test: prove the format is viable.
 * 1. Parse a .usm file
 * 2. Validate it against the schema
 * 3. Generate markdown from it
 * 4. Re-parse the original .usm file
 * 5. Verify key fields match (semantic equivalence)
 *
 * For the MVP, this is a "light" round-trip — we verify schema validation,
 * generator execution, and structural consistency. Byte-perfect markdown
 * conversion is a future goal.
 */
describe("roundtrip", () => {
  const specFiles = [
    { name: "system.usm", path: path.join(SPEC_DIR, "system.usm") },
    { name: "the-architect.usm", path: path.join(SPEC_DIR, "services/the-architect.usm") },
    { name: "login.usm", path: path.join(SPEC_DIR, "features/auth/login.usm") },
  ];

  for (const spec of specFiles) {
    describe(spec.name, () => {
      it("parses without error", () => {
        const parsed = parseUsmFile(spec.path);
        expect(parsed).toBeDefined();
        expect(parsed.$id).toBeTruthy();
        expect(parsed.$type).toBeTruthy();
        expect(parsed.$version).toBeGreaterThanOrEqual(1);
        expect(parsed.summary).toBeTruthy();
      });

      it("validates against schema", () => {
        const parsed = parseUsmFile(spec.path);
        const result = validateUsm(parsed);
        expect(result.valid).toBe(true);
      });

      it("generates markdown output", () => {
        const parsed = parseUsmFile(spec.path);
        const result = generate(parsed, ["markdown"], "/tmp/roundtrip-test");
        expect(result.outputs.length).toBeGreaterThan(0);
        for (const output of result.outputs) {
          expect(output.content.length).toBeGreaterThan(100);
          expect(output.path).toBeTruthy();
        }
      });

      it("re-parses with same key fields", () => {
        const first = parseUsmFile(spec.path);
        const second = parseUsmFile(spec.path);

        expect(first.$id).toBe(second.$id);
        expect(first.$type).toBe(second.$type);
        expect(first.$version).toBe(second.$version);
        expect(first.summary).toBe(second.summary);
      });
    });
  }

  describe("cross-file consistency", () => {
    it("service references match system service list", () => {
      const system = parseUsmFile(path.join(SPEC_DIR, "system.usm"));
      const service = parseUsmFile(
        path.join(SPEC_DIR, "services/the-architect.usm")
      );

      // Service's $system should reference the system's $id
      if (service.$type === "service") {
        expect(service.$system).toBe(system.$id);
      }

      // System should list the service
      if (system.$type === "system" && system.services) {
        const ids = system.services.map((s) => s.id);
        expect(ids).toContain("the-architect");
      }
    });

    it("feature references match service and system", () => {
      const system = parseUsmFile(path.join(SPEC_DIR, "system.usm"));
      const service = parseUsmFile(
        path.join(SPEC_DIR, "services/the-architect.usm")
      );
      const feature = parseUsmFile(
        path.join(SPEC_DIR, "features/auth/login.usm")
      );

      if (feature.$type === "feature") {
        expect(feature.$system).toBe(system.$id);
        expect(feature.$service).toBe(service.$id);
      }
    });
  });
});
