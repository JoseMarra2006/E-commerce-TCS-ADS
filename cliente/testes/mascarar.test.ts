import { describe, expect, it } from "vitest";
import { mascararParaRegistro } from "../src/api/mascarar.ts";

describe("mascararParaRegistro", () => {
  it("mascara a senha", () => {
    expect(mascararParaRegistro('{"email":"a@b.com","senha":"segredo1"}')).toBe(
      '{"email":"a@b.com","senha":"***"}',
    );
  });

  it("mascara a senha em objetos aninhados e arrays", () => {
    const resultado = mascararParaRegistro(
      '{"a":{"senha":"x1"},"lista":[{"senha":"y2"},{"b":[{"senha":"z3"}]}]}',
    );
    expect(resultado).not.toContain("x1");
    expect(resultado).not.toContain("y2");
    expect(resultado).not.toContain("z3");
    expect(resultado).toBe('{"a":{"senha":"***"},"lista":[{"senha":"***"},{"b":[{"senha":"***"}]}]}');
  });

  it("trunca o token em 8 caracteres", () => {
    expect(mascararParaRegistro('{"id":"1","token":"abcdefghijklmnop"}')).toBe(
      '{"id":"1","token":"abcdefgh..."}',
    );
    expect(mascararParaRegistro('{"token":123}')).toBe('{"token":"***"}');
  });

  it("mascara senha e token em texto que não é JSON", () => {
    const resultado = mascararParaRegistro('lixo "senha": "abc123" e "token":"abcdefghijkl" fim');
    expect(resultado).toBe('lixo "senha": "***" e "token": "***" fim');
  });

  it("devolve null para null e texto vazio", () => {
    expect(mascararParaRegistro(null)).toBeNull();
    expect(mascararParaRegistro("   ")).toBeNull();
  });

  it("trunca resultados acima de 5000 caracteres", () => {
    const resultado = mascararParaRegistro(JSON.stringify({ texto: "a".repeat(6000) }));
    expect(resultado).not.toBeNull();
    expect(resultado?.endsWith(" (truncado)")).toBe(true);
    expect(resultado?.length).toBe(5000 + " (truncado)".length);
  });

  it("não lança exceção nem expõe a senha com 5.000 níveis de aninhamento", () => {
    const profundidade = 5000;
    const texto = '{"a":'.repeat(profundidade) + '{"senha":"SEGREDO99"}' + "}".repeat(profundidade);
    let resultado: string | null = null;
    expect(() => {
      resultado = mascararParaRegistro(texto);
    }).not.toThrow();
    expect(resultado === null || !String(resultado).includes("SEGREDO99")).toBe(true);
  });
});
