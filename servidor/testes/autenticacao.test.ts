import "./auxiliares/vigia-arquivos-reais.ts";
import { assert, assertEquals } from "@std/assert";
import { sign } from "@hono/hono/jwt";
import { criarAplicacao } from "../src/aplicacao.ts";
import { abrirConexao, fecharConexao } from "../src/banco/conexao.ts";
import type { ConexaoBanco } from "../src/banco/conexao.ts";
import { executarMigracoes } from "../src/banco/migracoes.ts";
import { exigirAutenticacao } from "../src/intermediarios/autenticacao.ts";
import {
  verificarPosseSessao,
  verificarPosseUsuario,
} from "../src/intermediarios/posse.ts";
import {
  criarSessao,
  excluirSessao,
} from "../src/modulos/sessoes/repositorio-sessoes.ts";
import {
  criarUsuario,
  excluirUsuario,
} from "../src/modulos/usuarios/repositorio-usuarios.ts";
import { gerarTokenJwt } from "../src/utilitarios/jwt.ts";
import {
  criarCaminhoBancoTemporario,
  removerBancoTemporario,
} from "./auxiliares/banco-temporario.ts";
import { SEGREDO_TESTE } from "./auxiliares/segredo-temporario.ts";

const MSG_AUSENTE = "Token de acesso ausente. Faça login para continuar.";
const MSG_MAL_FORMATADO =
  "Token de acesso mal formatado. Use o formato: Authorization: Bearer <token>.";
const MSG_INVALIDO =
  "Token de acesso inválido ou sessão encerrada. Faça login novamente.";
const MSG_ID_INVALIDO =
  "O id do usuário na URL deve ser um número inteiro positivo.";
const MSG_POSSE_USUARIO =
  "Você não tem permissão para acessar os dados de outro usuário.";
const MSG_POSSE_SESSAO = "Você não tem permissão para encerrar esta sessão.";

const codificador = new TextEncoder();

function paraBase64Url(texto: string): string {
  return btoa(String.fromCharCode(...codificador.encode(texto)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
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

interface Cenario {
  app: ReturnType<typeof criarAplicacaoDeTeste>;
  conexao: ConexaoBanco;
  usuarioA: number;
  usuarioB: number;
  sessaoA1: string;
  sessaoA2: string;
  sessaoB1: string;
  tokenA1: string;
  tokenA2: string;
  tokenB1: string;
}

function criarAplicacaoDeTeste(conexao: ConexaoBanco) {
  const app = criarAplicacao({ conexao, segredoJwt: SEGREDO_TESTE });

  app.get("/api/v1/teste-usuario/:id", exigirAutenticacao, (c) => {
    const posse = verificarPosseUsuario(c, c.req.param("id"));
    if (!posse.ok) {
      return posse.resposta;
    }
    return c.json({
      usuarioId: c.get("usuarioAutenticado").id,
      sessaoId: c.get("sessaoAutenticada").id,
      idVerificado: posse.id,
    });
  });

  app.delete("/api/v1/teste-sessao/:id", exigirAutenticacao, (c) => {
    const posse = verificarPosseSessao(c, c.req.param("id"));
    if (!posse.ok) {
      return posse.resposta;
    }
    return c.json({ sessaoVerificada: posse.sessao.id });
  });

  return app;
}

async function comCenario(
  teste: (cenario: Cenario) => Promise<void>,
): Promise<void> {
  const caminho = criarCaminhoBancoTemporario();
  const conexao = abrirConexao(caminho);
  try {
    executarMigracoes(conexao);
    const usuarioA = criarUsuario(conexao, {
      nome: "Usuario A",
      email: "a@exemplo.com",
      senhaHash: "hash",
      senhaSalt: "salt",
    }).id;
    const usuarioB = criarUsuario(conexao, {
      nome: "Usuario B",
      email: "b@exemplo.com",
      senhaHash: "hash",
      senhaSalt: "salt",
    }).id;
    const sessaoA1 = criarSessao(conexao, usuarioA).id;
    const sessaoA2 = criarSessao(conexao, usuarioA).id;
    const sessaoB1 = criarSessao(conexao, usuarioB).id;
    await teste({
      app: criarAplicacaoDeTeste(conexao),
      conexao,
      usuarioA,
      usuarioB,
      sessaoA1,
      sessaoA2,
      sessaoB1,
      tokenA1: await gerarTokenJwt(
        { usuarioId: usuarioA, sessaoId: sessaoA1 },
        SEGREDO_TESTE,
      ),
      tokenA2: await gerarTokenJwt(
        { usuarioId: usuarioA, sessaoId: sessaoA2 },
        SEGREDO_TESTE,
      ),
      tokenB1: await gerarTokenJwt(
        { usuarioId: usuarioB, sessaoId: sessaoB1 },
        SEGREDO_TESTE,
      ),
    });
  } finally {
    fecharConexao(conexao);
    removerBancoTemporario(caminho);
  }
}

async function conferirErro(
  resposta: Response,
  status: number,
  mensagem: string,
  tokenEnviado?: string,
): Promise<void> {
  assertEquals(resposta.status, status);
  conferirCors(resposta.headers);
  const texto = await resposta.text();
  assertEquals(JSON.parse(texto), { mensagem });
  if (tokenEnviado !== undefined && tokenEnviado.length > 3) {
    assertEquals(texto.includes(tokenEnviado), false);
  }
}

function pedirUsuario(
  cenario: Cenario,
  id: number | string,
  autorizacao?: string,
): Response | Promise<Response> {
  const headers: Record<string, string> = {};
  if (autorizacao !== undefined) {
    headers.Authorization = autorizacao;
  }
  return cenario.app.request(`/api/v1/teste-usuario/${id}`, { headers });
}

function pedirSessao(
  cenario: Cenario,
  id: string,
  autorizacao?: string,
): Response | Promise<Response> {
  const headers: Record<string, string> = {};
  if (autorizacao !== undefined) {
    headers.Authorization = autorizacao;
  }
  return cenario.app.request(`/api/v1/teste-sessao/${id}`, {
    method: "DELETE",
    headers,
  });
}

Deno.test("sem cabeçalho Authorization retorna 401 de token ausente", async () => {
  await comCenario(async (c) => {
    await conferirErro(await pedirUsuario(c, c.usuarioA), 401, MSG_AUSENTE);
  });
});

Deno.test("cabeçalho Authorization vazio retorna 401 de token ausente", async () => {
  await comCenario(async (c) => {
    await conferirErro(await pedirUsuario(c, c.usuarioA, ""), 401, MSG_AUSENTE);
  });
});

Deno.test("cabeçalhos mal formatados retornam 401 de mal formatado", async () => {
  await comCenario(async (c) => {
    const valores = [
      "Bearer",
      "Bearer ",
      `Bearer  ${c.tokenA1}`,
      `bearer ${c.tokenA1}`,
      `BEARER ${c.tokenA1}`,
      `Token ${c.tokenA1}`,
      "Basic abc",
      "Bearer abc def",
      c.tokenA1,
    ];
    for (const valor of valores) {
      await conferirErro(
        await pedirUsuario(c, c.usuarioA, valor),
        401,
        MSG_MAL_FORMATADO,
        c.tokenA1,
      );
    }
  });
});

Deno.test("Bearer abc retorna 401 de token inválido", async () => {
  await comCenario(async (c) => {
    await conferirErro(
      await pedirUsuario(c, c.usuarioA, "Bearer abc"),
      401,
      MSG_INVALIDO,
    );
  });
});

Deno.test("token assinado com outro segredo retorna 401", async () => {
  await comCenario(async (c) => {
    const token = await gerarTokenJwt(
      { usuarioId: c.usuarioA, sessaoId: c.sessaoA1 },
      "b".repeat(128),
    );
    await conferirErro(
      await pedirUsuario(c, c.usuarioA, `Bearer ${token}`),
      401,
      MSG_INVALIDO,
      token,
    );
  });
});

Deno.test("token com alg none retorna 401", async () => {
  await comCenario(async (c) => {
    const token = `${
      paraBase64Url(JSON.stringify({ alg: "none", typ: "JWT" }))
    }.${
      paraBase64Url(
        JSON.stringify({
          sub: String(c.usuarioA),
          sid: c.sessaoA1,
          iat: Math.floor(Date.now() / 1000),
        }),
      )
    }.`;
    await conferirErro(
      await pedirUsuario(c, c.usuarioA, `Bearer ${token}`),
      401,
      MSG_INVALIDO,
      token,
    );
  });
});

Deno.test("token de sessão excluída retorna 401", async () => {
  await comCenario(async (c) => {
    excluirSessao(c.conexao, c.sessaoA1);
    await conferirErro(
      await pedirUsuario(c, c.usuarioA, `Bearer ${c.tokenA1}`),
      401,
      MSG_INVALIDO,
      c.tokenA1,
    );
  });
});

Deno.test("token de usuário excluído retorna 401", async () => {
  await comCenario(async (c) => {
    excluirUsuario(c.conexao, c.usuarioA);
    await conferirErro(
      await pedirUsuario(c, c.usuarioA, `Bearer ${c.tokenA1}`),
      401,
      MSG_INVALIDO,
      c.tokenA1,
    );
  });
});

Deno.test("token com sub de A e sid de B1 retorna 401", async () => {
  await comCenario(async (c) => {
    const token = await gerarTokenJwt(
      { usuarioId: c.usuarioA, sessaoId: c.sessaoB1 },
      SEGREDO_TESTE,
    );
    await conferirErro(
      await pedirUsuario(c, c.usuarioA, `Bearer ${token}`),
      401,
      MSG_INVALIDO,
      token,
    );
  });
});

Deno.test("token com sub e sid inexistentes retorna 401", async () => {
  await comCenario(async (c) => {
    const token = await gerarTokenJwt(
      { usuarioId: 999999, sessaoId: crypto.randomUUID() },
      SEGREDO_TESTE,
    );
    await conferirErro(
      await pedirUsuario(c, 999999, `Bearer ${token}`),
      401,
      MSG_INVALIDO,
      token,
    );
  });
});

Deno.test("token válido de A1 acessa o próprio usuário com 200", async () => {
  await comCenario(async (c) => {
    const resposta = await pedirUsuario(c, c.usuarioA, `Bearer ${c.tokenA1}`);
    assertEquals(resposta.status, 200);
    assertEquals(await resposta.json(), {
      usuarioId: c.usuarioA,
      sessaoId: c.sessaoA1,
      idVerificado: c.usuarioA,
    });
  });
});

Deno.test("id de usuário inválido com token válido retorna 400", async () => {
  await comCenario(async (c) => {
    for (const id of ["abc", "0", "-1", "1.5"]) {
      await conferirErro(
        await pedirUsuario(c, id, `Bearer ${c.tokenA1}`),
        400,
        MSG_ID_INVALIDO,
        c.tokenA1,
      );
    }
  });
});

Deno.test("id de outro usuário retorna 403", async () => {
  await comCenario(async (c) => {
    await conferirErro(
      await pedirUsuario(c, c.usuarioB, `Bearer ${c.tokenA1}`),
      403,
      MSG_POSSE_USUARIO,
      c.tokenA1,
    );
  });
});

Deno.test("id inexistente retorna 403 porque a posse vem antes da existência", async () => {
  await comCenario(async (c) => {
    await conferirErro(
      await pedirUsuario(c, 999999, `Bearer ${c.tokenA1}`),
      403,
      MSG_POSSE_USUARIO,
      c.tokenA1,
    );
  });
});

Deno.test("ordem de validação: 401, depois 400, depois 403", async () => {
  await comCenario(async (c) => {
    await conferirErro(
      await pedirUsuario(c, "abc", "Bearer abc"),
      401,
      MSG_INVALIDO,
    );
    await conferirErro(
      await pedirUsuario(c, "abc", `Bearer ${c.tokenA1}`),
      400,
      MSG_ID_INVALIDO,
    );
    await conferirErro(
      await pedirUsuario(c, c.usuarioB, `Bearer ${c.tokenA1}`),
      403,
      MSG_POSSE_USUARIO,
    );
  });
});

Deno.test("A1 encerra a sessão A2 do mesmo usuário com 200", async () => {
  await comCenario(async (c) => {
    const resposta = await pedirSessao(c, c.sessaoA2, `Bearer ${c.tokenA1}`);
    assertEquals(resposta.status, 200);
    assertEquals(await resposta.json(), { sessaoVerificada: c.sessaoA2 });
  });
});

Deno.test("A1 encerra a própria sessão com 200", async () => {
  await comCenario(async (c) => {
    const resposta = await pedirSessao(c, c.sessaoA1, `Bearer ${c.tokenA1}`);
    assertEquals(resposta.status, 200);
    assertEquals(await resposta.json(), { sessaoVerificada: c.sessaoA1 });
  });
});

Deno.test("A1 tentando encerrar a sessão B1 retorna 403", async () => {
  await comCenario(async (c) => {
    await conferirErro(
      await pedirSessao(c, c.sessaoB1, `Bearer ${c.tokenA1}`),
      403,
      MSG_POSSE_SESSAO,
      c.tokenA1,
    );
  });
});

Deno.test("A1 tentando encerrar sessão inexistente retorna 403", async () => {
  await comCenario(async (c) => {
    await conferirErro(
      await pedirSessao(c, crypto.randomUUID(), `Bearer ${c.tokenA1}`),
      403,
      MSG_POSSE_SESSAO,
      c.tokenA1,
    );
  });
});

Deno.test("encerrar A1 invalida só o token de A1 e mantém o de A2", async () => {
  await comCenario(async (c) => {
    excluirSessao(c.conexao, c.sessaoA1);
    await conferirErro(
      await pedirUsuario(c, c.usuarioA, `Bearer ${c.tokenA1}`),
      401,
      MSG_INVALIDO,
      c.tokenA1,
    );
    const resposta = await pedirUsuario(c, c.usuarioA, `Bearer ${c.tokenA2}`);
    assertEquals(resposta.status, 200);
    await resposta.json();
  });
});

Deno.test("OPTIONS sem token retorna 204 com CORS nas duas rotas", async () => {
  await comCenario(async (c) => {
    const respostas = [
      await c.app.request(`/api/v1/teste-usuario/${c.usuarioA}`, {
        method: "OPTIONS",
      }),
      await c.app.request(`/api/v1/teste-sessao/${c.sessaoA1}`, {
        method: "OPTIONS",
      }),
    ];
    for (const resposta of respostas) {
      assertEquals(resposta.status, 204);
      conferirCors(resposta.headers);
      assertEquals(await resposta.text(), "");
    }
  });
});

Deno.test("claims extras em token válido são ignoradas", async () => {
  await comCenario(async (c) => {
    const token = await sign(
      {
        sub: String(c.usuarioA),
        sid: c.sessaoA1,
        iat: Math.floor(Date.now() / 1000),
        papel: "administrador",
      },
      SEGREDO_TESTE,
      "HS256",
    );
    const resposta = await pedirUsuario(c, c.usuarioA, `Bearer ${token}`);
    assert(resposta.status === 200);
    await resposta.json();
  });
});
