import "./auxiliares/vigia-arquivos-reais.ts";
import { assert, assertEquals } from "@std/assert";
import { criarAplicacao } from "../src/aplicacao.ts";
import { abrirConexao, fecharConexao } from "../src/banco/conexao.ts";
import type { ConexaoBanco } from "../src/banco/conexao.ts";
import { executarMigracoes } from "../src/banco/migracoes.ts";
import {
  EMAIL_ADM_PADRAO,
  garantirAdmPadrao,
  SENHA_ADM_PADRAO,
} from "../src/modulos/usuarios/adm-padrao.ts";
import { MENSAGEM_ERRO_INTERNO } from "../src/utilitarios/respostas-erro.ts";
import {
  criarCaminhoBancoTemporario,
  removerBancoTemporario,
} from "./auxiliares/banco-temporario.ts";
import {
  verificarCors,
  verificarRespostaErro,
  verificarRespostaListaProdutos,
  verificarRespostaProduto,
  verificarRespostaSessao,
  verificarRespostaVazia,
} from "./auxiliares/conformidade.ts";
import { SEGREDO_TESTE } from "./auxiliares/segredo-temporario.ts";

type Aplicacao = ReturnType<typeof criarAplicacao>;

interface Operacao {
  metodo: string;
  comId: boolean;
  comCorpo: boolean;
  previstos: number[];
}

interface Contexto {
  app: Aplicacao;
  conexao: ConexaoBanco;
  tokenAdm: string;
  tokenComum: string;
}

const API = "/api/v1";
const PRODUTOS = `${API}/products`;
const VALIDO = { nome: "Ingresso", descricao: "Pista", quantidade: 5 };

const OPERACOES: Operacao[] = [
  { metodo: "GET", comId: false, comCorpo: false, previstos: [200, 401, 500] },
  {
    metodo: "POST",
    comId: false,
    comCorpo: true,
    previstos: [201, 400, 401, 403, 500],
  },
  {
    metodo: "GET",
    comId: true,
    comCorpo: false,
    previstos: [200, 400, 401, 404, 500],
  },
  {
    metodo: "PUT",
    comId: true,
    comCorpo: true,
    previstos: [200, 400, 401, 403, 404, 500],
  },
  {
    metodo: "PATCH",
    comId: true,
    comCorpo: true,
    previstos: [200, 400, 401, 403, 404, 500],
  },
  {
    metodo: "DELETE",
    comId: true,
    comCorpo: false,
    previstos: [204, 400, 401, 403, 404, 500],
  },
];

const CORPOS: (string | undefined)[] = [
  undefined,
  "",
  "{",
  "[]",
  "null",
  "{}",
  JSON.stringify(VALIDO),
  JSON.stringify({ quantidade: 3 }),
  JSON.stringify({ ...VALIDO, nome: "A" }),
  JSON.stringify({ ...VALIDO, nome: null }),
  JSON.stringify({ ...VALIDO, quantidade: "10" }),
  JSON.stringify({ ...VALIDO, quantidade: 1.5 }),
  JSON.stringify({ ...VALIDO, quantidade: -1 }),
  JSON.stringify({ ...VALIDO, quantidade: 1000001 }),
  JSON.stringify({ ...VALIDO, descricao: "x".repeat(501) }),
  JSON.stringify({ admin: true, papel: "administrador" }),
  JSON.stringify({ ...VALIDO, nome: "Ingresso", id: 1 }),
];

async function enviar(
  app: Aplicacao,
  metodo: string,
  caminho: string,
  token?: string,
  corpo?: string,
): Promise<Response> {
  const cabecalhos: Record<string, string> = {};
  if (token !== undefined) {
    cabecalhos["Authorization"] = token;
  }
  if (corpo !== undefined) {
    cabecalhos["Content-Type"] = "application/json";
  }
  return await app.request(caminho, {
    method: metodo,
    headers: cabecalhos,
    body: corpo,
  });
}

async function logar(
  app: Aplicacao,
  email: string,
  senha: string,
): Promise<string> {
  const lida = await verificarRespostaSessao(
    await enviar(
      app,
      "POST",
      `${API}/sessions`,
      undefined,
      JSON.stringify({ email, senha }),
    ),
  );
  return lida.corpo.token;
}

async function comContexto(
  teste: (contexto: Contexto) => Promise<void>,
): Promise<void> {
  const caminho = criarCaminhoBancoTemporario();
  const conexao = abrirConexao(caminho);
  try {
    executarMigracoes(conexao);
    await garantirAdmPadrao(conexao, () => {});
    const app = criarAplicacao({ conexao, segredoJwt: SEGREDO_TESTE });
    const tokenAdm = await logar(app, EMAIL_ADM_PADRAO, SENHA_ADM_PADRAO);
    const cadastro = await enviar(
      app,
      "POST",
      `${API}/users`,
      undefined,
      JSON.stringify({
        nome: "Ana Souza",
        email: "ana@exemplo.com",
        senha: "senha123",
      }),
    );
    assertEquals(cadastro.status, 201);
    await cadastro.body?.cancel();
    const tokenComum = await logar(app, "ana@exemplo.com", "senha123");
    await teste({ app, conexao, tokenAdm, tokenComum });
  } finally {
    fecharConexao(conexao);
    removerBancoTemporario(caminho);
  }
}

async function criarProdutoAdm(
  app: Aplicacao,
  tokenAdm: string,
): Promise<number> {
  const lida = await verificarRespostaProduto(
    await enviar(
      app,
      "POST",
      PRODUTOS,
      `Bearer ${tokenAdm}`,
      JSON.stringify(VALIDO),
    ),
    201,
  );
  return lida.corpo.id;
}

async function conferirResposta(
  resposta: Response,
  operacao: Operacao,
): Promise<number> {
  const descricao = `${operacao.metodo} ${
    operacao.comId ? "/products/{id}" : "/products"
  } -> ${resposta.status}`;
  verificarCors(resposta);
  assert(operacao.previstos.includes(resposta.status), descricao);
  assert(resposta.status !== 500, descricao);
  if (resposta.status === 204) {
    await verificarRespostaVazia(resposta);
  } else if (resposta.status === 200 && !operacao.comId) {
    await verificarRespostaListaProdutos(resposta);
  } else if (resposta.status === 200 || resposta.status === 201) {
    await verificarRespostaProduto(resposta, resposta.status);
  } else {
    await verificarRespostaErro(resposta, resposta.status);
  }
  return resposta.status;
}

Deno.test("nenhuma rota de produtos produz status fora do YAML, nem 409 ou 422", async () => {
  await comContexto(async ({ app, tokenAdm, tokenComum }) => {
    const tokens = [
      undefined,
      "Bearer",
      "Bearer token.invalido.x",
      `Bearer ${tokenComum}`,
      `Bearer ${tokenAdm}`,
    ];
    const vistos = new Map<string, Set<number>>();
    for (const operacao of OPERACOES) {
      const chave = `${operacao.metodo} ${operacao.comId}`;
      vistos.set(chave, new Set());
      for (const token of tokens) {
        const ids = operacao.comId
          ? ["existente", "999999", "abc", "0"]
          : [undefined];
        for (const id of ids) {
          for (const corpo of operacao.comCorpo ? CORPOS : [undefined]) {
            let caminho = PRODUTOS;
            if (id !== undefined) {
              const alvo = id === "existente"
                ? String(await criarProdutoAdm(app, tokenAdm))
                : id;
              caminho = `${PRODUTOS}/${alvo}`;
            }
            const status = await conferirResposta(
              await enviar(app, operacao.metodo, caminho, token, corpo),
              operacao,
            );
            vistos.get(chave)?.add(status);
          }
        }
      }
    }
    for (const operacao of OPERACOES) {
      const status = vistos.get(`${operacao.metodo} ${operacao.comId}`);
      assertEquals(
        [...(status ?? [])].sort(),
        operacao.previstos.filter((s) => s !== 500).sort(),
        `${operacao.metodo} comId=${operacao.comId}`,
      );
    }
  });
});

Deno.test("falha inesperada do banco dá 500 com ErroResponse e CORS em todas as rotas de produtos", async () => {
  await comContexto(async ({ app, conexao, tokenAdm }) => {
    const id = await criarProdutoAdm(app, tokenAdm);
    conexao.exec("DROP TABLE produtos;");
    const casos: [string, string, string | undefined][] = [
      ["GET", PRODUTOS, undefined],
      ["POST", PRODUTOS, JSON.stringify(VALIDO)],
      ["GET", `${PRODUTOS}/${id}`, undefined],
      ["PUT", `${PRODUTOS}/${id}`, JSON.stringify(VALIDO)],
      ["PUT", `${PRODUTOS}/${id}`, "{"],
      ["PATCH", `${PRODUTOS}/${id}`, JSON.stringify({ quantidade: 1 })],
      ["PATCH", `${PRODUTOS}/${id}`, "{}"],
      ["DELETE", `${PRODUTOS}/${id}`, undefined],
    ];
    for (const [metodo, caminho, corpo] of casos) {
      await verificarRespostaErro(
        await enviar(app, metodo, caminho, `Bearer ${tokenAdm}`, corpo),
        500,
        MENSAGEM_ERRO_INTERNO,
      );
    }
  });
});

Deno.test("quantidade 1.0, 1e3 e -0 chegam como inteiros em POST, PUT e PATCH; -0 vira 0", async () => {
  await comContexto(async ({ app, conexao, tokenAdm }) => {
    const autorizacao = `Bearer ${tokenAdm}`;
    const criado = await verificarRespostaProduto(
      await enviar(
        app,
        "POST",
        PRODUTOS,
        autorizacao,
        '{"nome":"Boné","descricao":"","quantidade":-0}',
      ),
      201,
      { quantidade: 0 },
    );
    assert(!criado.texto.includes("-0"));
    const caminho = `${PRODUTOS}/${criado.corpo.id}`;
    await verificarRespostaProduto(
      await enviar(
        app,
        "PUT",
        caminho,
        autorizacao,
        '{"nome":"Boné","descricao":"","quantidade":1.0}',
      ),
      200,
      { quantidade: 1 },
    );
    await verificarRespostaProduto(
      await enviar(app, "PATCH", caminho, autorizacao, '{"quantidade":1e3}'),
      200,
      { quantidade: 1000 },
    );
    const patchZero = await verificarRespostaProduto(
      await enviar(app, "PATCH", caminho, autorizacao, '{"quantidade":-0}'),
      200,
      { quantidade: 0 },
    );
    assert(!patchZero.texto.includes("-0"));
    const linha = conexao
      .prepare("SELECT typeof(quantidade) AS tipo, quantidade FROM produtos;")
      .get() as Record<string, unknown>;
    assertEquals({ ...linha }, { tipo: "integer", quantidade: 0 });
  });
});
