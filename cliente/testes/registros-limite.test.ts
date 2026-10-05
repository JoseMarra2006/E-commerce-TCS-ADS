import { describe, expect, it } from "vitest";
import type { RegistroMensagem } from "../src/api/cliente-http.ts";
import { incluirRegistroComLimite } from "../src/contextos/registros-limite.ts";

function registro(id: number): RegistroMensagem {
  return {
    id,
    horario: "2026-01-01T00:00:00.000Z",
    metodo: "GET",
    url: "http://127.0.0.1:20000/api/v1/x",
    autenticado: false,
    corpoEnviado: null,
    status: 200,
    duracaoMs: 1,
    corpoRecebido: null,
    erro: null,
  };
}

describe("incluirRegistroComLimite", () => {
  it("inclui o registro no final", () => {
    const resultado = incluirRegistroComLimite([registro(1), registro(2)], registro(3), 5);
    expect(resultado.map((item) => item.id)).toEqual([1, 2, 3]);
  });

  it("descarta o mais antigo ao atingir o limite", () => {
    const resultado = incluirRegistroComLimite([registro(1), registro(2), registro(3)], registro(4), 3);
    expect(resultado.map((item) => item.id)).toEqual([2, 3, 4]);
  });

  it("nunca ultrapassa o limite", () => {
    let lista: RegistroMensagem[] = [];
    for (let id = 1; id <= 500; id++) {
      lista = incluirRegistroComLimite(lista, registro(id), 200);
      expect(lista.length).toBeLessThanOrEqual(200);
    }
    expect(lista).toHaveLength(200);
    expect(lista[0]?.id).toBe(301);
    expect(lista[199]?.id).toBe(500);
  });

  it("não altera a lista original e trata limite inválido", () => {
    const original = [registro(1)];
    incluirRegistroComLimite(original, registro(2), 5);
    expect(original).toHaveLength(1);
    expect(incluirRegistroComLimite(original, registro(2), 0)).toEqual([]);
  });
});
