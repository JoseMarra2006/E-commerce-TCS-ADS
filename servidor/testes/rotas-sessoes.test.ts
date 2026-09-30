import "./auxiliares/vigia-arquivos-reais.ts";
import { assert, assertEquals, assertNotEquals } from "@std/assert";
import { criarAplicacao } from "../src/aplicacao.ts";
import { abrirConexao, fecharConexao } from "../src/banco/conexao.ts";
import type { ConexaoBanco } from "../src/banco/conexao.ts";
import { executarMigracoes } from "../src/banco/migracoes.ts";
import {
  criarCaminhoBancoTemporario,
  removerBancoTemporario,
} from "./auxiliares/banco-temporario.ts";
import { SEGREDO_TESTE } from "./auxiliares/segredo-temporario.ts";

type Aplicacao = ReturnType<typeof criarAplicacao>;

const JSON_CT = "application/json; charset=utf-8";
const MSG_CREDENCIAIS = "E-mail ou senha inválidos.";
const MSG_TOKEN_AUSENTE = "Token de acesso ausente. Faça login para continuar.";
const MSG_TOKEN_MAL_FORMATADO =
  "Token de acesso mal formatado. Use o formato: Authorization: Bearer <token>.";
const MSG_TOKEN_INVALIDO =
  "Token de acesso inválido ou sessão encerrada. Faça login novamente.";
const MSG_POSSE_SESSAO = "Você não tem permissão para encerrar esta sessão.";
const MSG_METODO = "Método não permitido nesta rota.";
const PADRAO_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function conferirCors(headers: Headers) {
  assertEquals(headers.get("Access-Control-Allow-Origin"), "*");
  assertEquals(
    headers.get("Access-Control-Allow-Methods"),
    "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  );
  assertEquals(
    headers.get("Access-Control-Allow-Headers"),
    "Content-Type, Authorization",
  );
}

async function comApp(
  teste: (app: Aplicacao, conexao: ConexaoBanco) => Promise<void>,
): Promise<void> {
  const caminho = criarCaminhoBancoTemporario();
  const conexao = abrirConexao(caminho);
  try {
    executarMigracoes(conexao);
    const app = criarAplicacao({ conexao, segredoJwt: SEGREDO_TESTE });
    await teste(app, conexao);
  } finally {
    fecharConexao(conexao);
    removerBancoTemporario(caminho);
  }
}

async function cadastrar(
  app: Aplicacao,
  nome: string,
  email: string,
  senha = "senha123",
): Promise<{ id: number; nome: string; email: string }> {
  const resposta = await app.request("/api/v1/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nome, email, senha }),
  });
  assertEquals(resposta.status, 201);
  return await resposta.json();
}

function logar(
  app: Aplicacao,
  corpo: string,
  cabecalhos: Record<string, string> = { "Content-Type": "application/json" },
  caminho = "/api/v1/sessions",
): Response | Promise<Response> {
  return app.request(caminho, {
    method: "POST",
    headers: cabecalhos,
    body: corpo,
  });
}

function corpoLogin(sobrescrever: Record<string, unknown> = {}): string {
  return JSON.stringify({
    email: "ana@exemplo.com",
    senha: "senha123",
    ...sobrescrever,
  });
}

interface SessaoCriada {
  id: string;
  token: string;
}

async function entrar(
  app: Aplicacao,
  email = "ana@exemplo.com",
  senha = "senha123",
): Promise<SessaoCriada> {
  const resposta = await logar(app, JSON.stringify({ email, senha }));
  assertEquals(resposta.status, 201);
  const corpo = await resposta.json();
  return { id: corpo.id, token: corpo.token };
}

function sair(
  app: Aplicacao,
  id: string,
  cabecalhos: Record<string, string> = {},
  caminho = `/api/v1/sessions/${id}`,
): Response | Promise<Response> {
  return app.request(caminho, { method: "DELETE", headers: cabecalhos });
}

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

async function conferirErro(
  resposta: Response,
  status: number,
  mensagem: string,
  senhaEnviada = "senha123",
) {
  assertEquals(resposta.status, status);
  conferirCors(resposta.headers);
  assertEquals(resposta.headers.get("Content-Type"), JSON_CT);
  const texto = await resposta.text();
  assertEquals(JSON.parse(texto), { mensagem });
  assertEquals(texto.includes(senhaEnviada), false);
}

function contarSessoes(conexao: ConexaoBanco): number {
  const linha = conexao
    .prepare("SELECT COUNT(*) AS total FROM sessoes;")
    .get() as { total: number };
  return linha.total;
}

function sessaoExiste(conexao: ConexaoBanco, id: string): boolean {
  return conexao.prepare("SELECT 1 FROM sessoes WHERE id = ?;").get(id) !==
    undefined;
}

Deno.test("POST /sessions com credenciais corretas retorna 201 no formato do protocolo", async () => {
  await comApp(async (app) => {
    const usuario = await cadastrar(app, "Ana Souza", "ana@exemplo.com");
    const resposta = await logar(app, corpoLogin());
    assertEquals(resposta.status, 201);
    conferirCors(resposta.headers);
    assertEquals(resposta.headers.get("Content-Type"), JSON_CT);
    const texto = await resposta.text();
    const corpo = JSON.parse(texto);
    assertEquals(Object.keys(corpo), ["id", "token", "usuario"]);
    assertEquals(corpo.usuario, {
      id: usuario.id,
      nome: "Ana Souza",
      email: "ana@exemplo.com",
    });
    assertEquals(Object.keys(corpo.usuario), ["id", "nome", "email"]);
    assert(PADRAO_UUID.test(corpo.id));
    assertEquals(corpo.token.split(".").length, 3);
    assertEquals(
      resposta.headers.get("Location"),
      `/api/v1/sessions/${corpo.id}`,
    );
    assertEquals(resposta.headers.get("Cache-Control"), "no-store");
    assertEquals(texto.includes("senha123"), false);
  });
});

Deno.test("login com e-mail em outra capitalização retorna 201", async () => {
  await comApp(async (app) => {
    await cadastrar(app, "Ana Souza", "ana@exemplo.com");
    const resposta = await logar(app, corpoLogin({ email: "ANA@Exemplo.COM" }));
    assertEquals(resposta.status, 201);
    conferirCors(resposta.headers);
    await resposta.json();
  });
});

Deno.test("credenciais inválidas retornam 401 genérico e idêntico", async () => {
  await comApp(async (app) => {
    await cadastrar(app, "Ana Souza", "ana@exemplo.com");
    const senhaErrada = await logar(app, corpoLogin({ senha: "errada123" }));
    const senhaOutraCaixa = await logar(app, corpoLogin({ senha: "SENHA123" }));
    const inexistente = await logar(
      app,
      corpoLogin({ email: "ninguem@exemplo.com" }),
    );
    const textoSenhaErrada = await senhaErrada.clone().text();
    const textoInexistente = await inexistente.clone().text();
    await conferirErro(senhaErrada, 401, MSG_CREDENCIAIS, "errada123");
    await conferirErro(senhaOutraCaixa, 401, MSG_CREDENCIAIS, "SENHA123");
    await conferirErro(inexistente, 401, MSG_CREDENCIAIS);
    assertEquals(textoSenhaErrada, textoInexistente);
  });
});

Deno.test("login com e-mail inexistente leva tempo de derivação", async () => {
  await comApp(async (app) => {
    const inicio = performance.now();
    const resposta = await logar(
      app,
      corpoLogin({ email: "ninguem@exemplo.com" }),
    );
    const duracao = performance.now() - inicio;
    assertEquals(resposta.status, 401);
    await resposta.json();
    assert(duracao >= 50, `duração de ${duracao} ms abaixo de 50 ms`);
  });
});

Deno.test("corpos de login inválidos retornam 400 com a mensagem da validação", async () => {
  await comApp(async (app) => {
    await cadastrar(app, "Ana Souza", "ana@exemplo.com");
    const casos: [string, string][] = [
      ["", "O corpo da requisição é obrigatório."],
      ["{email", "O corpo da requisição não é um JSON válido."],
      ["[]", "O corpo da requisição deve ser um objeto JSON."],
      [
        JSON.stringify({ senha: "senha123" }),
        "O campo email é obrigatório.",
      ],
      [
        JSON.stringify({ email: "ana@exemplo.com" }),
        "O campo senha é obrigatório.",
      ],
      [
        corpoLogin({ email: "semarroba" }),
        'O campo email deve conter "@" e um domínio válido (ex.: nome@exemplo.com).',
      ],
      [
        corpoLogin({ senha: "12345" }),
        "O campo senha deve ter entre 6 e 20 caracteres.",
      ],
      [
        corpoLogin({ senha: "senha@123" }),
        "O campo senha deve conter apenas letras sem acento e números, sem espaços ou caracteres especiais.",
      ],
      [corpoLogin({ email: null }), "O campo email não pode ser nulo."],
      [corpoLogin({ senha: 123456 }), "O campo senha deve ser um texto."],
    ];
    for (const [corpo, mensagem] of casos) {
      await conferirErro(await logar(app, corpo), 400, mensagem);
    }
  });
});

Deno.test("campo nome enviado junto é ignorado no login", async () => {
  await comApp(async (app) => {
    await cadastrar(app, "Ana Souza", "ana@exemplo.com");
    const resposta = await logar(app, corpoLogin({ nome: "Outro Nome" }));
    assertEquals(resposta.status, 201);
    const corpo = await resposta.json();
    assertEquals(corpo.usuario.nome, "Ana Souza");
  });
});

Deno.test("dois logins do mesmo usuário geram sessões independentes", async () => {
  await comApp(async (app, conexao) => {
    await cadastrar(app, "Ana Souza", "ana@exemplo.com");
    const primeira = await entrar(app);
    const segunda = await entrar(app);
    assertNotEquals(primeira.id, segunda.id);
    assertNotEquals(primeira.token, segunda.token);
    assert(sessaoExiste(conexao, primeira.id));
    assert(sessaoExiste(conexao, segunda.id));
    assertEquals(contarSessoes(conexao), 2);
  });
});

Deno.test("login tolera charset, ausência de Content-Type e barra final", async () => {
  await comApp(async (app) => {
    await cadastrar(app, "Ana Souza", "ana@exemplo.com");
    const comCharset = await logar(app, corpoLogin(), {
      "Content-Type": "application/json; charset=utf-8",
    });
    assertEquals(comCharset.status, 201);
    await comCharset.json();
    const semTipo = await logar(app, corpoLogin(), {});
    assertEquals(semTipo.status, 201);
    await semTipo.json();
    const barraFinal = await logar(
      app,
      corpoLogin(),
      { "Content-Type": "application/json" },
      "/api/v1/sessions/",
    );
    assertEquals(barraFinal.status, 201);
    await barraFinal.json();
  });
});

Deno.test("métodos diferentes de POST em /sessions retornam 405", async () => {
  await comApp(async (app) => {
    for (const metodo of ["GET", "PUT", "PATCH", "DELETE"]) {
      const resposta = await app.request("/api/v1/sessions", {
        method: metodo,
      });
      assertEquals(resposta.status, 405);
      assertEquals(resposta.headers.get("Allow"), "POST, OPTIONS");
      conferirCors(resposta.headers);
      assertEquals(await resposta.json(), { mensagem: MSG_METODO });
    }
  });
});

Deno.test("respostas de login nunca contêm a senha", async () => {
  await comApp(async (app) => {
    await cadastrar(app, "Ana Souza", "ana@exemplo.com", "SenhaUnica987");
    const sucesso = await logar(app, corpoLogin({ senha: "SenhaUnica987" }));
    assertEquals(sucesso.status, 201);
    assertEquals((await sucesso.text()).includes("SenhaUnica987"), false);
    const falha = await logar(app, corpoLogin({ senha: "Incorreta987" }));
    assertEquals(falha.status, 401);
    assertEquals((await falha.text()).includes("Incorreta987"), false);
  });
});

Deno.test("logout com o token da própria sessão retorna 204 e remove a sessão", async () => {
  await comApp(async (app, conexao) => {
    await cadastrar(app, "Ana Souza", "ana@exemplo.com");
    const sessao = await entrar(app);
    const resposta = await sair(app, sessao.id, bearer(sessao.token));
    assertEquals(resposta.status, 204);
    conferirCors(resposta.headers);
    assertEquals(resposta.headers.get("Content-Type"), null);
    assertEquals(await resposta.text(), "");
    assertEquals(sessaoExiste(conexao, sessao.id), false);
  });
});

Deno.test("token de sessão encerrada é recusado com 401", async () => {
  await comApp(async (app) => {
    await cadastrar(app, "Ana Souza", "ana@exemplo.com");
    const sessao = await entrar(app);
    const primeira = await sair(app, sessao.id, bearer(sessao.token));
    assertEquals(primeira.status, 204);
    await conferirErro(
      await sair(app, sessao.id, bearer(sessao.token)),
      401,
      MSG_TOKEN_INVALIDO,
    );
  });
});

Deno.test("logout sem token ou com cabeçalho mal formatado retorna 401", async () => {
  await comApp(async (app) => {
    await cadastrar(app, "Ana Souza", "ana@exemplo.com");
    const sessao = await entrar(app);
    await conferirErro(await sair(app, sessao.id), 401, MSG_TOKEN_AUSENTE);
    await conferirErro(
      await sair(app, sessao.id, { Authorization: `bearer ${sessao.token}` }),
      401,
      MSG_TOKEN_MAL_FORMATADO,
    );
  });
});

Deno.test("logout com sessão de outro usuário retorna 403 e preserva a sessão", async () => {
  await comApp(async (app, conexao) => {
    await cadastrar(app, "Ana Souza", "ana@exemplo.com");
    await cadastrar(app, "Bruno Lima", "bruno@exemplo.com");
    const sessaoA = await entrar(app, "ana@exemplo.com");
    const sessaoB = await entrar(app, "bruno@exemplo.com");
    await conferirErro(
      await sair(app, sessaoB.id, bearer(sessaoA.token)),
      403,
      MSG_POSSE_SESSAO,
    );
    assert(sessaoExiste(conexao, sessaoB.id));
    assert(sessaoExiste(conexao, sessaoA.id));
  });
});

Deno.test("logout com id de sessão inexistente retorna 403", async () => {
  await comApp(async (app) => {
    await cadastrar(app, "Ana Souza", "ana@exemplo.com");
    const sessao = await entrar(app);
    await conferirErro(
      await sair(app, crypto.randomUUID(), bearer(sessao.token)),
      403,
      MSG_POSSE_SESSAO,
    );
  });
});

Deno.test("token inválido tem prioridade sobre a posse da sessão", async () => {
  await comApp(async (app) => {
    await cadastrar(app, "Bruno Lima", "bruno@exemplo.com");
    const sessaoB = await entrar(app, "bruno@exemplo.com");
    await conferirErro(
      await sair(app, sessaoB.id, bearer("token.invalido.aqui")),
      401,
      MSG_TOKEN_INVALIDO,
    );
  });
});

Deno.test("logout de uma sessão não afeta outras sessões do mesmo usuário", async () => {
  await comApp(async (app) => {
    await cadastrar(app, "Ana Souza", "ana@exemplo.com");
    const a1 = await entrar(app);
    const a2 = await entrar(app);
    const encerrada = await sair(app, a2.id, bearer(a1.token));
    assertEquals(encerrada.status, 204);
    await conferirErro(
      await sair(app, a2.id, bearer(a2.token)),
      401,
      MSG_TOKEN_INVALIDO,
    );
    const final = await sair(app, a1.id, bearer(a1.token));
    assertEquals(final.status, 204);
  });
});

Deno.test("DELETE /sessions/{id}/ com barra final retorna 204", async () => {
  await comApp(async (app) => {
    await cadastrar(app, "Ana Souza", "ana@exemplo.com");
    const sessao = await entrar(app);
    const resposta = await sair(
      app,
      sessao.id,
      bearer(sessao.token),
      `/api/v1/sessions/${sessao.id}/`,
    );
    assertEquals(resposta.status, 204);
    conferirCors(resposta.headers);
  });
});

Deno.test("métodos diferentes de DELETE em /sessions/{id} retornam 405 sem exigir token", async () => {
  await comApp(async (app) => {
    const id = crypto.randomUUID();
    for (const metodo of ["GET", "POST", "PUT", "PATCH"]) {
      const resposta = await app.request(`/api/v1/sessions/${id}`, {
        method: metodo,
      });
      assertEquals(resposta.status, 405);
      assertEquals(resposta.headers.get("Allow"), "DELETE, OPTIONS");
      conferirCors(resposta.headers);
      assertEquals(await resposta.json(), { mensagem: MSG_METODO });
    }
  });
});

Deno.test("OPTIONS /sessions/{id} sem token retorna 204 com CORS", async () => {
  await comApp(async (app) => {
    const resposta = await app.request(
      `/api/v1/sessions/${crypto.randomUUID()}`,
      { method: "OPTIONS" },
    );
    assertEquals(resposta.status, 204);
    conferirCors(resposta.headers);
  });
});

Deno.test("fluxo completo: cadastro, login, logout, recusa e novo login", async () => {
  await comApp(async (app) => {
    await cadastrar(app, "Ana Souza", "ana@exemplo.com");
    const primeira = await entrar(app);
    const logout = await sair(app, primeira.id, bearer(primeira.token));
    assertEquals(logout.status, 204);
    await conferirErro(
      await sair(app, primeira.id, bearer(primeira.token)),
      401,
      MSG_TOKEN_INVALIDO,
    );
    const segunda = await entrar(app);
    assertNotEquals(segunda.id, primeira.id);
    assertNotEquals(segunda.token, primeira.token);
  });
});
