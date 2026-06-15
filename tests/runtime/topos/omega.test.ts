import { describe, it, expect } from "vitest";
import {
  type Omega,
  omegaAnd,
  omegaOr,
  omegaNot,
  omegaImplies,
} from "../../../src/laws/topos/omega.js";

const VALUES: Omega[] = ["true", "false", "unknown"];

describe("omega", () => {
  describe("omegaAnd", () => {
    it("matches the published truth table", () => {
      expect(omegaAnd("true", "true")).toBe("true");
      expect(omegaAnd("true", "false")).toBe("false");
      expect(omegaAnd("true", "unknown")).toBe("unknown");
      expect(omegaAnd("false", "true")).toBe("false");
      expect(omegaAnd("false", "false")).toBe("false");
      expect(omegaAnd("false", "unknown")).toBe("false");
      expect(omegaAnd("unknown", "true")).toBe("unknown");
      expect(omegaAnd("unknown", "false")).toBe("false");
      expect(omegaAnd("unknown", "unknown")).toBe("unknown");
    });

    it("is commutative", () => {
      for (const a of VALUES) {
        for (const b of VALUES) {
          expect(omegaAnd(a, b)).toBe(omegaAnd(b, a));
        }
      }
    });

    it("agrees with classical AND on the boolean slice", () => {
      expect(omegaAnd("true", "true")).toBe("true");
      expect(omegaAnd("true", "false")).toBe("false");
      expect(omegaAnd("false", "true")).toBe("false");
      expect(omegaAnd("false", "false")).toBe("false");
    });
  });

  describe("omegaOr", () => {
    it("matches the published truth table", () => {
      expect(omegaOr("true", "true")).toBe("true");
      expect(omegaOr("true", "false")).toBe("true");
      expect(omegaOr("true", "unknown")).toBe("true");
      expect(omegaOr("false", "true")).toBe("true");
      expect(omegaOr("false", "false")).toBe("false");
      expect(omegaOr("false", "unknown")).toBe("unknown");
      expect(omegaOr("unknown", "true")).toBe("true");
      expect(omegaOr("unknown", "false")).toBe("unknown");
      expect(omegaOr("unknown", "unknown")).toBe("unknown");
    });

    it("is commutative", () => {
      for (const a of VALUES) {
        for (const b of VALUES) {
          expect(omegaOr(a, b)).toBe(omegaOr(b, a));
        }
      }
    });
  });

  describe("omegaNot", () => {
    it("flips definite values and preserves unknown", () => {
      expect(omegaNot("true")).toBe("false");
      expect(omegaNot("false")).toBe("true");
      expect(omegaNot("unknown")).toBe("unknown");
    });

    it("is involutive", () => {
      for (const a of VALUES) {
        expect(omegaNot(omegaNot(a))).toBe(a);
      }
    });
  });

  describe("omegaImplies", () => {
    it("matches ¬a ∨ b for all combinations", () => {
      for (const a of VALUES) {
        for (const b of VALUES) {
          expect(omegaImplies(a, b)).toBe(omegaOr(omegaNot(a), b));
        }
      }
    });

    it("agrees with classical → on the boolean slice", () => {
      expect(omegaImplies("true", "true")).toBe("true");
      expect(omegaImplies("true", "false")).toBe("false");
      expect(omegaImplies("false", "true")).toBe("true");
      expect(omegaImplies("false", "false")).toBe("true");
    });

    it("an unknown antecedent with a true consequent still proves the implication", () => {
      // true dominates omegaOr, so ¬unknown ∨ true = unknown ∨ true = true.
      expect(omegaImplies("unknown", "true")).toBe("true");
    });
  });

  describe("monotonicity wrt information refinement", () => {
    // Refining "unknown" to "true" or "false" should never flip a definite
    // verdict — Kleene strong-three-valued logic is monotone in this sense.
    // We assert a weaker property: definite verdicts are preserved by any
    // refinement of "unknown" inputs.
    const refinements: Array<[Omega, Omega]> = [
      ["unknown", "true"],
      ["unknown", "false"],
    ];

    it("omegaAnd: definite results survive any unknown refinement", () => {
      for (const [u, refined] of refinements) {
        for (const other of VALUES) {
          const before = omegaAnd(u, other);
          const after = omegaAnd(refined, other);
          if (before === "true" || before === "false") {
            expect(after).toBe(before);
          }
        }
      }
    });

    it("omegaOr: definite results survive any unknown refinement", () => {
      for (const [u, refined] of refinements) {
        for (const other of VALUES) {
          const before = omegaOr(u, other);
          const after = omegaOr(refined, other);
          if (before === "true" || before === "false") {
            expect(after).toBe(before);
          }
        }
      }
    });
  });
});
