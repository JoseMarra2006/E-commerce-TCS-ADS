import { describe, expect, it } from "vitest";
import Aplicacao from "../src/Aplicacao.tsx";

describe("configuração do ambiente de testes", () => {
  it("importa o componente Aplicacao como função", () => {
    expect(typeof Aplicacao).toBe("function");
  });
});
