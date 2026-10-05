import { describe, expect, it } from "vitest";
import {
  formatarHorario,
  formatarNumeroCadastro,
  obterPrimeiroNome,
} from "../src/paginas/formatacao.ts";

describe("formatarNumeroCadastro", () => {
  it("completa com zeros até 6 dígitos", () => {
    expect(formatarNumeroCadastro(1)).toBe("Nº 000001");
    expect(formatarNumeroCadastro(5)).toBe("Nº 000005");
    expect(formatarNumeroCadastro(123456)).toBe("Nº 123456");
  });

  it("não corta números maiores", () => {
    expect(formatarNumeroCadastro(1234567)).toBe("Nº 1234567");
  });
});

describe("formatarHorario", () => {
  it("formata HH:MM:SS no horário local", () => {
    expect(formatarHorario(new Date(2026, 0, 2, 3, 4, 5))).toBe("03:04:05");
    expect(formatarHorario(new Date(2026, 5, 20, 23, 59, 58))).toBe("23:59:58");
  });
});

describe("obterPrimeiroNome", () => {
  it("devolve a primeira palavra", () => {
    expect(obterPrimeiroNome("Ana")).toBe("Ana");
    expect(obterPrimeiroNome("Maria da Silva")).toBe("Maria");
  });

  it("ignora espaços nas pontas e múltiplos", () => {
    expect(obterPrimeiroNome("  José   Carlos ")).toBe("José");
  });

  it("devolve o próprio texto quando vazio", () => {
    expect(obterPrimeiroNome("")).toBe("");
  });
});
