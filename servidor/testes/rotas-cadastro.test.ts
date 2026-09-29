import "./auxiliares/vigia-arquivos-reais.ts";
import { assertEquals } from "@std/assert";
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

const MSG_DUPLICADO = "E-mail já cadastrado. Faça login para continuar.";
const JSON_CT = "application/json; charset=utf-8";

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

function cadastrar(
  app: Aplicacao,
  corpo: string,
  cabecalhos: Record<string, string> = { "Content-Type": "application/json" },
  caminho = "/api/v1/users",
): Response | Promise<Response> {
  return app.request(caminho, {
    method: "POST",
    headers: cabecalhos,
    body: corpo,
  });
}

function corpoValido(sobrescrever: Record<string, unknown> = {}): string {
  return JSON.stringify({
    nome: "Ana Souza",
    email: "ana@exemplo.com",
    senha: "senha123",
    ...sobrescrever,
  });
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

function semChavesSensiveis(texto: string) {
  const chaves = Object.keys(JSON.parse(texto));
  for (const chave of chaves) {
    for (const proibida of ["senha", "hash", "salt"]) {
      assertEquals(chave.includes(proibida), false);
    }
  }
}

Deno.test("POST /users com corpo válido retorna 201 no formato do protocolo", async () => {
  await comApp(async (app) => {
    const resposta = await cadastrar(
      app,
      corpoValido({ nome: "  Ana Souza  " }),
    );
    assertEquals(resposta.status, 201);
    conferirCors(resposta.headers);
    assertEquals(resposta.headers.get("Content-Type"), JSON_CT);
    const texto = await resposta.text();
    const corpo = JSON.parse(texto);
    assertEquals(typeof corpo.id, "number");
    assertEquals(Number.isInteger(corpo.id), true);
    assertEquals(corpo, {
      id: corpo.id,
      nome: "Ana Souza",
      email: "ana@exemplo.com",
    });
    assertEquals(Object.keys(corpo), ["id", "nome", "email"]);
    assertEquals(resposta.headers.get("Location"), `/api/v1/users/${corpo.id}`);
    assertEquals(texto.includes("senha123"), false);
    semChavesSensiveis(texto);
  });
});

Deno.test("usuário é gravado com nome normalizado e senha em hash", async () => {
  await comApp(async (app, conexao) => {
    const resposta = await cadastrar(
      app,
      corpoValido({ nome: "  Ana Souza  " }),
    );
    assertEquals(resposta.status, 201);
    await resposta.json();
    const linha = conexao
      .prepare("SELECT nome, senha_hash, senha_salt FROM usuarios;")
      .get() as { nome: string; senha_hash: string; senha_salt: string };
    assertEquals(linha.nome, "Ana Souza");
    assertEquals(/^[0-9a-f]{64}$/.test(linha.senha_hash), true);
    assertEquals(/^[0-9a-f]{32}$/.test(linha.senha_salt), true);
  });
});

Deno.test("campos extras são ignorados", async () => {
  await comApp(async (app, conexao) => {
    const resposta = await cadastrar(
      app,
      corpoValido({ id: 999, papel: "administrador", outro: true }),
    );
    assertEquals(resposta.status, 201);
    const corpo = await resposta.json();
    assertEquals(corpo.id === 999, false);
    assertEquals(Object.keys(corpo), ["id", "nome", "email"]);
    const linha = conexao
      .prepare("SELECT papel FROM usuarios;")
      .get() as { papel: string };
    assertEquals(linha.papel, "comum");
  });
});

Deno.test("e-mail duplicado retorna 409, inclusive com outra capitalização", async () => {
  await comApp(async (app) => {
    const primeira = await cadastrar(app, corpoValido());
    assertEquals(primeira.status, 201);
    await primeira.json();
    await conferirErro(await cadastrar(app, corpoValido()), 409, MSG_DUPLICADO);
    await conferirErro(
      await cadastrar(app, corpoValido({ email: "ANA@Exemplo.com" })),
      409,
      MSG_DUPLICADO,
    );
  });
});

Deno.test("corpos inválidos retornam 400 com a mensagem da validação", async () => {
  await comApp(async (app) => {
    const casos: [string, string, string][] = [
      ["corpo vazio", "", "O corpo da requisição é obrigatório."],
      [
        "JSON inválido",
        "{nome",
        "O corpo da requisição não é um JSON válido.",
      ],
      [
        "array",
        "[]",
        "O corpo da requisição deve ser um objeto JSON.",
      ],
      [
        "nome ausente",
        JSON.stringify({ email: "ana@exemplo.com", senha: "senha123" }),
        "O campo nome é obrigatório.",
      ],
      [
        "email inválido",
        corpoValido({ email: "semarroba" }),
        'O campo email deve conter "@" e um domínio válido (ex.: nome@exemplo.com).',
      ],
      [
        "senha curta",
        corpoValido({ senha: "12345" }),
        "O campo senha deve ter entre 6 e 20 caracteres.",
      ],
      [
        "senha com especial",
        corpoValido({ senha: "senha@123" }),
        "O campo senha deve conter apenas letras sem acento e números, sem espaços ou caracteres especiais.",
      ],
      [
        "nome nulo",
        corpoValido({ nome: null }),
        "O campo nome não pode ser nulo.",
      ],
      [
        "email numérico",
        corpoValido({ email: 123 }),
        "O campo email deve ser um texto.",
      ],
    ];
    for (const [, corpo, mensagem] of casos) {
      const resposta = await cadastrar(app, corpo);
      await conferirErro(resposta, 400, mensagem);
    }
  });
});

Deno.test("validação vem antes da verificação de duplicidade", async () => {
  await comApp(async (app) => {
    const primeira = await cadastrar(app, corpoValido());
    await primeira.json();
    const resposta = await cadastrar(app, corpoValido({ senha: "123" }));
    assertEquals(resposta.status, 400);
    conferirCors(resposta.headers);
    await resposta.json();
  });
});

Deno.test("tolera charset, ausência de Content-Type e barra final", async () => {
  await comApp(async (app) => {
    const comCharset = await cadastrar(app, corpoValido(), {
      "Content-Type": "application/json; charset=utf-8",
    });
    assertEquals(comCharset.status, 201);
    await comCharset.json();

    const semTipo = await cadastrar(
      app,
      corpoValido({ email: "b@exemplo.com" }),
      {},
    );
    assertEquals(semTipo.status, 201);
    await semTipo.json();

    const barraFinal = await cadastrar(
      app,
      corpoValido({ email: "c@exemplo.com" }),
      { "Content-Type": "application/json" },
      "/api/v1/users/",
    );
    assertEquals(barraFinal.status, 201);
    await barraFinal.json();
  });
});

Deno.test("métodos diferentes de POST retornam 405 com Allow", async () => {
  await comApp(async (app) => {
    for (const metodo of ["GET", "PUT", "PATCH", "DELETE"]) {
      const resposta = await app.request("/api/v1/users", { method: metodo });
      assertEquals(resposta.status, 405);
      assertEquals(resposta.headers.get("Allow"), "POST, OPTIONS");
      conferirCors(resposta.headers);
      assertEquals(await resposta.json(), {
        mensagem: "Método não permitido nesta rota.",
      });
    }
  });
});

Deno.test("OPTIONS /users retorna 204 com CORS", async () => {
  await comApp(async (app) => {
    const resposta = await app.request("/api/v1/users", { method: "OPTIONS" });
    assertEquals(resposta.status, 204);
    conferirCors(resposta.headers);
  });
});

Deno.test("caminho desconhecido continua retornando 404", async () => {
  await comApp(async (app) => {
    const resposta = await app.request("/api/v1/outra-coisa");
    assertEquals(resposta.status, 404);
    assertEquals(await resposta.json(), { mensagem: "Rota não encontrada." });
  });
});
