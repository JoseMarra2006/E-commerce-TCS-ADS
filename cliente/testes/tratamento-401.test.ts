import { describe, expect, it } from "vitest";
import type { Operacoes, ResultadoOperacao } from "../src/api/operacoes.ts";
import { envolverOperacoesComTratamento401 } from "../src/contextos/tratamento-401.ts";

const usuario = { id: 1, nome: "Ana Lima", email: "ana@exemplo.com" };

type Falha = Extract<ResultadoOperacao<true>, { ok: false }>;

function operacoesCom(falha: Falha | null): Operacoes {
  return {
    cadastrar: () => Promise.resolve(falha ?? { ok: true, dados: usuario }),
    entrar: () =>
      Promise.resolve(falha ?? { ok: true, dados: { id: "s", token: "t", usuario } }),
    lerCadastro: () => Promise.resolve(falha ?? { ok: true, dados: usuario }),
    atualizarCadastro: () => Promise.resolve(falha ?? { ok: true, dados: usuario }),
    excluirCadastro: () => Promise.resolve(falha ?? { ok: true, dados: true }),
    sair: () => Promise.resolve(falha ?? { ok: true, dados: true }),
    verificarServidor: () =>
      Promise.resolve(falha ?? { ok: true, dados: { status: 200, duracaoMs: 1 } }),
  };
}

function criarFalha(tipo: Falha["tipo"], status: number | null): Falha {
  return { ok: false, tipo, status, mensagem: "mensagem" };
}

async function executarAutenticadas(operacoes: Operacoes) {
  return [
    await operacoes.lerCadastro(1, "t"),
    await operacoes.atualizarCadastro(1, "t", { nome: "Novo" }),
    await operacoes.excluirCadastro(1, "t"),
  ];
}

describe("envolverOperacoesComTratamento401", () => {
  it("401 nas operações autenticadas chama aoNaoAutorizado e repassa o resultado", async () => {
    const original = criarFalha("http", 401);
    let chamadas = 0;
    const envolvidas = envolverOperacoesComTratamento401(operacoesCom(original), () => {
      chamadas += 1;
    });

    const lerCadastro = await envolvidas.lerCadastro(1, "t");
    expect(chamadas).toBe(1);
    expect(lerCadastro).toEqual(original);

    const atualizar = await envolvidas.atualizarCadastro(1, "t", { nome: "Novo" });
    expect(chamadas).toBe(2);
    expect(atualizar).toEqual(original);

    const excluir = await envolvidas.excluirCadastro(1, "t");
    expect(chamadas).toBe(3);
    expect(excluir).toEqual(original);
  });

  it("outros status, erros de rede e sucesso não chamam aoNaoAutorizado", async () => {
    const casos: Array<Falha | null> = [
      criarFalha("http", 403),
      criarFalha("http", 404),
      criarFalha("http", 500),
      criarFalha("rede", null),
      criarFalha("intermediario", null),
      criarFalha("conexao", null),
      null,
    ];
    for (const caso of casos) {
      let chamadas = 0;
      const envolvidas = envolverOperacoesComTratamento401(operacoesCom(caso), () => {
        chamadas += 1;
      });
      const resultados = await executarAutenticadas(envolvidas);
      expect(chamadas).toBe(0);
      expect(resultados).toHaveLength(3);
    }
  });

  it("cadastrar, entrar, sair e verificarServidor não são afetados por 401", async () => {
    let chamadas = 0;
    const original = criarFalha("http", 401);
    const envolvidas = envolverOperacoesComTratamento401(operacoesCom(original), () => {
      chamadas += 1;
    });

    expect(await envolvidas.cadastrar({ nome: "Ana", email: "a@b.com", senha: "abc123" })).toEqual(
      original,
    );
    expect(await envolvidas.entrar({ email: "a@b.com", senha: "abc123" })).toEqual(original);
    expect(await envolvidas.sair("s", "t")).toEqual(original);
    expect(await envolvidas.verificarServidor()).toEqual(original);
    expect(chamadas).toBe(0);
  });
});
