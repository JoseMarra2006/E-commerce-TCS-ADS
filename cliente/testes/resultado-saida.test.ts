import { describe, expect, it } from "vitest";
import type { ResultadoOperacao } from "../src/api/operacoes.ts";
import { decidirAvisoSaida } from "../src/paginas/resultado-saida.ts";

type Falha = Extract<ResultadoOperacao<true>, { ok: false }>;

function falha(tipo: Falha["tipo"], status: number | null, mensagem: string): Falha {
  return { ok: false, tipo, status, mensagem };
}

const INFO = { tipo: "info", texto: "Você saiu da sua conta." };

describe("decidirAvisoSaida", () => {
  it("sucesso devolve informação", () => {
    expect(decidirAvisoSaida({ ok: true, dados: true })).toEqual(INFO);
  });

  it("401 significa que a sessão já não existia e devolve informação", () => {
    expect(decidirAvisoSaida(falha("http", 401, "Não autorizado."))).toEqual(INFO);
  });

  it("403 e 500 devolvem aviso com a mensagem", () => {
    expect(decidirAvisoSaida(falha("http", 403, "Sem permissão."))).toEqual({
      tipo: "aviso",
      texto:
        "Você saiu da sua conta neste cliente, mas o servidor não confirmou o encerramento da sessão: Sem permissão.",
    });
    expect(decidirAvisoSaida(falha("http", 500, "Erro interno."))).toEqual({
      tipo: "aviso",
      texto:
        "Você saiu da sua conta neste cliente, mas o servidor não confirmou o encerramento da sessão: Erro interno.",
    });
  });

  it("falha de rede e do intermediário devolvem aviso", () => {
    const rede = decidirAvisoSaida(falha("rede", null, "Falha de rede."));
    expect(rede.tipo).toBe("aviso");
    expect(rede.texto).toContain("Falha de rede.");
    const intermediario = decidirAvisoSaida(falha("intermediario", null, "Intermediário parado."));
    expect(intermediario.tipo).toBe("aviso");
    expect(intermediario.texto).toContain("Intermediário parado.");
  });
});
