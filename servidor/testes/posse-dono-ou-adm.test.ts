import "./auxiliares/vigia-arquivos-reais.ts";
import { assert, assertEquals, assertNotEquals } from "@std/assert";
import { criarAplicacao } from "../src/aplicacao.ts";
import { abrirConexao, fecharConexao } from "../src/banco/conexao.ts";
import type { ConexaoBanco } from "../src/banco/conexao.ts";
import { executarMigracoes } from "../src/banco/migracoes.ts";
import {
  EMAIL_ADM_PADRAO,
  garantirAdmPadrao,
  NOME_ADM_PADRAO,
  SENHA_ADM_PADRAO,
} from "../src/modulos/usuarios/adm-padrao.ts";
import {
  criarCaminhoBancoTemporario,
  removerBancoTemporario,
} from "./auxiliares/banco-temporario.ts";
import { SEGREDO_TESTE } from "./auxiliares/segredo-temporario.ts";
import {
  iniciarServidorDeTeste,
  requisitar,
} from "./auxiliares/servidor-teste.ts";

type Aplicacao = ReturnType<typeof criarAplicacao>;
type Metodo = "GET" | "PUT" | "PATCH" | "DELETE";

const METODOS: Metodo[] = ["GET", "PUT", "PATCH", "DELETE"];
const CHAVES_USUARIO = ["id", "nome", "email", "admin"];
const ID_INEXISTENTE = 999999;
const IDS_INVALIDOS = ["abc", "0", "-1", "1.5", "99999999999999999999"];
const MSG_TOKEN_AUSENTE = "Token de acesso ausente. Faça login para continuar.";
const MSG_TOKEN_INVALIDO =
  "Token de acesso inválido ou sessão encerrada. Faça login novamente.";
const MSG_ID_INVALIDO =
  "O id do usuário na URL deve ser um número inteiro positivo.";
const MSG_POSSE =
  "Você não tem permissão para acessar os dados de outro usuário.";
const MSG_NAO_ENCONTRADO = "Usuário não encontrado.";
const MSG_EMAIL_EM_USO = "Este e-mail já está sendo usado por outro usuário.";
const MSG_NENHUM_CAMPO =
  "Informe ao menos um dos campos: nome, email ou senha.";
const MSG_SESSAO = "Você não tem permissão para encerrar esta sessão.";

interface Conta {
  id: number;
  email: string;
  senha: string;
  token: string;
  sessaoId: string;
}

interface Cenario {
  adm: Conta;
  ana: Conta;
  bruno: Conta;
}

interface RespostaLida {
  status: number;
  corpo: unknown;
}

interface LinhaUsuario {
  id: number;
  nome: string;
  email: string;
  senha_hash: string;
  papel: string;
  atualizado_em: string;
}

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

async function comCenario(
  teste: (app: Aplicacao, conexao: ConexaoBanco, cenario: Cenario) => Promise<
    void
  >,
): Promise<void> {
  const caminho = criarCaminhoBancoTemporario();
  const conexao = abrirConexao(caminho);
  try {
    executarMigracoes(conexao);
    await garantirAdmPadrao(conexao, () => {});
    const app = criarAplicacao({ conexao, segredoJwt: SEGREDO_TESTE });
    const adm = await logar(app, EMAIL_ADM_PADRAO, SENHA_ADM_PADRAO);
    const ana = await criarConta(app, "Ana Souza", "ana@exemplo.com");
    const bruno = await criarConta(app, "Bruno Lima", "bruno@exemplo.com");
    await teste(app, conexao, { adm, ana, bruno });
  } finally {
    fecharConexao(conexao);
    removerBancoTemporario(caminho);
  }
}

async function enviar(
  app: Aplicacao,
  metodo: string,
  caminho: string,
  opcoes: { token?: string; corpo?: unknown } = {},
): Promise<RespostaLida> {
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
  assertEquals(resposta.headers.get("Access-Control-Allow-Origin"), "*");
  const texto = await resposta.text();
  const minusculo = texto.toLowerCase();
  assertEquals(minusculo.includes("papel"), false, "resposta contém papel");
  assertEquals(
    /"[^"]*senha[^"]*"\s*:/.test(minusculo),
    false,
    "resposta contém chave com senha",
  );
  return {
    status: resposta.status,
    corpo: texto === "" ? null : JSON.parse(texto),
  };
}

async function logar(
  app: Aplicacao,
  email: string,
  senha: string,
): Promise<Conta> {
  const resposta = await enviar(app, "POST", "/api/v1/sessions", {
    corpo: { email, senha },
  });
  assertEquals(resposta.status, 201);
  assert(ehObjeto(resposta.corpo));
  const { id, token, usuario } = resposta.corpo;
  assert(typeof id === "string" && typeof token === "string");
  assert(ehObjeto(usuario) && typeof usuario.id === "number");
  return { id: usuario.id, email, senha, token, sessaoId: id };
}

async function criarConta(
  app: Aplicacao,
  nome: string,
  email: string,
): Promise<Conta> {
  const resposta = await enviar(app, "POST", "/api/v1/users", {
    corpo: { nome, email, senha: "senha123" },
  });
  assertEquals(resposta.status, 201);
  return await logar(app, email, "senha123");
}

function caminho(id: number | string): string {
  return `/api/v1/users/${id}`;
}

function corpoValido(metodo: Metodo, alvo: Conta): unknown {
  if (metodo === "PUT") {
    return { nome: "Nome Alterado", email: alvo.email, senha: "senha999" };
  }
  if (metodo === "PATCH") {
    return { nome: "Nome Alterado" };
  }
  return undefined;
}

function conferirErro(
  resposta: RespostaLida,
  status: number,
  mensagem: string,
): void {
  assertEquals(resposta.status, status);
  assertEquals(resposta.corpo, { mensagem });
}

function conferirUsuario(
  resposta: RespostaLida,
  esperado: { id: number; nome?: string; email?: string; admin: boolean },
): void {
  assertEquals(resposta.status, 200);
  assert(ehObjeto(resposta.corpo));
  assertEquals(Object.keys(resposta.corpo), CHAVES_USUARIO);
  assertEquals(resposta.corpo.id, esperado.id);
  assertEquals(resposta.corpo.admin, esperado.admin);
  if (esperado.nome !== undefined) {
    assertEquals(resposta.corpo.nome, esperado.nome);
  }
  if (esperado.email !== undefined) {
    assertEquals(resposta.corpo.email, esperado.email);
  }
}

function lerLinha(conexao: ConexaoBanco, id: number): LinhaUsuario | null {
  const linha = conexao
    .prepare(
      "SELECT id, nome, email, senha_hash, papel, atualizado_em FROM usuarios WHERE id = ?;",
    )
    .get(id) as LinhaUsuario | undefined;
  return linha === undefined ? null : { ...linha };
}

function contarSessoes(conexao: ConexaoBanco, idUsuario: number): number {
  const linha = conexao
    .prepare("SELECT COUNT(*) AS total FROM sessoes WHERE usuario_id = ?;")
    .get(idUsuario) as { total: number };
  return linha.total;
}

function adulterar(token: string): string {
  const [cabecalho, carga, assinatura] = token.split(".");
  const primeiro = assinatura[0] === "A" ? "B" : "A";
  return `${cabecalho}.${carga}.${primeiro}${assinatura.slice(1)}`;
}

Deno.test("sem token, token adulterado ou sessão removida: 401 nos quatro métodos", async () => {
  await comCenario(async (app, conexao, { adm, ana }) => {
    for (const metodo of METODOS) {
      conferirErro(
        await enviar(app, metodo, caminho(ana.id), {
          corpo: corpoValido(metodo, ana),
        }),
        401,
        MSG_TOKEN_AUSENTE,
      );
      for (const conta of [ana, adm]) {
        conferirErro(
          await enviar(app, metodo, caminho(conta.id), {
            token: adulterar(conta.token),
            corpo: corpoValido(metodo, conta),
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
    for (const metodo of METODOS) {
      for (const conta of [ana, adm]) {
        conferirErro(
          await enviar(app, metodo, caminho(conta.id), {
            token: conta.token,
            corpo: corpoValido(metodo, conta),
          }),
          401,
          MSG_TOKEN_INVALIDO,
        );
      }
    }
    assert(lerLinha(conexao, ana.id) !== null);
    assert(lerLinha(conexao, adm.id) !== null);
  });
});

Deno.test("401 vem antes do 400 do id", async () => {
  await comCenario(async (app) => {
    for (const metodo of METODOS) {
      conferirErro(
        await enviar(app, metodo, caminho("abc")),
        401,
        MSG_TOKEN_AUSENTE,
      );
    }
  });
});

Deno.test("id inválido dá 400 para comum e para ADM nos quatro métodos", async () => {
  await comCenario(async (app, _conexao, { adm, ana }) => {
    for (const metodo of METODOS) {
      for (const conta of [ana, adm]) {
        for (const id of IDS_INVALIDOS) {
          conferirErro(
            await enviar(app, metodo, caminho(id), {
              token: conta.token,
              corpo: corpoValido(metodo, conta),
            }),
            400,
            MSG_ID_INVALIDO,
          );
        }
      }
    }
  });
});

Deno.test("comum no próprio id: GET, PUT e PATCH dão 200 e DELETE dá 204", async () => {
  await comCenario(async (app, conexao, { ana }) => {
    conferirUsuario(
      await enviar(app, "GET", caminho(ana.id), { token: ana.token }),
      { id: ana.id, nome: "Ana Souza", email: ana.email, admin: false },
    );
    conferirUsuario(
      await enviar(app, "PUT", caminho(ana.id), {
        token: ana.token,
        corpo: corpoValido("PUT", ana),
      }),
      { id: ana.id, nome: "Nome Alterado", email: ana.email, admin: false },
    );
    conferirUsuario(
      await enviar(app, "PATCH", caminho(ana.id), {
        token: ana.token,
        corpo: { nome: "Ana Patch" },
      }),
      { id: ana.id, nome: "Ana Patch", admin: false },
    );
    assertEquals(lerLinha(conexao, ana.id)?.nome, "Ana Patch");
    const exclusao = await enviar(app, "DELETE", caminho(ana.id), {
      token: ana.token,
    });
    assertEquals(exclusao.status, 204);
    assertEquals(exclusao.corpo, null);
    assertEquals(lerLinha(conexao, ana.id), null);
  });
});

Deno.test("comum em id alheio existente dá 403 e o alvo não muda", async () => {
  await comCenario(async (app, conexao, { adm, ana, bruno }) => {
    const antesBruno = lerLinha(conexao, bruno.id);
    const antesAdm = lerLinha(conexao, adm.id);
    for (const alvo of [bruno, adm]) {
      for (const metodo of METODOS) {
        conferirErro(
          await enviar(app, metodo, caminho(alvo.id), {
            token: ana.token,
            corpo: corpoValido(metodo, alvo),
          }),
          403,
          MSG_POSSE,
        );
      }
    }
    assertEquals(lerLinha(conexao, bruno.id), antesBruno);
    assertEquals(lerLinha(conexao, adm.id), antesAdm);
    assertEquals(contarSessoes(conexao, bruno.id), 1);
  });
});

Deno.test("comum em id inexistente dá 403, nunca 404", async () => {
  await comCenario(async (app, _conexao, { ana }) => {
    for (const metodo of METODOS) {
      conferirErro(
        await enviar(app, metodo, caminho(ID_INEXISTENTE), {
          token: ana.token,
          corpo: corpoValido(metodo, ana),
        }),
        403,
        MSG_POSSE,
      );
    }
  });
});

Deno.test("ADM lê outro usuário e recebe os dados do alvo", async () => {
  await comCenario(async (app, _conexao, { adm, bruno }) => {
    conferirUsuario(
      await enviar(app, "GET", caminho(bruno.id), { token: adm.token }),
      { id: bruno.id, nome: "Bruno Lima", email: bruno.email, admin: false },
    );
  });
});

Deno.test("ADM faz PUT em outro usuário e só o alvo muda", async () => {
  await comCenario(async (app, conexao, { adm, ana, bruno }) => {
    const antesAna = lerLinha(conexao, ana.id);
    const antesAdm = lerLinha(conexao, adm.id);
    const antesBruno = lerLinha(conexao, bruno.id);
    conferirUsuario(
      await enviar(app, "PUT", caminho(bruno.id), {
        token: adm.token,
        corpo: {
          nome: "Bruno Novo",
          email: "bruno.novo@exemplo.com",
          senha: "senha999",
        },
      }),
      {
        id: bruno.id,
        nome: "Bruno Novo",
        email: "bruno.novo@exemplo.com",
        admin: false,
      },
    );
    const depoisBruno = lerLinha(conexao, bruno.id);
    assertEquals(depoisBruno?.nome, "Bruno Novo");
    assertEquals(depoisBruno?.email, "bruno.novo@exemplo.com");
    assertEquals(depoisBruno?.papel, "comum");
    assertNotEquals(depoisBruno?.senha_hash, antesBruno?.senha_hash);
    assertEquals(lerLinha(conexao, ana.id), antesAna);
    assertEquals(lerLinha(conexao, adm.id), antesAdm);
    assertEquals(
      (await enviar(app, "POST", "/api/v1/sessions", {
        corpo: { email: "bruno.novo@exemplo.com", senha: "senha999" },
      })).status,
      201,
    );
  });
});

Deno.test("ADM faz PATCH em outro usuário e só o alvo muda", async () => {
  await comCenario(async (app, conexao, { adm, ana, bruno }) => {
    const antesAna = lerLinha(conexao, ana.id);
    const antesAdm = lerLinha(conexao, adm.id);
    conferirUsuario(
      await enviar(app, "PATCH", caminho(bruno.id), {
        token: adm.token,
        corpo: { nome: "Bruno Patch" },
      }),
      { id: bruno.id, nome: "Bruno Patch", email: bruno.email, admin: false },
    );
    assertEquals(lerLinha(conexao, bruno.id)?.nome, "Bruno Patch");
    assertEquals(lerLinha(conexao, ana.id), antesAna);
    assertEquals(lerLinha(conexao, adm.id), antesAdm);
  });
});

Deno.test("ADM exclui usuário logado: 204, sessões apagadas e token do excluído dá 401", async () => {
  await comCenario(async (app, conexao, { adm, ana, bruno }) => {
    assertEquals(contarSessoes(conexao, bruno.id), 1);
    const exclusao = await enviar(app, "DELETE", caminho(bruno.id), {
      token: adm.token,
    });
    assertEquals(exclusao.status, 204);
    assertEquals(exclusao.corpo, null);
    assertEquals(lerLinha(conexao, bruno.id), null);
    assertEquals(contarSessoes(conexao, bruno.id), 0);
    assert(lerLinha(conexao, ana.id) !== null);
    conferirErro(
      await enviar(app, "GET", caminho(bruno.id), { token: bruno.token }),
      401,
      MSG_TOKEN_INVALIDO,
    );
    conferirErro(
      await enviar(app, "GET", caminho(bruno.id), { token: adm.token }),
      404,
      MSG_NAO_ENCONTRADO,
    );
  });
});

Deno.test("ADM em id inexistente dá 404 nos quatro métodos", async () => {
  await comCenario(async (app, _conexao, { adm }) => {
    for (const metodo of METODOS) {
      conferirErro(
        await enviar(app, metodo, caminho(ID_INEXISTENTE), {
          token: adm.token,
          corpo: corpoValido(metodo, adm),
        }),
        404,
        MSG_NAO_ENCONTRADO,
      );
    }
  });
});

Deno.test("ADM em si mesmo: GET, PUT e PATCH dão 200 com admin true", async () => {
  await comCenario(async (app, conexao, { adm }) => {
    conferirUsuario(
      await enviar(app, "GET", caminho(adm.id), { token: adm.token }),
      {
        id: adm.id,
        nome: NOME_ADM_PADRAO,
        email: EMAIL_ADM_PADRAO,
        admin: true,
      },
    );
    conferirUsuario(
      await enviar(app, "PUT", caminho(adm.id), {
        token: adm.token,
        corpo: {
          nome: "Admin Put",
          email: EMAIL_ADM_PADRAO,
          senha: SENHA_ADM_PADRAO,
        },
      }),
      { id: adm.id, nome: "Admin Put", admin: true },
    );
    conferirUsuario(
      await enviar(app, "PATCH", caminho(adm.id), {
        token: adm.token,
        corpo: { nome: NOME_ADM_PADRAO },
      }),
      { id: adm.id, nome: NOME_ADM_PADRAO, admin: true },
    );
    assertEquals(lerLinha(conexao, adm.id)?.papel, "administrador");
  });
});

Deno.test("ADM excluindo a si mesmo: 204, token passa a dar 401 e o ADM padrão some", async () => {
  await comCenario(async (app, conexao, { adm }) => {
    const exclusao = await enviar(app, "DELETE", caminho(adm.id), {
      token: adm.token,
    });
    assertEquals(exclusao.status, 204);
    assertEquals(exclusao.corpo, null);
    conferirErro(
      await enviar(app, "GET", caminho(adm.id), { token: adm.token }),
      401,
      MSG_TOKEN_INVALIDO,
    );
    const linha = conexao
      .prepare("SELECT id FROM usuarios WHERE email = ?;")
      .get(EMAIL_ADM_PADRAO);
    assertEquals(linha, undefined);
    assertEquals(contarSessoes(conexao, adm.id), 0);
  });
});

Deno.test("ADM editando outro usuário para e-mail de terceiro ou do próprio ADM dá 409", async () => {
  await comCenario(async (app, conexao, { adm, ana, bruno }) => {
    const antesBruno = lerLinha(conexao, bruno.id);
    for (
      const email of ["ANA@exemplo.com", EMAIL_ADM_PADRAO, "Adm@Teste.com"]
    ) {
      conferirErro(
        await enviar(app, "PUT", caminho(bruno.id), {
          token: adm.token,
          corpo: { nome: "Bruno Lima", email, senha: "senha123" },
        }),
        409,
        MSG_EMAIL_EM_USO,
      );
      conferirErro(
        await enviar(app, "PATCH", caminho(bruno.id), {
          token: adm.token,
          corpo: { email },
        }),
        409,
        MSG_EMAIL_EM_USO,
      );
    }
    assertEquals(lerLinha(conexao, bruno.id), antesBruno);
    assertEquals(lerLinha(conexao, ana.id)?.email, ana.email);
  });
});

Deno.test("ADM editando outro usuário para o próprio e-mail do alvo não conflita", async () => {
  await comCenario(async (app, conexao, { adm, bruno }) => {
    conferirUsuario(
      await enviar(app, "PUT", caminho(bruno.id), {
        token: adm.token,
        corpo: {
          nome: "Bruno Lima",
          email: "BRUNO@exemplo.com",
          senha: "senha123",
        },
      }),
      { id: bruno.id, email: "BRUNO@exemplo.com", admin: false },
    );
    conferirUsuario(
      await enviar(app, "PATCH", caminho(bruno.id), {
        token: adm.token,
        corpo: { email: bruno.email },
      }),
      { id: bruno.id, email: bruno.email, admin: false },
    );
    assertEquals(lerLinha(conexao, bruno.id)?.email, bruno.email);
  });
});

Deno.test("ordem: 404 e 403 vêm antes do 400 do corpo; ADM em existente com corpo inválido dá 400", async () => {
  await comCenario(async (app, conexao, { adm, ana, bruno }) => {
    const antesBruno = lerLinha(conexao, bruno.id);
    const corposInvalidos = ["{", "[]", JSON.stringify({ nome: 123 })];
    for (const metodo of ["PUT", "PATCH"] as const) {
      for (const corpo of corposInvalidos) {
        conferirErro(
          await enviar(app, metodo, caminho(ID_INEXISTENTE), {
            token: adm.token,
            corpo,
          }),
          404,
          MSG_NAO_ENCONTRADO,
        );
        conferirErro(
          await enviar(app, metodo, caminho(bruno.id), {
            token: ana.token,
            corpo,
          }),
          403,
          MSG_POSSE,
        );
        conferirErro(
          await enviar(app, metodo, caminho("abc"), {
            token: adm.token,
            corpo,
          }),
          400,
          MSG_ID_INVALIDO,
        );
        const resposta = await enviar(app, metodo, caminho(bruno.id), {
          token: adm.token,
          corpo,
        });
        assertEquals(resposta.status, 400);
        assert(ehObjeto(resposta.corpo));
        assertEquals(Object.keys(resposta.corpo), ["mensagem"]);
        assertEquals(typeof resposta.corpo.mensagem, "string");
      }
      conferirErro(
        await enviar(app, metodo, caminho(ID_INEXISTENTE), {
          token: adm.token,
          corpo: { email: ana.email },
        }),
        404,
        MSG_NAO_ENCONTRADO,
      );
    }
    assertEquals(lerLinha(conexao, bruno.id), antesBruno);
  });
});

Deno.test("ADM não promove ninguém: admin e papel no corpo são ignorados", async () => {
  await comCenario(async (app, conexao, { adm, bruno }) => {
    conferirUsuario(
      await enviar(app, "PUT", caminho(bruno.id), {
        token: adm.token,
        corpo: {
          admin: true,
          papel: "administrador",
          nome: "Bruno Lima",
          email: bruno.email,
          senha: "senha123",
        },
      }),
      { id: bruno.id, admin: false },
    );
    conferirUsuario(
      await enviar(app, "PATCH", caminho(bruno.id), {
        token: adm.token,
        corpo: { admin: true, papel: "administrador", nome: "Bruno Novo" },
      }),
      { id: bruno.id, nome: "Bruno Novo", admin: false },
    );
    for (
      const corpo of [
        { admin: true },
        { papel: "administrador" },
        { admin: true, papel: "administrador" },
      ]
    ) {
      conferirErro(
        await enviar(app, "PATCH", caminho(bruno.id), {
          token: adm.token,
          corpo,
        }),
        400,
        MSG_NENHUM_CAMPO,
      );
    }
    assertEquals(lerLinha(conexao, bruno.id)?.papel, "comum");
    conferirUsuario(
      await enviar(app, "GET", caminho(bruno.id), { token: bruno.token }),
      { id: bruno.id, admin: false },
    );
  });
});

Deno.test("ADM trocando o próprio e-mail continua com o token válido", async () => {
  await comCenario(async (app, conexao, { adm, bruno }) => {
    conferirUsuario(
      await enviar(app, "PATCH", caminho(adm.id), {
        token: adm.token,
        corpo: { email: "chefe@exemplo.com" },
      }),
      { id: adm.id, email: "chefe@exemplo.com", admin: true },
    );
    conferirUsuario(
      await enviar(app, "GET", caminho(adm.id), { token: adm.token }),
      { id: adm.id, email: "chefe@exemplo.com", admin: true },
    );
    conferirUsuario(
      await enviar(app, "GET", caminho(bruno.id), { token: adm.token }),
      { id: bruno.id, admin: false },
    );
    assertEquals(contarSessoes(conexao, adm.id), 1);
    assertEquals(lerLinha(conexao, adm.id)?.papel, "administrador");
  });
});

Deno.test("ADM não encerra sessão de outro usuário: DELETE /sessions/{id} continua 403", async () => {
  await comCenario(async (app, conexao, { adm, bruno }) => {
    conferirErro(
      await enviar(app, "DELETE", `/api/v1/sessions/${bruno.sessaoId}`, {
        token: adm.token,
      }),
      403,
      MSG_SESSAO,
    );
    assertEquals(contarSessoes(conexao, bruno.id), 1);
    conferirUsuario(
      await enviar(app, "GET", caminho(bruno.id), { token: bruno.token }),
      { id: bruno.id, admin: false },
    );
  });
});

Deno.test("concorrência: ADM exclui usuário enquanto ele faz PATCH e GET, sem nenhum 500", async () => {
  const servidor = await iniciarServidorDeTeste();
  try {
    const api = "/api/v1";
    const loginAdm = await requisitar(servidor, "POST", `${api}/sessions`, {
      corpo: { email: EMAIL_ADM_PADRAO, senha: SENHA_ADM_PADRAO },
    });
    assertEquals(loginAdm.status, 201);
    const tokenAdm = (await loginAdm.json()).token;
    const permitidos = new Set([200, 204, 401, 404]);

    for (let rodada = 0; rodada < 6; rodada++) {
      const email = `alvo${rodada}@exemplo.com`;
      const cadastro = await requisitar(servidor, "POST", `${api}/users`, {
        corpo: { nome: "Alvo Teste", email, senha: "senha123" },
      });
      assertEquals(cadastro.status, 201);
      const id = (await cadastro.json()).id;
      const login = await requisitar(servidor, "POST", `${api}/sessions`, {
        corpo: { email, senha: "senha123" },
      });
      assertEquals(login.status, 201);
      const token = (await login.json()).token;

      const respostas = await Promise.all([
        requisitar(servidor, "PATCH", `${api}/users/${id}`, {
          token,
          corpo: { nome: `Nome ${rodada}` },
        }),
        requisitar(servidor, "GET", `${api}/users/${id}`, { token }),
        requisitar(servidor, "DELETE", `${api}/users/${id}`, {
          token: tokenAdm,
        }),
        requisitar(servidor, "PATCH", `${api}/users/${id}`, {
          token,
          corpo: { email: `outro${rodada}@exemplo.com` },
        }),
        requisitar(servidor, "GET", `${api}/users/${id}`, { token }),
      ]);
      const status: number[] = [];
      for (const resposta of respostas) {
        status.push(resposta.status);
        await resposta.body?.cancel();
      }
      assertEquals(status[2], 204, `rodada ${rodada}: ${status}`);
      for (const valor of status) {
        assert(permitidos.has(valor), `rodada ${rodada}: ${status}`);
      }
      const depois = await requisitar(servidor, "GET", `${api}/users/${id}`, {
        token: tokenAdm,
      });
      assertEquals(depois.status, 404);
      await depois.body?.cancel();
    }

    const respostas500 = servidor.registros.filter(
      (registro) => registro.tipo === "requisicao" && registro.status === 500,
    );
    assertEquals(respostas500.length, 0);
    const erros = servidor.registros.filter(
      (registro) => registro.tipo === "sistema" && registro.nivel === "erro",
    );
    assertEquals(erros, []);
  } finally {
    await servidor.encerrar();
  }
});
