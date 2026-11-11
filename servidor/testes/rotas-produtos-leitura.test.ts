import "./auxiliares/vigia-arquivos-reais.ts";
import { assert, assertEquals, assertNotEquals } from "@std/assert";
import { criarAplicacao } from "../src/aplicacao.ts";
import { abrirConexao, fecharConexao } from "../src/banco/conexao.ts";
import type { ConexaoBanco } from "../src/banco/conexao.ts";
import { executarMigracoes } from "../src/banco/migracoes.ts";
import {
  EMAIL_ADM_PADRAO,
  garantirAdmPadrao,
  SENHA_ADM_PADRAO,
} from "../src/modulos/usuarios/adm-padrao.ts";
import {
  criarCaminhoBancoTemporario,
  removerBancoTemporario,
} from "./auxiliares/banco-temporario.ts";
import {
  type CorpoProduto,
  verificarCors,
  verificarRespostaErro,
  verificarRespostaListaProdutos,
  verificarRespostaProduto,
  verificarRespostaSessao,
  verificarRespostaVazia,
} from "./auxiliares/conformidade.ts";
import { SEGREDO_TESTE } from "./auxiliares/segredo-temporario.ts";

type Aplicacao = ReturnType<typeof criarAplicacao>;

const API = "/api/v1";
const PRODUTOS = `${API}/products`;
const MSG_TOKEN_AUSENTE = "Token de acesso ausente. Faça login para continuar.";
const MSG_TOKEN_INVALIDO =
  "Token de acesso inválido ou sessão encerrada. Faça login novamente.";
const MSG_CADASTRO_RESTRITO =
  "Apenas administradores podem cadastrar produtos.";
const MSG_NAO_ENCONTRADO = "Produto não encontrado.";
const MSG_ID = "O id do produto na URL deve ser um número inteiro positivo.";
const MSG_METODO = "Método não permitido nesta rota.";
const ALLOW_PRODUTOS = "GET, HEAD, POST, OPTIONS";
const ALLOW_PRODUTO = "GET, HEAD, OPTIONS";
const IDS_INVALIDOS = ["abc", "0", "-1", "1.5", "12345678901234567890"];
const VALIDO = { nome: "Ingresso VIP", descricao: "Setor A", quantidade: 10 };

interface Conta {
  token: string;
  sessaoId: string;
}

interface Contexto {
  app: Aplicacao;
  conexao: ConexaoBanco;
  adm: Conta;
  ana: Conta;
}

async function enviar(
  app: Aplicacao,
  metodo: string,
  caminho: string,
  opcoes: { token?: string; corpo?: unknown } = {},
): Promise<Response> {
  const cabecalhos: Record<string, string> = {};
  if (opcoes.token !== undefined) {
    cabecalhos["Authorization"] = `Bearer ${opcoes.token}`;
  }
  let corpo: string | undefined;
  if (opcoes.corpo !== undefined) {
    cabecalhos["Content-Type"] = "application/json";
    corpo = typeof opcoes.corpo === "string"
      ? opcoes.corpo
      : JSON.stringify(opcoes.corpo);
  }
  const resposta = await app.request(caminho, {
    method: metodo,
    headers: cabecalhos,
    body: corpo,
  });
  verificarCors(resposta);
  return resposta;
}

async function logar(
  app: Aplicacao,
  email: string,
  senha: string,
): Promise<Conta> {
  const lida = await verificarRespostaSessao(
    await enviar(app, "POST", `${API}/sessions`, { corpo: { email, senha } }),
  );
  return { token: lida.corpo.token, sessaoId: lida.corpo.id };
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
    const adm = await logar(app, EMAIL_ADM_PADRAO, SENHA_ADM_PADRAO);
    const cadastro = await enviar(app, "POST", `${API}/users`, {
      corpo: { nome: "Ana Souza", email: "ana@exemplo.com", senha: "senha123" },
    });
    assertEquals(cadastro.status, 201);
    await cadastro.body?.cancel();
    const ana = await logar(app, "ana@exemplo.com", "senha123");
    await teste({ app, conexao, adm, ana });
  } finally {
    fecharConexao(conexao);
    removerBancoTemporario(caminho);
  }
}

async function criar(
  contexto: Contexto,
  corpo: Record<string, unknown> = VALIDO,
): Promise<CorpoProduto> {
  const lida = await verificarRespostaProduto(
    await enviar(contexto.app, "POST", PRODUTOS, {
      token: contexto.adm.token,
      corpo,
    }),
    201,
  );
  return lida.corpo;
}

function contarProdutos(conexao: ConexaoBanco): number {
  const linha = conexao.prepare("SELECT COUNT(*) AS total FROM produtos;")
    .get() as { total: number };
  return linha.total;
}

function adulterar(token: string): string {
  const [cabecalho, carga, assinatura] = token.split(".");
  const primeiro = assinatura[0] === "A" ? "B" : "A";
  return `${cabecalho}.${carga}.${primeiro}${assinatura.slice(1)}`;
}

Deno.test("401 sem token, com token adulterado e com sessão removida nas três rotas", async () => {
  await comContexto(async (contexto) => {
    const { app, conexao, adm, ana } = contexto;
    const produto = await criar(contexto);
    const rotas: [string, string, unknown][] = [
      ["GET", PRODUTOS, undefined],
      ["GET", `${PRODUTOS}/${produto.id}`, undefined],
      ["GET", `${PRODUTOS}/abc`, undefined],
      ["POST", PRODUTOS, VALIDO],
      ["POST", PRODUTOS, "{"],
    ];
    for (const [metodo, caminho, corpo] of rotas) {
      await verificarRespostaErro(
        await enviar(app, metodo, caminho, { corpo }),
        401,
        MSG_TOKEN_AUSENTE,
      );
      for (const conta of [ana, adm]) {
        await verificarRespostaErro(
          await enviar(app, metodo, caminho, {
            token: adulterar(conta.token),
            corpo,
          }),
          401,
          MSG_TOKEN_INVALIDO,
        );
      }
    }
    conexao.prepare("DELETE FROM sessoes WHERE id IN (?, ?);").run(
      ana.sessaoId,
      adm.sessaoId,
    );
    for (const [metodo, caminho, corpo] of rotas) {
      for (const conta of [ana, adm]) {
        await verificarRespostaErro(
          await enviar(app, metodo, caminho, { token: conta.token, corpo }),
          401,
          MSG_TOKEN_INVALIDO,
        );
      }
    }
    assertEquals(contarProdutos(conexao), 1);
  });
});

Deno.test("GET /products: lista vazia para comum e ADM", async () => {
  await comContexto(async ({ app, adm, ana }) => {
    for (const conta of [ana, adm]) {
      const lida = await verificarRespostaListaProdutos(
        await enviar(app, "GET", PRODUTOS, { token: conta.token }),
      );
      assertEquals(lida.corpo, []);
      assertEquals(lida.texto, "[]");
    }
  });
});

Deno.test("GET /products: reflete criações em ordem de id, para comum e ADM", async () => {
  await comContexto(async (contexto) => {
    const { app, adm, ana } = contexto;
    const criados: CorpoProduto[] = [];
    for (let i = 0; i < 5; i++) {
      criados.push(
        await criar(contexto, {
          nome: `Produto ${i}`,
          descricao: i % 2 === 0 ? "" : `Descrição ${i}`,
          quantidade: i * 10,
        }),
      );
    }
    const ids = criados.map((produto) => produto.id);
    assertEquals(new Set(ids).size, ids.length);
    for (const conta of [ana, adm]) {
      const lida = await verificarRespostaListaProdutos(
        await enviar(app, "GET", PRODUTOS, { token: conta.token }),
      );
      assertEquals(lida.corpo, criados);
    }
    const lista = await verificarRespostaListaProdutos(
      await enviar(app, "GET", `${PRODUTOS}/?pagina=2&nome=x`, {
        token: ana.token,
      }),
    );
    assertEquals(lista.corpo, criados);
  });
});

Deno.test("GET /products/{id}: existente para comum e ADM, inexistente 404", async () => {
  await comContexto(async (contexto) => {
    const { app, adm, ana } = contexto;
    const produto = await criar(contexto, {
      nome: "Café ☕",
      descricao: "Grãos 🇧🇷",
      quantidade: 0,
    });
    for (const conta of [ana, adm]) {
      const lida = await verificarRespostaProduto(
        await enviar(app, "GET", `${PRODUTOS}/${produto.id}`, {
          token: conta.token,
        }),
        200,
      );
      assertEquals(lida.corpo, produto);
      await verificarRespostaProduto(
        await enviar(app, "GET", `${PRODUTOS}/${produto.id}/`, {
          token: conta.token,
        }),
        200,
        produto,
      );
      for (const id of [produto.id + 1, 999999, 9007199254740991]) {
        await verificarRespostaErro(
          await enviar(app, "GET", `${PRODUTOS}/${id}`, { token: conta.token }),
          404,
          MSG_NAO_ENCONTRADO,
        );
      }
    }
  });
});

Deno.test("GET /products/{id}: id inválido dá 400 para comum e ADM, antes do 404", async () => {
  await comContexto(async ({ app, adm, ana }) => {
    for (const conta of [ana, adm]) {
      for (const id of IDS_INVALIDOS) {
        await verificarRespostaErro(
          await enviar(app, "GET", `${PRODUTOS}/${id}`, { token: conta.token }),
          400,
          MSG_ID,
        );
      }
    }
  });
});

Deno.test("POST /products pelo ADM: 201, corpo, Location e leitura pelo Location", async () => {
  await comContexto(async ({ app, adm, ana }) => {
    const resposta = await enviar(app, "POST", PRODUTOS, {
      token: adm.token,
      corpo: VALIDO,
    });
    const location = resposta.headers.get("Location");
    const lida = await verificarRespostaProduto(resposta, 201, VALIDO);
    assertEquals(location, `${PRODUTOS}/${lida.corpo.id}`);
    assert(location !== null);
    for (const conta of [ana, adm]) {
      const leitura = await verificarRespostaProduto(
        await enviar(app, "GET", location, { token: conta.token }),
        200,
      );
      assertEquals(leitura.corpo, lida.corpo);
    }
  });
});

Deno.test("POST /products por comum dá 403 e nada é gravado, mesmo com corpo inválido", async () => {
  await comContexto(async ({ app, conexao, ana }) => {
    for (const corpo of [VALIDO, "{", "[]", { nome: "A" }, ""]) {
      await verificarRespostaErro(
        await enviar(app, "POST", PRODUTOS, { token: ana.token, corpo }),
        403,
        MSG_CADASTRO_RESTRITO,
      );
    }
    assertEquals(contarProdutos(conexao), 0);
  });
});

Deno.test("POST /products pelo ADM com corpo inválido dá 400 com mensagem e não grava", async () => {
  await comContexto(async ({ app, conexao, adm }) => {
    const casos: [unknown, string][] = [
      [
        { ...VALIDO, nome: "A" },
        "O campo nome deve ter entre 2 e 100 caracteres, sem contar espaços no início e no fim.",
      ],
      [
        { ...VALIDO, descricao: "x".repeat(501) },
        "O campo descricao deve ter no máximo 500 caracteres, sem contar espaços no início e no fim.",
      ],
      [
        { ...VALIDO, quantidade: "10" },
        "O campo quantidade deve ser um número inteiro.",
      ],
      [
        { ...VALIDO, quantidade: 1.5 },
        "O campo quantidade deve ser um número inteiro.",
      ],
      [
        { ...VALIDO, quantidade: -1 },
        "O campo quantidade deve estar entre 0 e 1.000.000.",
      ],
      [
        { ...VALIDO, quantidade: 1000001 },
        "O campo quantidade deve estar entre 0 e 1.000.000.",
      ],
      [
        { ...VALIDO, quantidade: null },
        "O campo quantidade não pode ser nulo.",
      ],
      [{ ...VALIDO, nome: null }, "O campo nome não pode ser nulo."],
      [{ descricao: "", quantidade: 1 }, "O campo nome é obrigatório."],
      [{ nome: "Boné", quantidade: 1 }, "O campo descricao é obrigatório."],
      [{ nome: "Boné", descricao: "" }, "O campo quantidade é obrigatório."],
      [{}, "O campo nome é obrigatório."],
      ["{", "O corpo da requisição não é um JSON válido."],
      ["[]", "O corpo da requisição deve ser um objeto JSON."],
      [
        JSON.stringify([VALIDO]),
        "O corpo da requisição deve ser um objeto JSON.",
      ],
      ["", "O corpo da requisição é obrigatório."],
    ];
    for (const [corpo, mensagem] of casos) {
      await verificarRespostaErro(
        await enviar(app, "POST", PRODUTOS, { token: adm.token, corpo }),
        400,
        mensagem,
      );
    }
    await verificarRespostaErro(
      await enviar(app, "POST", PRODUTOS, { token: adm.token }),
      400,
      "O corpo da requisição é obrigatório.",
    );
    assertEquals(contarProdutos(conexao), 0);
  });
});

Deno.test("POST /products ignora campos extras, grava valores aparados e aceita limites", async () => {
  await comContexto(async (contexto) => {
    const { app, conexao, adm } = contexto;
    const extras = await criar(contexto, {
      id: 999,
      admin: true,
      papel: "administrador",
      criado_em: "2000-01-01",
      nome: "  Mochila  ",
      descricao: "   ",
      quantidade: 0,
    });
    assertNotEquals(extras.id, 999);
    assertEquals(extras, {
      id: extras.id,
      nome: "Mochila",
      descricao: "",
      quantidade: 0,
    });
    const linha = conexao
      .prepare("SELECT nome, descricao, quantidade FROM produtos WHERE id = ?;")
      .get(extras.id) as Record<string, unknown>;
    assertEquals({ ...linha }, {
      nome: "Mochila",
      descricao: "",
      quantidade: 0,
    });

    const maximo = await criar(contexto, {
      nome: "x".repeat(100),
      descricao: "y".repeat(500),
      quantidade: 1000000,
    });
    assertEquals(maximo.quantidade, 1000000);
    assertEquals(maximo.nome.length, 100);

    const decimalInteiro = await verificarRespostaProduto(
      await enviar(app, "POST", PRODUTOS, {
        token: adm.token,
        corpo: '{"nome":"Boné","descricao":"","quantidade":1e3}',
      }),
      201,
      { quantidade: 1000 },
    );
    assert(decimalInteiro.corpo.id > maximo.id);
  });
});

Deno.test("POST /products permite nomes repetidos, gerando ids distintos e nunca 409", async () => {
  await comContexto(async (contexto) => {
    const primeiro = await criar(contexto);
    const segundo = await criar(contexto);
    assertNotEquals(primeiro.id, segundo.id);
    assert(segundo.id > primeiro.id);
    assertEquals({ ...primeiro, id: 0 }, { ...segundo, id: 0 });
    const lida = await verificarRespostaListaProdutos(
      await enviar(contexto.app, "GET", PRODUTOS, {
        token: contexto.ana.token,
      }),
    );
    assertEquals(lida.corpo, [primeiro, segundo]);
  });
});

Deno.test("405 em /products para PUT, PATCH e DELETE, com e sem token e barra final", async () => {
  await comContexto(async ({ app, adm, ana }) => {
    for (const metodo of ["PUT", "PATCH", "DELETE"]) {
      for (const token of [undefined, ana.token, adm.token]) {
        for (const caminho of [PRODUTOS, `${PRODUTOS}/`]) {
          const resposta = await enviar(app, metodo, caminho, {
            token,
            corpo: metodo === "DELETE" ? undefined : VALIDO,
          });
          assertEquals(resposta.headers.get("Allow"), ALLOW_PRODUTOS);
          await verificarRespostaErro(resposta, 405, MSG_METODO);
        }
      }
    }
  });
});

Deno.test("405 em POST /products/{id}, com e sem token", async () => {
  await comContexto(async (contexto) => {
    const produto = await criar(contexto);
    for (const token of [undefined, contexto.ana.token, contexto.adm.token]) {
      for (const id of [String(produto.id), "999999", "abc"]) {
        const resposta = await enviar(
          contexto.app,
          "POST",
          `${PRODUTOS}/${id}`,
          { token, corpo: VALIDO },
        );
        assertEquals(resposta.headers.get("Allow"), ALLOW_PRODUTO);
        await verificarRespostaErro(resposta, 405, MSG_METODO);
      }
    }
  });
});

Deno.test("OPTIONS em /products e /products/{id} dá 204 sem corpo e sem token", async () => {
  await comContexto(async ({ app }) => {
    for (
      const caminho of [
        PRODUTOS,
        `${PRODUTOS}/`,
        `${PRODUTOS}/1`,
        `${PRODUTOS}/abc`,
      ]
    ) {
      await verificarRespostaVazia(await enviar(app, "OPTIONS", caminho));
    }
  });
});

Deno.test("HEAD /products: autenticado recebe 200 sem corpo, sem token 401", async () => {
  await comContexto(async ({ app, ana }) => {
    const ok = await enviar(app, "HEAD", PRODUTOS, { token: ana.token });
    assertEquals(ok.status, 200);
    assertEquals(await ok.text(), "");
    const semToken = await enviar(app, "HEAD", PRODUTOS);
    assertEquals(semToken.status, 401);
    await semToken.body?.cancel();
  });
});

Deno.test("caminhos vizinhos de /products continuam 404", async () => {
  await comContexto(async ({ app, ana }) => {
    for (
      const caminho of [
        `${PRODUTOS}/1/extra`,
        `${API}/produtos`,
        `${API}/product`,
      ]
    ) {
      await verificarRespostaErro(
        await enviar(app, "GET", caminho, { token: ana.token }),
        404,
        "Rota não encontrada.",
      );
    }
  });
});
