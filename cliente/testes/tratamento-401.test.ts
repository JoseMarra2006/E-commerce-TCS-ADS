import { describe, expect, it } from "vitest";
import type { Operacoes, ResultadoOperacao } from "../src/api/operacoes.ts";
import {
  AVISO_SESSAO_ENCERRADA,
  envolverOperacoesComTratamento401,
} from "../src/contextos/tratamento-401.ts";

const usuario = { id: 1, nome: "Ana Lima", email: "ana@exemplo.com", admin: false };
const produto = { id: 3, nome: "Ingresso", descricao: "", quantidade: 10 };
const dadosProduto = { nome: "Ingresso", descricao: "", quantidade: 10 };

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
    listarUsuarios: () => Promise.resolve(falha ?? { ok: true, dados: [usuario] }),
    listarProdutos: () => Promise.resolve(falha ?? { ok: true, dados: [produto] }),
    lerProduto: () => Promise.resolve(falha ?? { ok: true, dados: produto }),
    criarProduto: () => Promise.resolve(falha ?? { ok: true, dados: produto }),
    atualizarProduto: () => Promise.resolve(falha ?? { ok: true, dados: produto }),
    excluirProduto: () => Promise.resolve(falha ?? { ok: true, dados: true }),
    verificarServidor: () =>
      Promise.resolve(falha ?? { ok: true, dados: { status: 200, duracaoMs: 1 } }),
  };
}

function criarFalha(tipo: Falha["tipo"], status: number | null): Falha {
  return { ok: false, tipo, status, mensagem: "mensagem" };
}

const chamadores: Record<keyof Operacoes, (operacoes: Operacoes) => Promise<unknown>> = {
  cadastrar: (o) => o.cadastrar({ nome: "Ana", email: "a@b.com", senha: "abc123" }),
  entrar: (o) => o.entrar({ email: "a@b.com", senha: "abc123" }),
  lerCadastro: (o) => o.lerCadastro(1, "t"),
  atualizarCadastro: (o) => o.atualizarCadastro(1, "t", { nome: "Novo" }),
  excluirCadastro: (o) => o.excluirCadastro(1, "t"),
  sair: (o) => o.sair("s", "t"),
  listarUsuarios: (o) => o.listarUsuarios("t"),
  listarProdutos: (o) => o.listarProdutos("t"),
  lerProduto: (o) => o.lerProduto(3, "t"),
  criarProduto: (o) => o.criarProduto("t", dadosProduto),
  atualizarProduto: (o) => o.atualizarProduto(3, "t", dadosProduto),
  excluirProduto: (o) => o.excluirProduto(3, "t"),
  verificarServidor: (o) => o.verificarServidor(),
};

const SEM_TRATAMENTO_401: Array<keyof Operacoes> = [
  "cadastrar",
  "entrar",
  "sair",
  "verificarServidor",
];

const AUTENTICADAS = (Object.keys(chamadores) as Array<keyof Operacoes>).filter(
  (nome) => !SEM_TRATAMENTO_401.includes(nome),
);

async function executarAutenticadas(operacoes: Operacoes) {
  const resultados: unknown[] = [];
  for (const nome of AUTENTICADAS) {
    resultados.push(await chamadores[nome](operacoes));
  }
  return resultados;
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
      expect(resultados).toHaveLength(AUTENTICADAS.length);
    }
  });

  it("toda operação autenticada, inclusive usuários do ADM e produtos, trata o 401", async () => {
    expect(AUTENTICADAS).toEqual([
      "lerCadastro",
      "atualizarCadastro",
      "excluirCadastro",
      "listarUsuarios",
      "listarProdutos",
      "lerProduto",
      "criarProduto",
      "atualizarProduto",
      "excluirProduto",
    ]);
    const original = criarFalha("http", 401);
    const base = operacoesCom(original);
    expect(Object.keys(base).sort()).toEqual(Object.keys(chamadores).sort());
    for (const nome of AUTENTICADAS) {
      let chamadas = 0;
      const envolvidas = envolverOperacoesComTratamento401(base, () => {
        chamadas += 1;
      });
      expect(await chamadores[nome](envolvidas)).toEqual(original);
      expect(chamadas, nome).toBe(1);
    }
  });

  it("operações sem tratamento de 401 continuam sem chamar aoNaoAutorizado", async () => {
    const original = criarFalha("http", 401);
    for (const nome of SEM_TRATAMENTO_401) {
      let chamadas = 0;
      const envolvidas = envolverOperacoesComTratamento401(operacoesCom(original), () => {
        chamadas += 1;
      });
      await chamadores[nome](envolvidas);
      expect(chamadas, nome).toBe(0);
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

describe("AVISO_SESSAO_ENCERRADA", () => {
  it("é um aviso com o texto de sessão encerrada", () => {
    expect(AVISO_SESSAO_ENCERRADA).toEqual({
      tipo: "aviso",
      texto: "Sua sessão foi encerrada. Faça login novamente.",
    });
  });
});
