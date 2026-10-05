import { describe, expect, it } from "vitest";
import { alternarTema, resolverTema } from "../src/contextos/tema.ts";

describe("resolverTema", () => {
  it("a escolha manual tem prioridade sobre o sistema", () => {
    expect(resolverTema("claro", false)).toBe("claro");
    expect(resolverTema("claro", true)).toBe("claro");
    expect(resolverTema("escuro", false)).toBe("escuro");
    expect(resolverTema("escuro", true)).toBe("escuro");
  });

  it("sem escolha manual segue o sistema", () => {
    expect(resolverTema(null, false)).toBe("claro");
    expect(resolverTema(null, true)).toBe("escuro");
  });
});

describe("alternarTema", () => {
  it("alterna nos dois sentidos", () => {
    expect(alternarTema("claro")).toBe("escuro");
    expect(alternarTema("escuro")).toBe("claro");
  });
});
