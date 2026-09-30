import "./auxiliares/vigia-arquivos-reais.ts";
import { assert, assertEquals, assertNotEquals } from "@std/assert";
import { abrirConexao, fecharConexao } from "../src/banco/conexao.ts";
import {
  verificarCors,
  verificarRespostaErro,
  verificarRespostaSessao,
  verificarRespostaUsuario,
  verificarRespostaVazia,
  verificarSemDadosSensiveis,
} from "./auxiliares/conformidade.ts";
import {
  iniciarServidorDeTeste,
  requisitar,
} from "./auxiliares/servidor-teste.ts";
import type { ServidorDeTeste } from "./auxiliares/servidor-teste.ts";

const API = "/api/v1";
const MSG_CREDENCIAIS = "E-mail ou senha inválidos.";
const MSG_TOKEN_INVALIDO =
  "Token de acesso inválido ou sessão encerrada. Faça login novamente.";
const MSG_METODO = "Método não permitido nesta rota.";
const MSG_NAO_ENCONTRADA = "Rota não encontrada.";
const ALLOW_USUARIOS_SESSOES = "POST, OPTIONS";
const ALLOW_USUARIO_ID = "GET, HEAD, PUT, PATCH, DELETE, OPTIONS";
const ALLOW_SESSAO_ID = "DELETE, OPTIONS";

async function comServidor(
  teste: (servidor: ServidorDeTeste) => Promise<void>,
): Promise<void> {
  const servidor = await iniciarServidorDeTeste();
  try {
    await teste(servidor);
  } finally {
    await servidor.encerrar();
  }
}

interface ContaCriada {
  id: number;
  email: string;
  senha: string;
  token: string;
  sessaoId: string;
}

async function criarConta(
  servidor: ServidorDeTeste,
  email: string,
  senha = "senha123",
  nome = "Ana Souza",
): Promise<ContaCriada> {
  const cadastro = await requisitar(servidor, "POST", `${API}/users`, {
    corpo: { nome, email, senha },
  });
  const usuario = await verificarRespostaUsuario(cadastro, 201);
  const sessao = await requisitar(servidor, "POST", `${API}/sessions`, {
    corpo: { email, senha },
  });
  const lida = await verificarRespostaSessao(sessao);
  return {
    id: usuario.corpo.id,
    email,
    senha,
    token: lida.corpo.token,
    sessaoId: lida.corpo.id,
  };
}

Deno.test("fluxo completo da EP-1 por HTTP real", async () => {
  await comServidor(async (servidor) => {
    const textos: string[] = [];
    const senhaAntiga = "SenhaAntiga123";
    const senhaNova = "SenhaNova456";

    const cadastro = await requisitar(servidor, "POST", `${API}/users`, {
      corpo: {
        nome: "Ana Souza",
        email: "ana@exemplo.com",
        senha: senhaAntiga,
      },
    });
    const a = await verificarRespostaUsuario(cadastro, 201, {
      nome: "Ana Souza",
      email: "ana@exemplo.com",
    });
    textos.push(a.texto);
    assertEquals(
      cadastro.headers.get("Location"),
      `${API}/users/${a.corpo.id}`,
    );
    const id = a.corpo.id;

    const login1 = await requisitar(servidor, "POST", `${API}/sessions`, {
      corpo: { email: "ana@exemplo.com", senha: senhaAntiga },
    });
    const sessao1 = await verificarRespostaSessao(login1);
    textos.push(sessao1.texto);
    assertEquals(sessao1.corpo.usuario, {
      id,
      nome: "Ana Souza",
      email: "ana@exemplo.com",
    });
    const token1 = sessao1.corpo.token;

    const leitura = await verificarRespostaUsuario(
      await requisitar(servidor, "GET", `${API}/users/${id}`, {
        token: token1,
      }),
      200,
      { id, nome: "Ana Souza", email: "ana@exemplo.com" },
    );
    textos.push(leitura.texto);

    const patch = await verificarRespostaUsuario(
      await requisitar(servidor, "PATCH", `${API}/users/${id}`, {
        token: token1,
        corpo: { nome: "Ana Maria" },
      }),
      200,
      { id, nome: "Ana Maria", email: "ana@exemplo.com" },
    );
    textos.push(patch.texto);

    const put = await verificarRespostaUsuario(
      await requisitar(servidor, "PUT", `${API}/users/${id}`, {
        token: token1,
        corpo: {
          nome: "Ana Maria Souza",
          email: "ana@exemplo.com",
          senha: senhaNova,
        },
      }),
      200,
      { id, nome: "Ana Maria Souza", email: "ana@exemplo.com" },
    );
    textos.push(put.texto);

    const loginAntiga = await verificarRespostaErro(
      await requisitar(servidor, "POST", `${API}/sessions`, {
        corpo: { email: "ana@exemplo.com", senha: senhaAntiga },
      }),
      401,
      MSG_CREDENCIAIS,
    );
    textos.push(loginAntiga.texto);

    const sessao2 = await verificarRespostaSessao(
      await requisitar(servidor, "POST", `${API}/sessions`, {
        corpo: { email: "ana@exemplo.com", senha: senhaNova },
      }),
    );
    textos.push(sessao2.texto);
    const token2 = sessao2.corpo.token;
    assertNotEquals(sessao2.corpo.id, sessao1.corpo.id);

    const logout = await verificarRespostaVazia(
      await requisitar(
        servidor,
        "DELETE",
        `${API}/sessions/${sessao1.corpo.id}`,
        {
          token: token1,
        },
      ),
    );
    textos.push(logout.texto);

    const leituraEncerrada = await verificarRespostaErro(
      await requisitar(servidor, "GET", `${API}/users/${id}`, {
        token: token1,
      }),
      401,
      MSG_TOKEN_INVALIDO,
    );
    textos.push(leituraEncerrada.texto);

    const sessao3 = await verificarRespostaSessao(
      await requisitar(servidor, "POST", `${API}/sessions`, {
        corpo: { email: "ana@exemplo.com", senha: senhaNova },
      }),
    );
    textos.push(sessao3.texto);

    const exclusao = await verificarRespostaVazia(
      await requisitar(servidor, "DELETE", `${API}/users/${id}`, {
        token: sessao3.corpo.token,
      }),
    );
    textos.push(exclusao.texto);

    const leituraAposExclusao = await verificarRespostaErro(
      await requisitar(servidor, "GET", `${API}/users/${id}`, {
        token: token2,
      }),
      401,
      MSG_TOKEN_INVALIDO,
    );
    textos.push(leituraAposExclusao.texto);

    const loginAposExclusao = await verificarRespostaErro(
      await requisitar(servidor, "POST", `${API}/sessions`, {
        corpo: { email: "ana@exemplo.com", senha: senhaNova },
      }),
      401,
      MSG_CREDENCIAIS,
    );
    textos.push(loginAposExclusao.texto);

    for (const texto of textos) {
      verificarSemDadosSensiveis(texto, [senhaAntiga, senhaNova]);
    }
  });
});

Deno.test("matriz de 405 com Allow exato, com e sem token", async () => {
  await comServidor(async (servidor) => {
    const conta = await criarConta(servidor, "ana@exemplo.com");
    const matriz: [string, string[], string][] = [
      ["/users", ["GET", "PUT", "PATCH", "DELETE"], ALLOW_USUARIOS_SESSOES],
      ["/sessions", ["GET", "PUT", "PATCH", "DELETE"], ALLOW_USUARIOS_SESSOES],
      ["/users/1", ["POST"], ALLOW_USUARIO_ID],
      [
        "/sessions/qualquer-id",
        ["GET", "POST", "PUT", "PATCH"],
        ALLOW_SESSAO_ID,
      ],
    ];
    for (const [caminho, metodos, allow] of matriz) {
      for (const metodo of metodos) {
        for (const token of [undefined, conta.token]) {
          const resposta = await requisitar(
            servidor,
            metodo,
            `${API}${caminho}`,
            {
              token,
            },
          );
          assertEquals(resposta.headers.get("Allow"), allow);
          await verificarRespostaErro(resposta, 405, MSG_METODO);
        }
      }
    }
  });
});

Deno.test("caminhos desconhecidos retornam 404 com ErroResponse e CORS", async () => {
  await comServidor(async (servidor) => {
    for (
      const caminho of [
        "/api/v1",
        "/api/v1/produtos",
        "/api/v1/users/1/extra",
        "/api/v2/users",
        "/",
      ]
    ) {
      await verificarRespostaErro(
        await requisitar(servidor, "GET", caminho),
        404,
        MSG_NAO_ENCONTRADA,
      );
    }
  });
});

Deno.test("preflight OPTIONS de navegador retorna 204 sem token", async () => {
  await comServidor(async (servidor) => {
    for (
      const caminho of [
        "/api/v1/users",
        "/api/v1/users/1",
        "/api/v1/sessions",
        "/api/v1/sessions/qualquer-id",
        "/api/v1/desconhecido",
      ]
    ) {
      const resposta = await requisitar(servidor, "OPTIONS", caminho, {
        cabecalhos: {
          Origin: "http://exemplo.com",
          "Access-Control-Request-Method": "PATCH",
          "Access-Control-Request-Headers": "authorization, content-type",
        },
      });
      await verificarRespostaVazia(resposta);
      verificarCors(resposta);
    }
  });
});

Deno.test("todas as rotas funcionam com barra final", async () => {
  await comServidor(async (servidor) => {
    const cadastro = await requisitar(servidor, "POST", `${API}/users/`, {
      corpo: { nome: "Ana Souza", email: "ana@exemplo.com", senha: "senha123" },
    });
    const { corpo: usuario } = await verificarRespostaUsuario(cadastro, 201);
    const id = usuario.id;

    const login = await verificarRespostaSessao(
      await requisitar(servidor, "POST", `${API}/sessions/`, {
        corpo: { email: "ana@exemplo.com", senha: "senha123" },
      }),
    );
    const token = login.corpo.token;

    await verificarRespostaUsuario(
      await requisitar(servidor, "GET", `${API}/users/${id}/`, { token }),
      200,
    );
    await verificarRespostaUsuario(
      await requisitar(servidor, "PUT", `${API}/users/${id}/`, {
        token,
        corpo: {
          nome: "Ana Souza",
          email: "ana@exemplo.com",
          senha: "senha123",
        },
      }),
      200,
    );
    await verificarRespostaUsuario(
      await requisitar(servidor, "PATCH", `${API}/users/${id}/`, {
        token,
        corpo: { nome: "Ana Maria" },
      }),
      200,
    );
    await verificarRespostaVazia(
      await requisitar(
        servidor,
        "DELETE",
        `${API}/sessions/${login.corpo.id}/`,
        {
          token,
        },
      ),
    );

    const novoLogin = await verificarRespostaSessao(
      await requisitar(servidor, "POST", `${API}/sessions`, {
        corpo: { email: "ana@exemplo.com", senha: "senha123" },
      }),
    );
    await verificarRespostaVazia(
      await requisitar(servidor, "DELETE", `${API}/users/${id}/`, {
        token: novoLogin.corpo.token,
      }),
    );
  });
});

const VARIANTES_CONTENT_TYPE: [string, Record<string, string>][] = [
  ["com charset", { "Content-Type": "application/json; charset=utf-8" }],
  ["sem Content-Type", {}],
  ["text/plain", { "Content-Type": "text/plain" }],
];

Deno.test("Content-Type com charset, ausente ou text/plain é aceito", async () => {
  await comServidor(async (servidor) => {
    let indice = 0;
    for (const [, cabecalhos] of VARIANTES_CONTENT_TYPE) {
      indice += 1;
      const email = `ana${indice}@exemplo.com`;
      const cadastro = await requisitar(servidor, "POST", `${API}/users`, {
        cabecalhos,
        corpo: { nome: "Ana Souza", email, senha: "senha123" },
      });
      const { corpo: usuario } = await verificarRespostaUsuario(cadastro, 201);

      const login = await requisitar(servidor, "POST", `${API}/sessions`, {
        cabecalhos,
        corpo: { email, senha: "senha123" },
      });
      const sessao = await verificarRespostaSessao(login);
      const token = sessao.corpo.token;

      await verificarRespostaUsuario(
        await requisitar(servidor, "PUT", `${API}/users/${usuario.id}`, {
          token,
          cabecalhos,
          corpo: { nome: "Ana Maria", email, senha: "senha123" },
        }),
        200,
        { nome: "Ana Maria" },
      );
      await verificarRespostaUsuario(
        await requisitar(servidor, "PATCH", `${API}/users/${usuario.id}`, {
          token,
          cabecalhos,
          corpo: { nome: "Ana Patch" },
        }),
        200,
        { nome: "Ana Patch" },
      );
    }
  });
});

Deno.test("campos desconhecidos são ignorados e id e papel não têm efeito", async () => {
  await comServidor(async (servidor) => {
    const cadastro = await requisitar(servidor, "POST", `${API}/users`, {
      corpo: {
        id: 999,
        papel: "administrador",
        extra: { a: 1 },
        nome: "Ana Souza",
        email: "ana@exemplo.com",
        senha: "senha123",
      },
    });
    const { corpo: usuario } = await verificarRespostaUsuario(cadastro, 201);
    assertNotEquals(usuario.id, 999);

    const login = await requisitar(servidor, "POST", `${API}/sessions`, {
      corpo: { email: "ana@exemplo.com", senha: "senha123", nome: "Outro" },
    });
    const sessao = await verificarRespostaSessao(login);
    const token = sessao.corpo.token;

    await verificarRespostaUsuario(
      await requisitar(servidor, "PUT", `${API}/users/${usuario.id}`, {
        token,
        corpo: {
          id: 999,
          papel: "administrador",
          nome: "Ana Souza",
          email: "ana@exemplo.com",
          senha: "senha123",
        },
      }),
      200,
      { id: usuario.id },
    );
    await verificarRespostaUsuario(
      await requisitar(servidor, "PATCH", `${API}/users/${usuario.id}`, {
        token,
        corpo: { id: 999, papel: "administrador", nome: "Ana Patch" },
      }),
      200,
      { id: usuario.id, nome: "Ana Patch" },
    );

    const conexao = abrirConexao(servidor.caminhoBanco);
    try {
      const linhas = conexao
        .prepare("SELECT id, papel FROM usuarios;")
        .all() as { id: number; papel: string }[];
      assertEquals(linhas, [{ id: usuario.id, papel: "comum" }]);
    } finally {
      fecharConexao(conexao);
    }
  });
});

Deno.test("nome com acentos e emoji é gravado e devolvido igual em UTF-8", async () => {
  await comServidor(async (servidor) => {
    const nome = "José Açaí 😀";
    const cadastro = await requisitar(servidor, "POST", `${API}/users`, {
      corpo: { nome, email: "jose@exemplo.com", senha: "senha123" },
    });
    const { corpo: usuario } = await verificarRespostaUsuario(cadastro, 201, {
      nome,
    });
    const login = await verificarRespostaSessao(
      await requisitar(servidor, "POST", `${API}/sessions`, {
        corpo: { email: "jose@exemplo.com", senha: "senha123" },
      }),
    );
    assertEquals(login.corpo.usuario.nome, nome);
    await verificarRespostaUsuario(
      await requisitar(servidor, "GET", `${API}/users/${usuario.id}`, {
        token: login.corpo.token,
      }),
      200,
      { nome },
    );
  });
});

Deno.test("entradas hostis nunca derrubam o servidor nem geram 500", async () => {
  await comServidor(async (servidor) => {
    const conta = await criarConta(servidor, "ana@exemplo.com");
    const profundo = "[".repeat(5000) + "]".repeat(5000);
    const profundoEmCampo =
      `{"nome":${profundo},"email":"a@b.co","senha":"123"}`;
    const umMegabyte = JSON.stringify({ lixo: "a".repeat(1024 * 1024) });
    const invalidos = new Uint8Array([
      0xff,
      0xfe,
      0x00,
      0x80,
      0xc3,
      0x28,
      0x7b,
    ]);

    for (const caminho of ["/users", "/sessions"]) {
      for (const corpo of [invalidos, profundo, profundoEmCampo, umMegabyte]) {
        const resposta = await requisitar(
          servidor,
          "POST",
          `${API}${caminho}`,
          {
            corpo,
          },
        );
        assertNotEquals(resposta.status, 500);
        await verificarRespostaErro(resposta, 400);
      }
    }

    for (const metodo of ["PUT", "PATCH"]) {
      for (const corpo of [invalidos, profundo, umMegabyte]) {
        const resposta = await requisitar(
          servidor,
          metodo,
          `${API}/users/${conta.id}`,
          { token: conta.token, corpo },
        );
        assertNotEquals(resposta.status, 500);
        await verificarRespostaErro(resposta, 400);
      }
    }

    const cadastroGrande = await requisitar(servidor, "POST", `${API}/users`, {
      corpo: JSON.stringify({
        nome: "Bruno Lima",
        email: "bruno@exemplo.com",
        senha: "senha123",
        lixo: "a".repeat(1024 * 1024),
      }),
    });
    await verificarRespostaUsuario(cadastroGrande, 201, { nome: "Bruno Lima" });

    const idGigante = "9".repeat(1000);
    await verificarRespostaErro(
      await requisitar(servidor, "GET", `${API}/users/${idGigante}`, {
        token: conta.token,
      }),
      400,
    );

    await verificarRespostaErro(
      await requisitar(servidor, "GET", `${API}/users/${conta.id}`, {
        cabecalhos: { Authorization: `Bearer ${"a".repeat(10000)}` },
      }),
      401,
    );
    await verificarRespostaErro(
      await requisitar(servidor, "GET", `${API}/users/${conta.id}`, {
        cabecalhos: { Authorization: "x".repeat(10000) },
      }),
      401,
    );

    await verificarRespostaUsuario(
      await requisitar(servidor, "GET", `${API}/users/${conta.id}`, {
        token: conta.token,
      }),
      200,
      { id: conta.id },
    );

    const falhas = servidor.registros.filter(
      (registro) =>
        registro.tipo === "sistema" &&
        (registro.nivel === "erro" ||
          registro.mensagem.includes("substituída")),
    );
    assertEquals(falhas, []);
    const erros500 = servidor.registros.filter(
      (registro) => registro.tipo === "requisicao" && registro.status === 500,
    );
    assertEquals(erros500.length, 0);
    assert(
      servidor.registros.some((registro) => registro.tipo === "requisicao"),
    );
  });
});
