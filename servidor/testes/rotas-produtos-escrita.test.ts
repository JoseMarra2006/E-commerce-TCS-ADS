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
type MetodoEscrita = "PUT" | "PATCH" | "DELETE";

const API = "/api/v1";
const PRODUTOS = `${API}/products`;
const METODOS: MetodoEscrita[] = ["PUT", "PATCH", "DELETE"];
const ID_INEXISTENTE = 999999;
const IDS_INVALIDOS = ["abc", "0", "-1", "1.5", "12345678901234567890"];
const MSG_TOKEN_AUSENTE = "Token de acesso ausente. Faça login para continuar.";
const MSG_TOKEN_INVALIDO =
  "Token de acesso inválido ou sessão encerrada. Faça login novamente.";
const MSG_ID = "O id do produto na URL deve ser um número inteiro positivo.";
const MSG_ALTERACAO = "Apenas administradores podem alterar produtos.";
const MSG_EXCLUSAO = "Apenas administradores podem excluir produtos.";
const MSG_NAO_ENCONTRADO = "Produto não encontrado.";
const MSG_METODO = "Método não permitido nesta rota.";
const MSG_NENHUM_CAMPO =
  "Informe ao menos um dos campos: nome, descricao ou quantidade.";
const ALLOW_PRODUTO = "GET, HEAD, PUT, PATCH, DELETE, OPTIONS";
const ORIGINAL = { nome: "Ingresso VIP", descricao: "Setor A", quantidade: 10 };
const NOVO = { nome: "Ingresso Pista", descricao: "Setor B", quantidade: 20 };

interface Conta {
  token: string;
  sessaoId: string;
}

interface Contexto {
  app: Aplicacao;
  conexao: ConexaoBanco;
  adm: Conta;
  ana: Conta;
  alvo: CorpoProduto;
  outro: CorpoProduto;
}

function mensagemRestrita(metodo: MetodoEscrita): string {
  return metodo === "DELETE" ? MSG_EXCLUSAO : MSG_ALTERACAO;
}

function corpoValido(metodo: MetodoEscrita): unknown {
  if (metodo === "PUT") {
    return NOVO;
  }
  if (metodo === "PATCH") {
    return { quantidade: 5 };
  }
  return undefined;
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

async function criarPeloAdm(
  app: Aplicacao,
  token: string,
  corpo: Record<string, unknown>,
): Promise<CorpoProduto> {
  return (await verificarRespostaProduto(
    await enviar(app, "POST", PRODUTOS, { token, corpo }),
    201,
  )).corpo;
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
    const alvo = await criarPeloAdm(app, adm.token, ORIGINAL);
    const outro = await criarPeloAdm(app, adm.token, {
      nome: "Outro Produto",
      descricao: "Intacto",
      quantidade: 3,
    });
    await teste({ app, conexao, adm, ana, alvo, outro });
  } finally {
    fecharConexao(conexao);
    removerBancoTemporario(caminho);
  }
}

function lerLinha(
  conexao: ConexaoBanco,
  id: number,
): Record<string, unknown> | undefined {
  const linha = conexao
    .prepare(
      "SELECT id, nome, descricao, quantidade, criado_em, atualizado_em FROM produtos WHERE id = ?;",
    )
    .get(id);
  return linha === undefined ? undefined : { ...linha };
}

function adulterar(token: string): string {
  const [cabecalho, carga, assinatura] = token.split(".");
  const primeiro = assinatura[0] === "A" ? "B" : "A";
  return `${cabecalho}.${carga}.${primeiro}${assinatura.slice(1)}`;
}

function caminhoProduto(id: number | string): string {
  return `${PRODUTOS}/${id}`;
}

Deno.test("401 vem antes do 400 do id e do corpo nos três métodos", async () => {
  await comContexto(async ({ app, conexao, adm, ana, alvo }) => {
    const antes = lerLinha(conexao, alvo.id);
    for (const metodo of METODOS) {
      for (const id of [String(alvo.id), "abc"]) {
        for (const corpo of [corpoValido(metodo), "{"]) {
          await verificarRespostaErro(
            await enviar(app, metodo, caminhoProduto(id), { corpo }),
            401,
            MSG_TOKEN_AUSENTE,
          );
          for (const conta of [ana, adm]) {
            await verificarRespostaErro(
              await enviar(app, metodo, caminhoProduto(id), {
                token: adulterar(conta.token),
                corpo,
              }),
              401,
              MSG_TOKEN_INVALIDO,
            );
          }
        }
      }
    }
    conexao.prepare("DELETE FROM sessoes WHERE id IN (?, ?);").run(
      ana.sessaoId,
      adm.sessaoId,
    );
    for (const metodo of METODOS) {
      for (const conta of [ana, adm]) {
        await verificarRespostaErro(
          await enviar(app, metodo, caminhoProduto(alvo.id), {
            token: conta.token,
            corpo: corpoValido(metodo),
          }),
          401,
          MSG_TOKEN_INVALIDO,
        );
      }
    }
    assertEquals(lerLinha(conexao, alvo.id), antes);
  });
});

Deno.test("id inválido dá 400 para comum e ADM, antes do 403", async () => {
  await comContexto(async ({ app, adm, ana }) => {
    for (const metodo of METODOS) {
      for (const conta of [ana, adm]) {
        for (const id of IDS_INVALIDOS) {
          for (const corpo of [corpoValido(metodo), "{"]) {
            await verificarRespostaErro(
              await enviar(app, metodo, caminhoProduto(id), {
                token: conta.token,
                corpo,
              }),
              400,
              MSG_ID,
            );
          }
        }
      }
    }
  });
});

Deno.test("comum recebe 403 em produto existente ou inexistente, mesmo com corpo inválido, e nada muda", async () => {
  await comContexto(async ({ app, conexao, ana, alvo, outro }) => {
    const antesAlvo = lerLinha(conexao, alvo.id);
    const antesOutro = lerLinha(conexao, outro.id);
    for (const metodo of METODOS) {
      for (const id of [alvo.id, ID_INEXISTENTE]) {
        for (const corpo of [corpoValido(metodo), "{", "[]", { nome: "A" }]) {
          await verificarRespostaErro(
            await enviar(app, metodo, caminhoProduto(id), {
              token: ana.token,
              corpo,
            }),
            403,
            mensagemRestrita(metodo),
          );
        }
      }
    }
    assertEquals(lerLinha(conexao, alvo.id), antesAlvo);
    assertEquals(lerLinha(conexao, outro.id), antesOutro);
    const leitura = await verificarRespostaProduto(
      await enviar(app, "GET", caminhoProduto(alvo.id), { token: ana.token }),
      200,
    );
    assertEquals(leitura.corpo, alvo);
  });
});

Deno.test("ADM em id inexistente recebe 404 nos três métodos, mesmo com corpo inválido", async () => {
  await comContexto(async ({ app, adm }) => {
    for (const metodo of METODOS) {
      for (const corpo of [corpoValido(metodo), "{", "[]", "", { nome: "A" }]) {
        await verificarRespostaErro(
          await enviar(app, metodo, caminhoProduto(ID_INEXISTENTE), {
            token: adm.token,
            corpo,
          }),
          404,
          MSG_NAO_ENCONTRADO,
        );
      }
    }
  });
});

Deno.test("PUT pelo ADM atualiza os três campos aparados e só o produto alvo", async () => {
  await comContexto(async ({ app, conexao, adm, alvo, outro }) => {
    const antesAlvo = lerLinha(conexao, alvo.id);
    const antesOutro = lerLinha(conexao, outro.id);
    const lida = await verificarRespostaProduto(
      await enviar(app, "PUT", caminhoProduto(alvo.id), {
        token: adm.token,
        corpo: { nome: "  Ingresso Pista  ", descricao: "   ", quantidade: 0 },
      }),
      200,
    );
    assertEquals(lida.corpo, {
      id: alvo.id,
      nome: "Ingresso Pista",
      descricao: "",
      quantidade: 0,
    });
    const depois = lerLinha(conexao, alvo.id);
    assertEquals(depois?.nome, "Ingresso Pista");
    assertEquals(depois?.descricao, "");
    assertEquals(depois?.quantidade, 0);
    assertEquals(depois?.criado_em, antesAlvo?.criado_em);
    assert(String(depois?.atualizado_em) >= String(antesAlvo?.atualizado_em));
    assertEquals(lerLinha(conexao, outro.id), antesOutro);
    const leitura = await verificarRespostaProduto(
      await enviar(app, "GET", caminhoProduto(alvo.id), { token: adm.token }),
      200,
    );
    assertEquals(leitura.corpo, lida.corpo);
  });
});

Deno.test("PATCH pelo ADM altera só os campos enviados e preserva os demais", async () => {
  await comContexto(async ({ app, conexao, adm, alvo, outro }) => {
    const antesOutro = lerLinha(conexao, outro.id);
    const passos: [Record<string, unknown>, CorpoProduto][] = [
      [{ nome: " Nome Novo " }, { ...alvo, nome: "Nome Novo" }],
      [{ descricao: "Descrição nova" }, {
        ...alvo,
        nome: "Nome Novo",
        descricao: "Descrição nova",
      }],
      [{ quantidade: 0 }, {
        ...alvo,
        nome: "Nome Novo",
        descricao: "Descrição nova",
        quantidade: 0,
      }],
      [{ descricao: "" }, {
        ...alvo,
        nome: "Nome Novo",
        descricao: "",
        quantidade: 0,
      }],
      [{ nome: "Combinado", quantidade: 1000000 }, {
        ...alvo,
        nome: "Combinado",
        descricao: "",
        quantidade: 1000000,
      }],
    ];
    for (const [corpo, esperado] of passos) {
      const lida = await verificarRespostaProduto(
        await enviar(app, "PATCH", caminhoProduto(alvo.id), {
          token: adm.token,
          corpo,
        }),
        200,
      );
      assertEquals(lida.corpo, esperado, JSON.stringify(corpo));
      const linha = lerLinha(conexao, alvo.id);
      assertEquals(
        {
          nome: linha?.nome,
          descricao: linha?.descricao,
          quantidade: linha?.quantidade,
        },
        {
          nome: esperado.nome,
          descricao: esperado.descricao,
          quantidade: esperado.quantidade,
        },
      );
    }
    assertEquals(lerLinha(conexao, outro.id), antesOutro);
  });
});

Deno.test("DELETE pelo ADM dá 204 sem corpo, GET posterior 404 e outro produto intacto", async () => {
  await comContexto(async ({ app, conexao, adm, ana, alvo, outro }) => {
    await verificarRespostaVazia(
      await enviar(app, "DELETE", caminhoProduto(alvo.id), {
        token: adm.token,
      }),
    );
    assertEquals(lerLinha(conexao, alvo.id), undefined);
    for (const conta of [ana, adm]) {
      await verificarRespostaErro(
        await enviar(app, "GET", caminhoProduto(alvo.id), {
          token: conta.token,
        }),
        404,
        MSG_NAO_ENCONTRADO,
      );
    }
    for (const metodo of METODOS) {
      await verificarRespostaErro(
        await enviar(app, metodo, caminhoProduto(alvo.id), {
          token: adm.token,
          corpo: corpoValido(metodo),
        }),
        404,
        MSG_NAO_ENCONTRADO,
      );
    }
    const lista = await verificarRespostaListaProdutos(
      await enviar(app, "GET", PRODUTOS, { token: ana.token }),
    );
    assertEquals(lista.corpo, [outro]);
  });
});

Deno.test("ADM com corpo inválido em produto existente recebe 400 com a mensagem e nada muda", async () => {
  await comContexto(async ({ app, conexao, adm, alvo }) => {
    const antes = lerLinha(conexao, alvo.id);
    const casosPut: [unknown, string][] = [
      [{ nome: "Boné", quantidade: 1 }, "O campo descricao é obrigatório."],
      [
        { ...NOVO, quantidade: "10" },
        "O campo quantidade deve ser um número inteiro.",
      ],
      [
        { ...NOVO, quantidade: 1.5 },
        "O campo quantidade deve ser um número inteiro.",
      ],
      [
        { ...NOVO, quantidade: -1 },
        "O campo quantidade deve estar entre 0 e 1.000.000.",
      ],
      [
        { ...NOVO, quantidade: 1000001 },
        "O campo quantidade deve estar entre 0 e 1.000.000.",
      ],
      [{ ...NOVO, quantidade: null }, "O campo quantidade não pode ser nulo."],
      [
        { ...NOVO, nome: "A" },
        "O campo nome deve ter entre 2 e 100 caracteres, sem contar espaços no início e no fim.",
      ],
      [{ quantidade: 1 }, "O campo nome é obrigatório."],
    ];
    const casosPatch: [unknown, string][] = [
      [{}, MSG_NENHUM_CAMPO],
      [{ admin: true }, MSG_NENHUM_CAMPO],
      [{ papel: "administrador" }, MSG_NENHUM_CAMPO],
      [{ id: 5, criado_em: "x" }, MSG_NENHUM_CAMPO],
      [{ nome: null }, "O campo nome não pode ser nulo."],
      [{ descricao: null }, "O campo descricao não pode ser nulo."],
      [{ quantidade: null }, "O campo quantidade não pode ser nulo."],
      [{ quantidade: "10" }, "O campo quantidade deve ser um número inteiro."],
    ];
    const casosComuns: [unknown, string][] = [
      ["{", "O corpo da requisição não é um JSON válido."],
      ["[]", "O corpo da requisição deve ser um objeto JSON."],
      ["", "O corpo da requisição é obrigatório."],
      [undefined, "O corpo da requisição é obrigatório."],
    ];
    for (const [corpo, mensagem] of [...casosPut, ...casosComuns]) {
      await verificarRespostaErro(
        await enviar(app, "PUT", caminhoProduto(alvo.id), {
          token: adm.token,
          corpo,
        }),
        400,
        mensagem,
      );
    }
    for (const [corpo, mensagem] of [...casosPatch, ...casosComuns]) {
      await verificarRespostaErro(
        await enviar(app, "PATCH", caminhoProduto(alvo.id), {
          token: adm.token,
          corpo,
        }),
        400,
        mensagem,
      );
    }
    assertEquals(lerLinha(conexao, alvo.id), antes);
  });
});

Deno.test("campos extras são ignorados e o id do produto nunca muda", async () => {
  await comContexto(async ({ app, conexao, adm, alvo, outro }) => {
    const extras = {
      id: outro.id,
      admin: true,
      papel: "administrador",
      criado_em: "2000-01-01T00:00:00.000Z",
    };
    const antes = lerLinha(conexao, alvo.id);
    const put = await verificarRespostaProduto(
      await enviar(app, "PUT", caminhoProduto(alvo.id), {
        token: adm.token,
        corpo: { ...extras, ...NOVO },
      }),
      200,
    );
    assertEquals(put.corpo, { id: alvo.id, ...NOVO });
    const patch = await verificarRespostaProduto(
      await enviar(app, "PATCH", caminhoProduto(alvo.id), {
        token: adm.token,
        corpo: { ...extras, quantidade: 7 },
      }),
      200,
    );
    assertEquals(patch.corpo, { id: alvo.id, ...NOVO, quantidade: 7 });
    assertEquals(lerLinha(conexao, alvo.id)?.criado_em, antes?.criado_em);
    assertEquals(
      (await verificarRespostaProduto(
        await enviar(app, "GET", caminhoProduto(outro.id), {
          token: adm.token,
        }),
        200,
      )).corpo,
      outro,
    );
  });
});

Deno.test("PUT e PATCH com nome repetido de outro produto não dão 409", async () => {
  await comContexto(async ({ app, adm, alvo, outro }) => {
    await verificarRespostaProduto(
      await enviar(app, "PUT", caminhoProduto(alvo.id), {
        token: adm.token,
        corpo: { nome: outro.nome, descricao: outro.descricao, quantidade: 1 },
      }),
      200,
      { id: alvo.id, nome: outro.nome },
    );
    await verificarRespostaProduto(
      await enviar(app, "PATCH", caminhoProduto(outro.id), {
        token: adm.token,
        corpo: { nome: outro.nome },
      }),
      200,
      { id: outro.id, nome: outro.nome },
    );
  });
});

Deno.test("ids de produtos excluídos nunca são reutilizados", async () => {
  await comContexto(async ({ app, adm, alvo, outro }) => {
    for (const produto of [outro, alvo]) {
      await verificarRespostaVazia(
        await enviar(app, "DELETE", caminhoProduto(produto.id), {
          token: adm.token,
        }),
      );
    }
    const novo = await criarPeloAdm(app, adm.token, ORIGINAL);
    assert(novo.id > outro.id);
    assertNotEquals(novo.id, alvo.id);
  });
});

Deno.test("405 só em POST /products/{id}, com o Allow completo; OPTIONS 204", async () => {
  await comContexto(async ({ app, adm, ana, alvo }) => {
    for (const token of [undefined, ana.token, adm.token]) {
      for (const id of [String(alvo.id), "abc", String(ID_INEXISTENTE)]) {
        for (const caminho of [caminhoProduto(id), `${caminhoProduto(id)}/`]) {
          const resposta = await enviar(app, "POST", caminho, {
            token,
            corpo: NOVO,
          });
          assertEquals(resposta.headers.get("Allow"), ALLOW_PRODUTO);
          await verificarRespostaErro(resposta, 405, MSG_METODO);
        }
      }
    }
    for (const id of [String(alvo.id), "abc"]) {
      await verificarRespostaVazia(
        await enviar(app, "OPTIONS", caminhoProduto(id)),
      );
    }
  });
});

Deno.test("escritas aceitam barra final e o PUT/PATCH sem Content-Type", async () => {
  await comContexto(async ({ app, adm, alvo }) => {
    await verificarRespostaProduto(
      await enviar(app, "PATCH", `${caminhoProduto(alvo.id)}/`, {
        token: adm.token,
        corpo: { quantidade: 3 },
      }),
      200,
      { quantidade: 3 },
    );
    const semTipo = await app.request(caminhoProduto(alvo.id), {
      method: "PUT",
      headers: { Authorization: `Bearer ${adm.token}` },
      body: JSON.stringify(NOVO),
    });
    await verificarRespostaProduto(semTipo, 200, { id: alvo.id, ...NOVO });
    await verificarRespostaVazia(
      await enviar(app, "DELETE", `${caminhoProduto(alvo.id)}/`, {
        token: adm.token,
      }),
    );
  });
});
