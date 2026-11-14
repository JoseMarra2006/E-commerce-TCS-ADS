import { describe, expect, it } from "vitest";
import { criarClienteHttp } from "../src/api/cliente-http.ts";
import { criarOperacoes } from "../src/api/operacoes.ts";
import type { Operacoes, ResultadoOperacao } from "../src/api/operacoes.ts";
import type { ResultadoEnvio } from "../src/tipos/intermediario.ts";
import type { DadosProduto } from "../src/tipos/protocolo.ts";
import {
  criarIntermediarioFalso,
  respostaJson,
  resultadoErroRede,
  resultadoResposta,
} from "./auxiliares-api.ts";

const conexao = { ip: "10.20.50.123", porta: 20000 };
const alvo = { id: 9, nome: "Bruno Dias", email: "bruno@exemplo.com", admin: false };
const administrador = { id: 1, nome: "Admin", email: "adm@teste.com", admin: true };
const produto = { id: 3, nome: "Ingresso pista", descricao: "Show de sábado", quantidade: 10 };
const dadosProduto: DadosProduto = { nome: "Ingresso pista", descricao: "Show de sábado", quantidade: 10 };
const MENSAGEM_FORA_PROTOCOLO = "Resposta do servidor fora do protocolo.";

function operacoesComResultado(resultado: ResultadoEnvio) {
  const falso = criarIntermediarioFalso(() => respostaJson(resultado));
  const cliente = criarClienteHttp({ obterConexao: () => conexao, buscar: falso.buscar });
  return { operacoes: criarOperacoes(cliente), falso };
}

function operacoesCom(status: number, corpo: string) {
  return operacoesComResultado(resultadoResposta(status, corpo));
}

function ultimoPedido(falso: ReturnType<typeof criarIntermediarioFalso>): unknown {
  return falso.pedidosEnviados().at(-1);
}

type Chamada = (operacoes: Operacoes) => Promise<ResultadoOperacao<unknown>>;

type NomeChamada =
  | "listarUsuarios"
  | "lerCadastroDeOutro"
  | "atualizarCadastroDeOutro"
  | "excluirCadastroDeOutro"
  | "listarProdutos"
  | "lerProduto"
  | "criarProduto"
  | "atualizarProduto"
  | "excluirProduto";

const chamadasNovas: Record<NomeChamada, Chamada> = {
  listarUsuarios: (o) => o.listarUsuarios("jwt"),
  lerCadastroDeOutro: (o) => o.lerCadastro(9, "jwt"),
  atualizarCadastroDeOutro: (o) => o.atualizarCadastro(9, "jwt", { nome: "Bruno Novo" }),
  excluirCadastroDeOutro: (o) => o.excluirCadastro(9, "jwt"),
  listarProdutos: (o) => o.listarProdutos("jwt"),
  lerProduto: (o) => o.lerProduto(3, "jwt"),
  criarProduto: (o) => o.criarProduto("jwt", dadosProduto),
  atualizarProduto: (o) => o.atualizarProduto(3, "jwt", dadosProduto),
  excluirProduto: (o) => o.excluirProduto(3, "jwt"),
};

describe("operações novas: montagem das requisições", () => {
  const esperadas: Array<[NomeChamada, { metodo: string; caminho: string; corpo: string | null }]> = [
    ["listarUsuarios", { metodo: "GET", caminho: "/api/v1/users", corpo: null }],
    ["lerCadastroDeOutro", { metodo: "GET", caminho: "/api/v1/users/9", corpo: null }],
    [
      "atualizarCadastroDeOutro",
      { metodo: "PATCH", caminho: "/api/v1/users/9", corpo: '{"nome":"Bruno Novo"}' },
    ],
    ["excluirCadastroDeOutro", { metodo: "DELETE", caminho: "/api/v1/users/9", corpo: null }],
    ["listarProdutos", { metodo: "GET", caminho: "/api/v1/products", corpo: null }],
    ["lerProduto", { metodo: "GET", caminho: "/api/v1/products/3", corpo: null }],
    [
      "criarProduto",
      {
        metodo: "POST",
        caminho: "/api/v1/products",
        corpo: '{"nome":"Ingresso pista","descricao":"Show de sábado","quantidade":10}',
      },
    ],
    [
      "atualizarProduto",
      {
        metodo: "PUT",
        caminho: "/api/v1/products/3",
        corpo: '{"nome":"Ingresso pista","descricao":"Show de sábado","quantidade":10}',
      },
    ],
    ["excluirProduto", { metodo: "DELETE", caminho: "/api/v1/products/3", corpo: null }],
  ];

  it("cobre todas as operações novas", () => {
    expect(esperadas.map(([nome]) => nome).sort()).toEqual(Object.keys(chamadasNovas).sort());
  });

  for (const [nome, esperado] of esperadas) {
    it(`${nome}: método, caminho, token e corpo`, async () => {
      const { operacoes, falso } = operacoesCom(500, "");
      await chamadasNovas[nome](operacoes);
      expect(ultimoPedido(falso)).toEqual({
        ip: conexao.ip,
        porta: conexao.porta,
        metodo: esperado.metodo,
        caminho: esperado.caminho,
        token: "jwt",
        corpo: esperado.corpo,
      });
    });
  }

  it("a quantidade vai como número JSON e só os três campos do produto são enviados", async () => {
    const comExtras = { ...dadosProduto, id: 77, preco: "9,90" };
    for (const chamar of [
      (o: Operacoes) => o.criarProduto("jwt", comExtras),
      (o: Operacoes) => o.atualizarProduto(3, "jwt", comExtras),
    ]) {
      const { operacoes, falso } = operacoesCom(500, "");
      await chamar(operacoes);
      const pedido = ultimoPedido(falso) as { corpo: string };
      expect(pedido.corpo).toContain('"quantidade":10');
      expect(pedido.corpo).not.toContain('"quantidade":"10"');
      expect(JSON.parse(pedido.corpo)).toEqual(dadosProduto);
    }
  });

  it("descrição vazia e quantidade zero são enviadas como estão", async () => {
    const { operacoes, falso } = operacoesCom(500, "");
    await operacoes.criarProduto("jwt", { nome: "  Nome  ", descricao: "", quantidade: 0 });
    expect((ultimoPedido(falso) as { corpo: string }).corpo).toBe(
      '{"nome":"  Nome  ","descricao":"","quantidade":0}',
    );
  });
});

describe("operações novas: sucesso", () => {
  it("listarUsuarios aceita lista vazia e normaliza admin", async () => {
    expect(await operacoesCom(200, "[]").operacoes.listarUsuarios("jwt")).toEqual({ ok: true, dados: [] });
    const corpo = JSON.stringify([
      administrador,
      { id: 9, nome: "Bruno Dias", email: "bruno@exemplo.com" },
    ]);
    expect(await operacoesCom(200, corpo).operacoes.listarUsuarios("jwt")).toEqual({
      ok: true,
      dados: [administrador, alvo],
    });
  });

  it("listarProdutos aceita lista vazia e preserva a ordem", async () => {
    expect(await operacoesCom(200, "[]").operacoes.listarProdutos("jwt")).toEqual({ ok: true, dados: [] });
    const lista = [{ ...produto, id: 8 }, { ...produto, id: 2, descricao: "" }];
    expect(await operacoesCom(200, JSON.stringify(lista)).operacoes.listarProdutos("jwt")).toEqual({
      ok: true,
      dados: lista,
    });
  });

  it("lerProduto, criarProduto e atualizarProduto devolvem o produto validado", async () => {
    const vazio = { ...produto, descricao: "" };
    expect(await operacoesCom(200, JSON.stringify(vazio)).operacoes.lerProduto(3, "jwt")).toEqual({
      ok: true,
      dados: vazio,
    });
    expect(
      await operacoesCom(201, JSON.stringify(produto)).operacoes.criarProduto("jwt", dadosProduto),
    ).toEqual({ ok: true, dados: produto });
    expect(
      await operacoesCom(200, JSON.stringify(produto)).operacoes.atualizarProduto(3, "jwt", dadosProduto),
    ).toEqual({ ok: true, dados: produto });
  });

  it("excluirProduto aceita 204 sem corpo e 200 com corpo", async () => {
    for (const [status, corpo] of [[204, ""], [200, '{"x":1}']] as Array<[number, string]>) {
      expect(await operacoesCom(status, corpo).operacoes.excluirProduto(3, "jwt")).toEqual({
        ok: true,
        dados: true,
      });
    }
  });

  it("operações por id de usuário funcionam com outro usuário e devolvem o alvo com admin", async () => {
    const comAdmin = { ...alvo, admin: true };
    expect(await operacoesCom(200, JSON.stringify(comAdmin)).operacoes.lerCadastro(9, "jwt")).toEqual({
      ok: true,
      dados: comAdmin,
    });
    const semAdmin = { id: 9, nome: "Bruno Novo", email: "bruno@exemplo.com" };
    expect(
      await operacoesCom(200, JSON.stringify(semAdmin)).operacoes.atualizarCadastro(9, "jwt", {
        nome: "Bruno Novo",
      }),
    ).toEqual({ ok: true, dados: { ...semAdmin, admin: false } });
    expect(await operacoesCom(204, "").operacoes.excluirCadastro(9, "jwt")).toEqual({ ok: true, dados: true });
  });

  it("o Location da resposta de criarProduto não muda o resultado", async () => {
    const semLocation = await operacoesCom(201, JSON.stringify(produto)).operacoes.criarProduto(
      "jwt",
      dadosProduto,
    );
    const comLocation = await operacoesComResultado({
      tipo: "resposta",
      url: "http://10.20.50.123:20000/api/v1/products",
      status: 201,
      cabecalhos: { "content-type": "application/json", location: "/api/v1/products/999" },
      corpo: JSON.stringify(produto),
      duracaoMs: 3,
    }).operacoes.criarProduto("jwt", dadosProduto);
    expect(comLocation).toEqual(semLocation);
    expect(comLocation).toEqual({ ok: true, dados: produto });
  });
});

describe("operações novas: respostas fora do protocolo", () => {
  const casos: Array<[string, Chamada, number, string]> = [
    ["lista de usuários com item inválido", chamadasNovas.listarUsuarios, 200, JSON.stringify([alvo, { id: 0 }])],
    ["lista de usuários que não é array", chamadasNovas.listarUsuarios, 200, JSON.stringify(alvo)],
    [
      "lista de produtos com item inválido",
      chamadasNovas.listarProdutos,
      200,
      JSON.stringify([produto, { ...produto, quantidade: "10" }]),
    ],
    ["produto sem quantidade", chamadasNovas.lerProduto, 200, JSON.stringify({ id: 3, nome: "X", descricao: "" })],
    ["criar com corpo que não é JSON", chamadasNovas.criarProduto, 201, "{nao json"],
    ["atualizar com corpo vazio", chamadasNovas.atualizarProduto, 200, ""],
    ["usuário alvo sem e-mail", chamadasNovas.lerCadastroDeOutro, 200, JSON.stringify({ id: 9, nome: "B" })],
  ];

  for (const [descricao, chamar, status, corpo] of casos) {
    it(descricao, async () => {
      expect(await chamar(operacoesCom(status, corpo).operacoes)).toEqual({
        ok: false,
        tipo: "fora_protocolo",
        status,
        mensagem: MENSAGEM_FORA_PROTOCOLO,
      });
    });
  }
});

describe("operações novas: erros do servidor e de rede", () => {
  const fallbacks: Array<[number, string]> = [
    [400, "Os dados enviados foram recusados pelo servidor."],
    [403, "Você não tem permissão para realizar esta operação."],
    [404, "Recurso não encontrado no servidor."],
    [409, "Os dados informados entram em conflito com um cadastro existente."],
    [500, "Erro interno no servidor."],
  ];

  for (const nome of Object.keys(chamadasNovas) as NomeChamada[]) {
    const chamar = chamadasNovas[nome];
    it(`${nome}: mensagem do servidor preservada e fallback por status`, async () => {
      for (const [status, fallback] of fallbacks) {
        const mensagem = `Mensagem do servidor ${status}.`;
        expect(await chamar(operacoesCom(status, JSON.stringify({ mensagem })).operacoes)).toEqual({
          ok: false,
          tipo: "http",
          status,
          mensagem,
        });
        expect(await chamar(operacoesCom(status, "").operacoes)).toEqual({
          ok: false,
          tipo: "http",
          status,
          mensagem: fallback,
        });
      }
    });

    it(`${nome}: erro de rede e tempo esgotado`, async () => {
      for (const [erro, mensagem] of [
        ["conexao_recusada", "Não foi possível conectar ao servidor. Verifique o IP, a porta e se o servidor está em execução."],
        ["tempo_esgotado", "O servidor não respondeu a tempo. Verifique a conexão e tente novamente."],
      ] as const) {
        const resultado = await chamar(operacoesComResultado(resultadoErroRede(erro)).operacoes);
        expect(resultado).toEqual({ ok: false, tipo: "rede", status: null, mensagem });
      }
    });
  }

  it("mensagens reais do servidor de produtos chegam intactas", async () => {
    expect(
      await operacoesCom(
        403,
        JSON.stringify({ mensagem: "Apenas administradores podem cadastrar produtos." }),
      ).operacoes.criarProduto("jwt", dadosProduto),
    ).toMatchObject({ ok: false, status: 403, mensagem: "Apenas administradores podem cadastrar produtos." });
    expect(
      await operacoesCom(404, JSON.stringify({ mensagem: "Produto não encontrado." })).operacoes.lerProduto(
        3,
        "jwt",
      ),
    ).toMatchObject({ ok: false, status: 404, mensagem: "Produto não encontrado." });
  });
});

describe("operações por id: ids inválidos não geram requisição", () => {
  const idsInvalidos = [
    0,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
    Number("abc"),
  ];
  const porId: Array<[string, (o: Operacoes, id: number) => Promise<ResultadoOperacao<unknown>>]> = [
    ["lerCadastro", (o, id) => o.lerCadastro(id, "jwt")],
    ["atualizarCadastro", (o, id) => o.atualizarCadastro(id, "jwt", { nome: "Novo" })],
    ["excluirCadastro", (o, id) => o.excluirCadastro(id, "jwt")],
    ["lerProduto", (o, id) => o.lerProduto(id, "jwt")],
    ["atualizarProduto", (o, id) => o.atualizarProduto(id, "jwt", dadosProduto)],
    ["excluirProduto", (o, id) => o.excluirProduto(id, "jwt")],
  ];

  for (const [nome, chamar] of porId) {
    it(nome, async () => {
      for (const id of idsInvalidos) {
        const { operacoes, falso } = operacoesCom(200, "{}");
        expect(await chamar(operacoes, id)).toEqual({
          ok: false,
          tipo: "entrada_invalida",
          status: null,
          mensagem: "O identificador informado é inválido.",
        });
        expect(falso.chamadas).toHaveLength(0);
      }
    });
  }

  it("o maior inteiro seguro é aceito e vai como dígitos no caminho", async () => {
    const { operacoes, falso } = operacoesCom(500, "");
    await operacoes.lerProduto(Number.MAX_SAFE_INTEGER, "jwt");
    expect(ultimoPedido(falso)).toMatchObject({ caminho: `/api/v1/products/${Number.MAX_SAFE_INTEGER}` });
  });
});
