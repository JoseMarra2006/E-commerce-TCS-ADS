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
const MSG_TOKEN_AUSENTE = "Token de acesso ausente. Faça login para continuar.";
const MSG_TOKEN_INVALIDO =
  "Token de acesso inválido ou sessão encerrada. Faça login novamente.";
const MSG_ID_INVALIDO =
  "O id do usuário na URL deve ser um número inteiro positivo.";
const MSG_POSSE =
  "Você não tem permissão para acessar os dados de outro usuário.";
const MSG_EMAIL_EM_USO = "Este e-mail já está sendo usado por outro usuário.";
const MSG_NENHUM_CAMPO =
  "Informe ao menos um dos campos: nome, email ou senha.";
const MSG_METODO = "Método não permitido nesta rota.";
const PROIBIDOS = [
  "senhaHash",
  "senhaSalt",
  "senha_hash",
  "papel",
  "senha123",
  "senha456",
  "novaSenha1",
];

interface Conta {
  id: number;
  email: string;
  senha: string;
  token: string;
  sessaoId: string;
}

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

async function enviar(
  app: Aplicacao,
  metodo: string,
  caminho: string,
  opcoes: {
    token?: string;
    corpo?: unknown;
    cabecalhos?: Record<string, string>;
  } = {},
): Promise<Response> {
  const cabecalhos: Record<string, string> = { ...opcoes.cabecalhos };
  if (opcoes.token !== undefined) {
    cabecalhos["Authorization"] = `Bearer ${opcoes.token}`;
  }
  let corpo: string | undefined;
  if (opcoes.corpo !== undefined) {
    corpo = typeof opcoes.corpo === "string"
      ? opcoes.corpo
      : JSON.stringify(opcoes.corpo);
    if (opcoes.cabecalhos === undefined) {
      cabecalhos["Content-Type"] = "application/json";
    }
  }
  const resposta = await app.request(caminho, {
    method: metodo,
    headers: cabecalhos,
    body: corpo,
  });
  conferirCors(resposta.headers);
  const texto = await resposta.clone().text();
  for (const proibido of PROIBIDOS) {
    assertEquals(
      texto.includes(proibido),
      false,
      `resposta contém ${proibido}`,
    );
  }
  return resposta;
}

async function login(
  app: Aplicacao,
  email: string,
  senha: string,
): Promise<Response> {
  return await enviar(app, "POST", "/api/v1/sessions", {
    corpo: { email, senha },
  });
}

async function criarConta(
  app: Aplicacao,
  nome: string,
  email: string,
  senha: string,
): Promise<Conta> {
  const cadastro = await enviar(app, "POST", "/api/v1/users", {
    corpo: { nome, email, senha },
  });
  assertEquals(cadastro.status, 201);
  const usuario = await cadastro.json();
  const sessao = await login(app, email, senha);
  assertEquals(sessao.status, 201);
  const corpo = await sessao.json();
  return {
    id: usuario.id,
    email,
    senha,
    token: corpo.token,
    sessaoId: corpo.id,
  };
}

async function duasContas(app: Aplicacao): Promise<[Conta, Conta]> {
  const a = await criarConta(app, "Ana Souza", "ana@exemplo.com", "senha123");
  const b = await criarConta(
    app,
    "Bruno Lima",
    "bruno@exemplo.com",
    "senha456",
  );
  return [a, b];
}

async function conferirErro(
  resposta: Response,
  status: number,
  mensagem: string,
) {
  assertEquals(resposta.status, status);
  assertEquals(resposta.headers.get("Content-Type"), JSON_CT);
  assertEquals(await resposta.json(), { mensagem });
}

async function conferirUsuario(
  resposta: Response,
  esperado: { id: number; nome: string; email: string },
) {
  assertEquals(resposta.status, 200);
  assertEquals(resposta.headers.get("Content-Type"), JSON_CT);
  const texto = await resposta.text();
  assertEquals(texto, JSON.stringify(esperado));
}

function caminho(id: number | string): string {
  return `/api/v1/users/${id}`;
}

function usuarioExiste(conexao: ConexaoBanco, id: number): boolean {
  return conexao.prepare("SELECT 1 FROM usuarios WHERE id = ?;").get(id) !==
    undefined;
}

Deno.test("GET /users/{id} com o token do dono retorna 200", async () => {
  await comApp(async (app) => {
    const [a] = await duasContas(app);
    const resposta = await enviar(app, "GET", caminho(a.id), {
      token: a.token,
    });
    await conferirUsuario(resposta, {
      id: a.id,
      nome: "Ana Souza",
      email: "ana@exemplo.com",
    });
  });
});

Deno.test("HEAD /users/{id} retorna 200 sem corpo e exige token", async () => {
  await comApp(async (app) => {
    const [a] = await duasContas(app);
    const ok = await enviar(app, "HEAD", caminho(a.id), { token: a.token });
    assertEquals(ok.status, 200);
    assertEquals(await ok.text(), "");
    const semToken = await enviar(app, "HEAD", caminho(a.id));
    assertEquals(semToken.status, 401);
  });
});

Deno.test("PUT com três campos válidos atualiza e troca a senha", async () => {
  await comApp(async (app) => {
    const [a] = await duasContas(app);
    const resposta = await enviar(app, "PUT", caminho(a.id), {
      token: a.token,
      corpo: {
        nome: "  Ana Maria  ",
        email: "maria@exemplo.com",
        senha: "novaSenha1",
      },
    });
    await conferirUsuario(resposta, {
      id: a.id,
      nome: "Ana Maria",
      email: "maria@exemplo.com",
    });
    assertEquals(
      (await login(app, "maria@exemplo.com", "novaSenha1")).status,
      201,
    );
    assertEquals(
      (await login(app, "maria@exemplo.com", "senha123")).status,
      401,
    );
  });
});

Deno.test("PUT sem qualquer um dos três campos retorna 400", async () => {
  await comApp(async (app) => {
    const [a] = await duasContas(app);
    const completo = {
      nome: "Ana Maria",
      email: "maria@exemplo.com",
      senha: "novaSenha1",
    };
    for (const campo of ["nome", "email", "senha"] as const) {
      const corpo: Record<string, string> = { ...completo };
      delete corpo[campo];
      await conferirErro(
        await enviar(app, "PUT", caminho(a.id), { token: a.token, corpo }),
        400,
        `O campo ${campo} é obrigatório.`,
      );
    }
  });
});

Deno.test("PUT com e-mail de outro usuário retorna 409", async () => {
  await comApp(async (app) => {
    const [a] = await duasContas(app);
    await conferirErro(
      await enviar(app, "PUT", caminho(a.id), {
        token: a.token,
        corpo: {
          nome: "Ana Souza",
          email: "BRUNO@exemplo.com",
          senha: "novaSenha1",
        },
      }),
      409,
      MSG_EMAIL_EM_USO,
    );
  });
});

Deno.test("PUT com o próprio e-mail em outra capitalização retorna 200", async () => {
  await comApp(async (app) => {
    const [a] = await duasContas(app);
    const resposta = await enviar(app, "PUT", caminho(a.id), {
      token: a.token,
      corpo: { nome: "Ana Souza", email: "ANA@Exemplo.com", senha: "senha123" },
    });
    await conferirUsuario(resposta, {
      id: a.id,
      nome: "Ana Souza",
      email: "ANA@Exemplo.com",
    });
  });
});

Deno.test("PUT ignora campos extras como id e papel", async () => {
  await comApp(async (app, conexao) => {
    const [a] = await duasContas(app);
    const resposta = await enviar(app, "PUT", caminho(a.id), {
      token: a.token,
      corpo: {
        id: 999,
        papel: "administrador",
        nome: "Ana Souza",
        email: "ana@exemplo.com",
        senha: "senha123",
      },
    });
    await conferirUsuario(resposta, {
      id: a.id,
      nome: "Ana Souza",
      email: "ana@exemplo.com",
    });
    const linha = conexao
      .prepare("SELECT papel FROM usuarios WHERE id = ?;")
      .get(a.id) as { papel: string };
    assertEquals(linha.papel, "comum");
  });
});

Deno.test("PATCH só do nome mantém e-mail e senha", async () => {
  await comApp(async (app) => {
    const [a] = await duasContas(app);
    const resposta = await enviar(app, "PATCH", caminho(a.id), {
      token: a.token,
      corpo: { nome: "Ana Maria" },
    });
    await conferirUsuario(resposta, {
      id: a.id,
      nome: "Ana Maria",
      email: "ana@exemplo.com",
    });
    assertEquals((await login(app, "ana@exemplo.com", "senha123")).status, 201);
  });
});

Deno.test("PATCH só da senha troca a senha", async () => {
  await comApp(async (app) => {
    const [a] = await duasContas(app);
    const resposta = await enviar(app, "PATCH", caminho(a.id), {
      token: a.token,
      corpo: { senha: "novaSenha1" },
    });
    assertEquals(resposta.status, 200);
    await resposta.json();
    assertEquals(
      (await login(app, "ana@exemplo.com", "novaSenha1")).status,
      201,
    );
    assertEquals((await login(app, "ana@exemplo.com", "senha123")).status, 401);
  });
});

Deno.test("PATCH só do e-mail troca o e-mail", async () => {
  await comApp(async (app) => {
    const [a] = await duasContas(app);
    const resposta = await enviar(app, "PATCH", caminho(a.id), {
      token: a.token,
      corpo: { email: "novo@exemplo.com" },
    });
    await conferirUsuario(resposta, {
      id: a.id,
      nome: "Ana Souza",
      email: "novo@exemplo.com",
    });
    assertEquals(
      (await login(app, "novo@exemplo.com", "senha123")).status,
      201,
    );
  });
});

Deno.test("PATCH sem campos conhecidos retorna 400", async () => {
  await comApp(async (app) => {
    const [a] = await duasContas(app);
    for (const corpo of [{}, { foo: 1 }, { id: 5 }]) {
      await conferirErro(
        await enviar(app, "PATCH", caminho(a.id), { token: a.token, corpo }),
        400,
        MSG_NENHUM_CAMPO,
      );
    }
  });
});

Deno.test("PATCH com tipos ou formatos inválidos retorna 400", async () => {
  await comApp(async (app) => {
    const [a] = await duasContas(app);
    const casos: [unknown, string][] = [
      [{ nome: null }, "O campo nome não pode ser nulo."],
      [{ email: 123 }, "O campo email deve ser um texto."],
      [{ senha: "abc" }, "O campo senha deve ter entre 6 e 20 caracteres."],
    ];
    for (const [corpo, mensagem] of casos) {
      await conferirErro(
        await enviar(app, "PATCH", caminho(a.id), { token: a.token, corpo }),
        400,
        mensagem,
      );
    }
  });
});

Deno.test("PATCH com e-mail de outro usuário retorna 409", async () => {
  await comApp(async (app) => {
    const [a] = await duasContas(app);
    await conferirErro(
      await enviar(app, "PATCH", caminho(a.id), {
        token: a.token,
        corpo: { email: "bruno@exemplo.com" },
      }),
      409,
      MSG_EMAIL_EM_USO,
    );
  });
});

Deno.test("DELETE remove o usuário e suas sessões", async () => {
  await comApp(async (app, conexao) => {
    const [a, b] = await duasContas(app);
    const resposta = await enviar(app, "DELETE", caminho(a.id), {
      token: a.token,
    });
    assertEquals(resposta.status, 204);
    assertEquals(resposta.headers.get("Content-Type"), null);
    assertEquals(await resposta.text(), "");
    assertEquals(usuarioExiste(conexao, a.id), false);
    const sessoesDeA = conexao
      .prepare("SELECT COUNT(*) AS total FROM sessoes WHERE usuario_id = ?;")
      .get(a.id) as { total: number };
    assertEquals(sessoesDeA.total, 0);
    assert(usuarioExiste(conexao, b.id));
  });
});

Deno.test("após DELETE os tokens e o login do usuário são recusados", async () => {
  await comApp(async (app) => {
    const a = await criarConta(app, "Ana Souza", "ana@exemplo.com", "senha123");
    const segundo = await login(app, a.email, a.senha);
    assertEquals(segundo.status, 201);
    const tokenExtra = (await segundo.json()).token;
    const exclusao = await enviar(app, "DELETE", caminho(a.id), {
      token: a.token,
    });
    assertEquals(exclusao.status, 204);
    for (const token of [a.token, tokenExtra]) {
      await conferirErro(
        await enviar(app, "GET", caminho(a.id), { token }),
        401,
        MSG_TOKEN_INVALIDO,
      );
    }
    assertEquals((await login(app, a.email, a.senha)).status, 401);
  });
});

Deno.test("após DELETE o e-mail pode ser cadastrado de novo com outro id", async () => {
  await comApp(async (app) => {
    const a = await criarConta(app, "Ana Souza", "ana@exemplo.com", "senha123");
    await enviar(app, "DELETE", caminho(a.id), { token: a.token });
    const cadastro = await enviar(app, "POST", "/api/v1/users", {
      corpo: { nome: "Ana Souza", email: "ana@exemplo.com", senha: "senha123" },
    });
    assertEquals(cadastro.status, 201);
    assertNotEquals((await cadastro.json()).id, a.id);
  });
});

const METODOS_COM_CORPO: [string, unknown][] = [
  ["GET", undefined],
  [
    "PUT",
    { nome: "Ana Maria", email: "maria@exemplo.com", senha: "novaSenha1" },
  ],
  ["PATCH", { nome: "Ana Maria" }],
  ["DELETE", undefined],
];

Deno.test("sem token ou com token inválido retorna 401 antes de qualquer outra checagem", async () => {
  await comApp(async (app) => {
    const [a] = await duasContas(app);
    for (const [metodo, corpo] of METODOS_COM_CORPO) {
      await conferirErro(
        await enviar(app, metodo, caminho(a.id), { corpo }),
        401,
        MSG_TOKEN_AUSENTE,
      );
      await conferirErro(
        await enviar(app, metodo, caminho("abc"), {
          token: "token.invalido.aqui",
          corpo,
        }),
        401,
        MSG_TOKEN_INVALIDO,
      );
    }
  });
});

Deno.test("id em formato inválido retorna 400", async () => {
  await comApp(async (app) => {
    const [a] = await duasContas(app);
    for (const [metodo, corpo] of METODOS_COM_CORPO) {
      for (const id of ["abc", "0", "1.5"]) {
        await conferirErro(
          await enviar(app, metodo, caminho(id), { token: a.token, corpo }),
          400,
          MSG_ID_INVALIDO,
        );
      }
    }
  });
});

Deno.test("id de outro usuário, existente ou não, retorna 403 sem alterar dados", async () => {
  await comApp(async (app, conexao) => {
    const [a, b] = await duasContas(app);
    for (const [metodo, corpo] of METODOS_COM_CORPO) {
      for (const id of [b.id, 999999]) {
        await conferirErro(
          await enviar(app, metodo, caminho(id), { token: a.token, corpo }),
          403,
          MSG_POSSE,
        );
      }
    }
    assert(usuarioExiste(conexao, b.id));
    const linha = conexao
      .prepare("SELECT nome FROM usuarios WHERE id = ?;")
      .get(b.id) as { nome: string };
    assertEquals(linha.nome, "Bruno Lima");
  });
});

Deno.test("a posse vem antes da validação do corpo", async () => {
  await comApp(async (app) => {
    const [a, b] = await duasContas(app);
    for (const metodo of ["PUT", "PATCH"]) {
      await conferirErro(
        await enviar(app, metodo, caminho(b.id), {
          token: a.token,
          corpo: "{invalido",
        }),
        403,
        MSG_POSSE,
      );
    }
  });
});

Deno.test("o corpo inválido vem antes do conflito de e-mail", async () => {
  await comApp(async (app) => {
    const [a] = await duasContas(app);
    await conferirErro(
      await enviar(app, "PUT", caminho(a.id), {
        token: a.token,
        corpo: { nome: "Ana Souza", email: "bruno@exemplo.com", senha: "123" },
      }),
      400,
      "O campo senha deve ter entre 6 e 20 caracteres.",
    );
  });
});

Deno.test("barra final funciona nos quatro métodos", async () => {
  await comApp(async (app) => {
    const a = await criarConta(app, "Ana Souza", "ana@exemplo.com", "senha123");
    const url = `${caminho(a.id)}/`;
    assertEquals(
      (await enviar(app, "GET", url, { token: a.token })).status,
      200,
    );
    assertEquals(
      (await enviar(app, "PUT", url, {
        token: a.token,
        corpo: {
          nome: "Ana Souza",
          email: "ana@exemplo.com",
          senha: "senha123",
        },
      })).status,
      200,
    );
    assertEquals(
      (await enviar(app, "PATCH", url, {
        token: a.token,
        corpo: { nome: "Ana Maria" },
      })).status,
      200,
    );
    assertEquals(
      (await enviar(app, "DELETE", url, { token: a.token })).status,
      204,
    );
  });
});

Deno.test("PUT e PATCH toleram charset e ausência de Content-Type", async () => {
  await comApp(async (app) => {
    const [a] = await duasContas(app);
    const variantes: Record<string, string>[] = [
      { "Content-Type": "application/json; charset=utf-8" },
      {},
    ];
    for (const cabecalhos of variantes) {
      const put = await enviar(app, "PUT", caminho(a.id), {
        token: a.token,
        cabecalhos,
        corpo: {
          nome: "Ana Souza",
          email: "ana@exemplo.com",
          senha: "senha123",
        },
      });
      assertEquals(put.status, 200);
      await put.json();
      const patch = await enviar(app, "PATCH", caminho(a.id), {
        token: a.token,
        cabecalhos,
        corpo: { nome: "Ana Maria" },
      });
      assertEquals(patch.status, 200);
      await patch.json();
    }
  });
});

Deno.test("POST em /users/{id} retorna 405 com Allow, mesmo sem token", async () => {
  await comApp(async (app) => {
    const resposta = await enviar(app, "POST", caminho(1));
    assertEquals(resposta.status, 405);
    assertEquals(
      resposta.headers.get("Allow"),
      "GET, HEAD, PUT, PATCH, DELETE, OPTIONS",
    );
    assertEquals(await resposta.json(), { mensagem: MSG_METODO });
  });
});

Deno.test("OPTIONS /users/{id} sem token retorna 204 com CORS", async () => {
  await comApp(async (app) => {
    const resposta = await enviar(app, "OPTIONS", caminho(1));
    assertEquals(resposta.status, 204);
  });
});
