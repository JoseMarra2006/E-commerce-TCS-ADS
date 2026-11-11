import "./auxiliares/vigia-arquivos-reais.ts";
import { assert, assertEquals } from "@std/assert";
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

type Aplicacao = ReturnType<typeof criarAplicacao>;

const CHAVES_USUARIO = ["id", "nome", "email", "admin"];

interface Sessao {
  idUsuario: number;
  token: string;
  usuario: Record<string, unknown>;
}

async function comApp(
  teste: (app: Aplicacao, conexao: ConexaoBanco) => Promise<void>,
): Promise<void> {
  const caminho = criarCaminhoBancoTemporario();
  const conexao = abrirConexao(caminho);
  try {
    executarMigracoes(conexao);
    await garantirAdmPadrao(conexao, () => {});
    const app = criarAplicacao({ conexao, segredoJwt: SEGREDO_TESTE });
    await teste(app, conexao);
  } finally {
    fecharConexao(conexao);
    removerBancoTemporario(caminho);
  }
}

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function conferirChavesSemPapelESenha(valor: unknown): void {
  if (Array.isArray(valor)) {
    valor.forEach(conferirChavesSemPapelESenha);
    return;
  }
  if (!ehObjeto(valor)) {
    return;
  }
  for (const [chave, interno] of Object.entries(valor)) {
    const minuscula = chave.toLowerCase();
    assertEquals(minuscula.includes("papel"), false, `chave ${chave}`);
    assertEquals(minuscula.includes("senha"), false, `chave ${chave}`);
    conferirChavesSemPapelESenha(interno);
  }
}

function conferirUsuario(
  corpo: unknown,
  esperado: { nome?: string; email?: string; admin: boolean },
): Record<string, unknown> {
  assert(ehObjeto(corpo), "o usuário deve ser um objeto");
  assertEquals(Object.keys(corpo), CHAVES_USUARIO);
  assertEquals(typeof corpo.admin, "boolean");
  assertEquals(corpo.admin, esperado.admin);
  if (esperado.nome !== undefined) {
    assertEquals(corpo.nome, esperado.nome);
  }
  if (esperado.email !== undefined) {
    assertEquals(corpo.email, esperado.email);
  }
  conferirChavesSemPapelESenha(corpo);
  return corpo;
}

async function enviar(
  app: Aplicacao,
  metodo: string,
  caminho: string,
  opcoes: { token?: string; corpo?: unknown } = {},
): Promise<{ status: number; corpo: unknown; texto: string }> {
  const cabecalhos: Record<string, string> = {};
  if (opcoes.token !== undefined) {
    cabecalhos["Authorization"] = `Bearer ${opcoes.token}`;
  }
  let corpo: string | undefined;
  if (opcoes.corpo !== undefined) {
    cabecalhos["Content-Type"] = "application/json";
    corpo = JSON.stringify(opcoes.corpo);
  }
  const resposta = await app.request(caminho, {
    method: metodo,
    headers: cabecalhos,
    body: corpo,
  });
  const texto = await resposta.text();
  return {
    status: resposta.status,
    corpo: texto === "" ? null : JSON.parse(texto),
    texto,
  };
}

async function logar(
  app: Aplicacao,
  email: string,
  senha: string,
): Promise<Sessao> {
  const resposta = await enviar(app, "POST", "/api/v1/sessions", {
    corpo: { email, senha },
  });
  assertEquals(resposta.status, 201);
  assert(ehObjeto(resposta.corpo), "a sessão deve ser um objeto");
  assertEquals(Object.keys(resposta.corpo), ["id", "token", "usuario"]);
  conferirChavesSemPapelESenha(resposta.corpo);
  assertEquals(resposta.texto.includes("papel"), false);
  const { token, usuario } = resposta.corpo;
  assert(typeof token === "string");
  assert(ehObjeto(usuario));
  assert(typeof usuario.id === "number");
  return { idUsuario: usuario.id, token, usuario };
}

async function cadastrarComum(
  app: Aplicacao,
  extras: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const resposta = await enviar(app, "POST", "/api/v1/users", {
    corpo: {
      ...extras,
      nome: "Ana Souza",
      email: "ana@exemplo.com",
      senha: "senha123",
    },
  });
  assertEquals(resposta.status, 201);
  return conferirUsuario(resposta.corpo, {
    nome: "Ana Souza",
    email: "ana@exemplo.com",
    admin: false,
  });
}

function papelNoBanco(conexao: ConexaoBanco, email: string): string {
  const linha = conexao
    .prepare("SELECT papel FROM usuarios WHERE email = ?;")
    .get(email) as { papel: string } | undefined;
  assert(linha !== undefined, "usuário não encontrado no banco");
  return linha.papel;
}

Deno.test("POST /users cria usuário comum com admin false", async () => {
  await comApp(async (app, conexao) => {
    await cadastrarComum(app);
    assertEquals(papelNoBanco(conexao, "ana@exemplo.com"), "comum");
  });
});

Deno.test("POST /users ignora admin true e papel administrador no corpo", async () => {
  await comApp(async (app, conexao) => {
    const criado = await cadastrarComum(app, {
      admin: true,
      papel: "administrador",
    });
    assertEquals(criado.admin, false);
    assertEquals(papelNoBanco(conexao, "ana@exemplo.com"), "comum");
    const sessao = await logar(app, "ana@exemplo.com", "senha123");
    const leitura = await enviar(app, "GET", `/api/v1/users/${criado.id}`, {
      token: sessao.token,
    });
    assertEquals(leitura.status, 200);
    conferirUsuario(leitura.corpo, { admin: false });
  });
});

Deno.test("GET /users/{id} do comum lendo a si mesmo tem admin false", async () => {
  await comApp(async (app) => {
    await cadastrarComum(app);
    const sessao = await logar(app, "ana@exemplo.com", "senha123");
    const resposta = await enviar(
      app,
      "GET",
      `/api/v1/users/${sessao.idUsuario}`,
      { token: sessao.token },
    );
    assertEquals(resposta.status, 200);
    conferirUsuario(resposta.corpo, {
      nome: "Ana Souza",
      email: "ana@exemplo.com",
      admin: false,
    });
  });
});

Deno.test("GET /users/{id} do ADM padrão lendo a si mesmo tem admin true", async () => {
  await comApp(async (app) => {
    const sessao = await logar(app, EMAIL_ADM_PADRAO, SENHA_ADM_PADRAO);
    const resposta = await enviar(
      app,
      "GET",
      `/api/v1/users/${sessao.idUsuario}`,
      { token: sessao.token },
    );
    assertEquals(resposta.status, 200);
    conferirUsuario(resposta.corpo, {
      nome: NOME_ADM_PADRAO,
      email: EMAIL_ADM_PADRAO,
      admin: true,
    });
  });
});

Deno.test("PUT /users/{id} do comum com admin true no corpo mantém admin false", async () => {
  await comApp(async (app, conexao) => {
    await cadastrarComum(app);
    const sessao = await logar(app, "ana@exemplo.com", "senha123");
    const resposta = await enviar(
      app,
      "PUT",
      `/api/v1/users/${sessao.idUsuario}`,
      {
        token: sessao.token,
        corpo: {
          admin: true,
          papel: "administrador",
          nome: "Ana Maria",
          email: "ana@exemplo.com",
          senha: "senha123",
        },
      },
    );
    assertEquals(resposta.status, 200);
    conferirUsuario(resposta.corpo, { nome: "Ana Maria", admin: false });
    assertEquals(papelNoBanco(conexao, "ana@exemplo.com"), "comum");
  });
});

Deno.test("PATCH /users/{id} do comum com admin true no corpo mantém admin false", async () => {
  await comApp(async (app, conexao) => {
    await cadastrarComum(app);
    const sessao = await logar(app, "ana@exemplo.com", "senha123");
    const resposta = await enviar(
      app,
      "PATCH",
      `/api/v1/users/${sessao.idUsuario}`,
      {
        token: sessao.token,
        corpo: { admin: true, papel: "administrador", nome: "Ana Maria" },
      },
    );
    assertEquals(resposta.status, 200);
    conferirUsuario(resposta.corpo, { nome: "Ana Maria", admin: false });
    assertEquals(papelNoBanco(conexao, "ana@exemplo.com"), "comum");
  });
});

Deno.test("PUT /users/{id} do ADM padrão em si mesmo mantém admin true", async () => {
  await comApp(async (app, conexao) => {
    const sessao = await logar(app, EMAIL_ADM_PADRAO, SENHA_ADM_PADRAO);
    const resposta = await enviar(
      app,
      "PUT",
      `/api/v1/users/${sessao.idUsuario}`,
      {
        token: sessao.token,
        corpo: {
          nome: "Administrador",
          email: EMAIL_ADM_PADRAO,
          senha: SENHA_ADM_PADRAO,
        },
      },
    );
    assertEquals(resposta.status, 200);
    conferirUsuario(resposta.corpo, { nome: "Administrador", admin: true });
    assertEquals(papelNoBanco(conexao, EMAIL_ADM_PADRAO), "administrador");
  });
});

Deno.test("PATCH /users/{id} do ADM padrão em si mesmo mantém admin true", async () => {
  await comApp(async (app, conexao) => {
    const sessao = await logar(app, EMAIL_ADM_PADRAO, SENHA_ADM_PADRAO);
    const resposta = await enviar(
      app,
      "PATCH",
      `/api/v1/users/${sessao.idUsuario}`,
      { token: sessao.token, corpo: { nome: "Administrador" } },
    );
    assertEquals(resposta.status, 200);
    conferirUsuario(resposta.corpo, {
      nome: "Administrador",
      email: EMAIL_ADM_PADRAO,
      admin: true,
    });
    assertEquals(papelNoBanco(conexao, EMAIL_ADM_PADRAO), "administrador");
  });
});

Deno.test("POST /sessions do comum devolve usuario.admin false", async () => {
  await comApp(async (app) => {
    await cadastrarComum(app);
    const sessao = await logar(app, "ana@exemplo.com", "senha123");
    conferirUsuario(sessao.usuario, {
      nome: "Ana Souza",
      email: "ana@exemplo.com",
      admin: false,
    });
  });
});

Deno.test("POST /sessions do ADM padrão devolve usuario.admin true", async () => {
  await comApp(async (app) => {
    const sessao = await logar(app, EMAIL_ADM_PADRAO, SENHA_ADM_PADRAO);
    conferirUsuario(sessao.usuario, {
      nome: NOME_ADM_PADRAO,
      email: EMAIL_ADM_PADRAO,
      admin: true,
    });
  });
});
