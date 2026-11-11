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
import {
  criarCaminhoBancoTemporario,
  removerBancoTemporario,
} from "./auxiliares/banco-temporario.ts";
import { SEGREDO_TESTE } from "./auxiliares/segredo-temporario.ts";
import {
  iniciarServidorDeTeste,
  requisitar,
} from "./auxiliares/servidor-teste.ts";
import type { ServidorDeTeste } from "./auxiliares/servidor-teste.ts";

type Aplicacao = ReturnType<typeof criarAplicacao>;

const API = "/api/v1";
const JSON_CT = "application/json; charset=utf-8";
const MSG_TOKEN_AUSENTE = "Token de acesso ausente. Faça login para continuar.";
const MSG_TOKEN_INVALIDO =
  "Token de acesso inválido ou sessão encerrada. Faça login novamente.";
const MSG_SESSAO = "Você não tem permissão para encerrar esta sessão.";
const MSG_METODO = "Método não permitido nesta rota.";
const MSG_ROTA = "Rota não encontrada.";
const ID_LONGO = "x".repeat(10001);
const IDS_ESTRANHOS = [
  "%",
  "%E0%A4%A",
  "%zz",
  "%C3%A9",
  "sess%C3%A3o",
  "%F0%9F%98%80",
  "%20",
  "a%20b",
  "%00",
  "%2F",
  "..x",
  "...",
  "null",
  "undefined",
  "0",
  "-1",
  "abc",
  "9f1c2e3a-4b5d-4a6f-8c7e-1a2b3c4d5e6f",
  "%27%20OR%201%3D1%20--",
  ID_LONGO,
];

interface Conta {
  id: number;
  token: string;
  sessaoId: string;
}

interface RespostaLida {
  status: number;
  cabecalhos: Headers;
  texto: string;
  corpo: unknown;
}

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function conferirCors(cabecalhos: Headers): void {
  assertEquals(cabecalhos.get("Access-Control-Allow-Origin"), "*");
  assertEquals(
    cabecalhos.get("Access-Control-Allow-Methods"),
    "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  );
  assertEquals(
    cabecalhos.get("Access-Control-Allow-Headers"),
    "Content-Type, Authorization",
  );
}

async function ler(resposta: Response): Promise<RespostaLida> {
  conferirCors(resposta.headers);
  const texto = await resposta.text();
  assertEquals(texto.toLowerCase().includes("papel"), false);
  return {
    status: resposta.status,
    cabecalhos: resposta.headers,
    texto,
    corpo: texto === "" ? null : JSON.parse(texto),
  };
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
    corpo = JSON.stringify(opcoes.corpo);
  }
  return await ler(
    await app.request(caminho, {
      method: metodo,
      headers: cabecalhos,
      body: corpo,
    }),
  );
}

function conferirErro(
  resposta: RespostaLida,
  status: number,
  mensagem: string,
): void {
  assertEquals(resposta.status, status);
  assertEquals(resposta.cabecalhos.get("Content-Type"), JSON_CT);
  assertEquals(resposta.corpo, { mensagem });
}

function conferirVazia(resposta: RespostaLida): void {
  assertEquals(resposta.status, 204);
  assertEquals(resposta.texto, "");
  assertEquals(resposta.cabecalhos.get("Content-Type"), null);
}

async function logar(
  app: Aplicacao,
  email: string,
  senha: string,
): Promise<Conta> {
  const resposta = await enviar(app, "POST", `${API}/sessions`, {
    corpo: { email, senha },
  });
  assertEquals(resposta.status, 201);
  assert(ehObjeto(resposta.corpo));
  const { id, token, usuario } = resposta.corpo;
  assert(typeof id === "string" && typeof token === "string");
  assert(ehObjeto(usuario) && typeof usuario.id === "number");
  return { id: usuario.id, token, sessaoId: id };
}

async function criarConta(app: Aplicacao, email: string): Promise<Conta> {
  const cadastro = await enviar(app, "POST", `${API}/users`, {
    corpo: { nome: "Pessoa Teste", email, senha: "senha123" },
  });
  assertEquals(cadastro.status, 201);
  return await logar(app, email, "senha123");
}

async function comApp(
  teste: (
    app: Aplicacao,
    conexao: ConexaoBanco,
    contas: { adm: Conta; ana: Conta; bruno: Conta },
  ) => Promise<void>,
): Promise<void> {
  const caminho = criarCaminhoBancoTemporario();
  const conexao = abrirConexao(caminho);
  try {
    executarMigracoes(conexao);
    await garantirAdmPadrao(conexao, () => {});
    const app = criarAplicacao({ conexao, segredoJwt: SEGREDO_TESTE });
    const adm = await logar(app, EMAIL_ADM_PADRAO, SENHA_ADM_PADRAO);
    const ana = await criarConta(app, "ana@exemplo.com");
    const bruno = await criarConta(app, "bruno@exemplo.com");
    await teste(app, conexao, { adm, ana, bruno });
  } finally {
    fecharConexao(conexao);
    removerBancoTemporario(caminho);
  }
}

function sessaoExiste(conexao: ConexaoBanco, id: string): boolean {
  return conexao.prepare("SELECT 1 FROM sessoes WHERE id = ?;").get(id) !==
    undefined;
}

function contarSessoes(conexao: ConexaoBanco): number {
  const linha = conexao.prepare("SELECT COUNT(*) AS total FROM sessoes;")
    .get() as { total: number };
  return linha.total;
}

function adulterar(token: string): string {
  const [cabecalho, carga, assinatura] = token.split(".");
  const primeiro = assinatura[0] === "A" ? "B" : "A";
  return `${cabecalho}.${carga}.${primeiro}${assinatura.slice(1)}`;
}

function caminhoSessao(id: string): string {
  return `${API}/sessions/${id}`;
}

function codificarTudo(texto: string): string {
  return Array.from(new TextEncoder().encode(texto))
    .map((byte) => `%${byte.toString(16).toUpperCase().padStart(2, "0")}`)
    .join("");
}

Deno.test("logout da própria sessão: 204 sem corpo, token passa a dar 401 e repetir dá 401", async () => {
  await comApp(async (app, conexao, { ana }) => {
    conferirVazia(
      await enviar(app, "DELETE", caminhoSessao(ana.sessaoId), {
        token: ana.token,
      }),
    );
    assertEquals(sessaoExiste(conexao, ana.sessaoId), false);
    conferirErro(
      await enviar(app, "GET", `${API}/users/${ana.id}`, { token: ana.token }),
      401,
      MSG_TOKEN_INVALIDO,
    );
    conferirErro(
      await enviar(app, "DELETE", caminhoSessao(ana.sessaoId), {
        token: ana.token,
      }),
      401,
      MSG_TOKEN_INVALIDO,
    );
  });
});

Deno.test("sessão de outro usuário dá 403 para comum e para ADM, e continua no banco", async () => {
  await comApp(async (app, conexao, { adm, ana, bruno }) => {
    const casos: [Conta, Conta][] = [
      [ana, bruno],
      [adm, ana],
      [adm, bruno],
      [ana, adm],
    ];
    for (const [autenticado, alvo] of casos) {
      conferirErro(
        await enviar(app, "DELETE", caminhoSessao(alvo.sessaoId), {
          token: autenticado.token,
        }),
        403,
        MSG_SESSAO,
      );
      assert(sessaoExiste(conexao, alvo.sessaoId));
    }
    assertEquals(contarSessoes(conexao), 3);
  });
});

Deno.test("ids inexistentes ou estranhos dão 403 com token válido e 401 sem token", async () => {
  await comApp(async (app, conexao, { adm, ana }) => {
    for (const id of IDS_ESTRANHOS) {
      for (const conta of [ana, adm]) {
        conferirErro(
          await enviar(app, "DELETE", caminhoSessao(id), {
            token: conta.token,
          }),
          403,
          MSG_SESSAO,
        );
        conferirErro(
          await enviar(app, "DELETE", caminhoSessao(id), {
            token: adulterar(conta.token),
          }),
          401,
          MSG_TOKEN_INVALIDO,
        );
      }
      conferirErro(
        await enviar(app, "DELETE", caminhoSessao(id)),
        401,
        MSG_TOKEN_AUSENTE,
      );
    }
    assertEquals(contarSessoes(conexao), 3);
  });
});

Deno.test("o próprio id de sessão com percent-encoding equivalente dá 204", async () => {
  await comApp(async (app, conexao, { ana, bruno }) => {
    conferirVazia(
      await enviar(app, "DELETE", caminhoSessao(codificarTudo(ana.sessaoId)), {
        token: ana.token,
      }),
    );
    assertEquals(sessaoExiste(conexao, ana.sessaoId), false);
    const misto = bruno.sessaoId.replaceAll("-", "%2D");
    conferirVazia(
      await enviar(app, "DELETE", caminhoSessao(misto), {
        token: bruno.token,
      }),
    );
    assertEquals(sessaoExiste(conexao, bruno.sessaoId), false);
  });
});

Deno.test("exclusão que não encontra a linha (corrida) dá 403, nunca 404", async () => {
  await comApp(async (app, conexao, { ana }) => {
    assert(/^[0-9a-f-]+$/.test(ana.sessaoId));
    conexao.exec(
      `CREATE TEMP TRIGGER ignorar_exclusao BEFORE DELETE ON sessoes WHEN OLD.id = '${ana.sessaoId}' BEGIN SELECT RAISE(IGNORE); END;`,
    );
    conferirErro(
      await enviar(app, "DELETE", caminhoSessao(ana.sessaoId), {
        token: ana.token,
      }),
      403,
      MSG_SESSAO,
    );
    assert(sessaoExiste(conexao, ana.sessaoId));
    conexao.exec("DROP TRIGGER ignorar_exclusao;");
    conferirVazia(
      await enviar(app, "DELETE", caminhoSessao(ana.sessaoId), {
        token: ana.token,
      }),
    );
  });
});

Deno.test("usuário com duas sessões: encerrar uma não afeta a outra", async () => {
  await comApp(async (app, conexao, { ana }) => {
    const segunda = await logar(app, "ana@exemplo.com", "senha123");
    const terceira = await logar(app, "ana@exemplo.com", "senha123");
    conferirVazia(
      await enviar(app, "DELETE", caminhoSessao(ana.sessaoId), {
        token: ana.token,
      }),
    );
    assert(sessaoExiste(conexao, segunda.sessaoId));
    assertEquals(
      (await enviar(app, "GET", `${API}/users/${ana.id}`, {
        token: segunda.token,
      })).status,
      200,
    );
    conferirErro(
      await enviar(app, "DELETE", caminhoSessao(segunda.sessaoId), {
        token: ana.token,
      }),
      401,
      MSG_TOKEN_INVALIDO,
    );
    assert(sessaoExiste(conexao, segunda.sessaoId));
    conferirVazia(
      await enviar(app, "DELETE", caminhoSessao(terceira.sessaoId), {
        token: segunda.token,
      }),
    );
    assertEquals(sessaoExiste(conexao, terceira.sessaoId), false);
    assert(sessaoExiste(conexao, segunda.sessaoId));
    conferirErro(
      await enviar(app, "DELETE", caminhoSessao(ana.sessaoId), {
        token: segunda.token,
      }),
      403,
      MSG_SESSAO,
    );
  });
});

Deno.test("405 e 404 de /sessions continuam iguais e OPTIONS dá 204", async () => {
  await comApp(async (app, _conexao, { ana }) => {
    for (const metodo of ["GET", "PUT", "PATCH", "POST"]) {
      for (const token of [undefined, ana.token]) {
        const resposta = await enviar(
          app,
          metodo,
          caminhoSessao(ana.sessaoId),
          { token, corpo: metodo === "GET" ? undefined : {} },
        );
        conferirErro(resposta, 405, MSG_METODO);
        assertEquals(resposta.cabecalhos.get("Allow"), "DELETE, OPTIONS");
      }
    }
    for (const token of [undefined, ana.token]) {
      const resposta = await enviar(app, "DELETE", `${API}/sessions`, {
        token,
      });
      conferirErro(resposta, 405, MSG_METODO);
      assertEquals(resposta.cabecalhos.get("Allow"), "POST, OPTIONS");
    }
    conferirErro(
      await enviar(app, "DELETE", `${API}/sessions/${ana.sessaoId}/extra`, {
        token: ana.token,
      }),
      404,
      MSG_ROTA,
    );
    const opcoes = await enviar(app, "OPTIONS", caminhoSessao(ana.sessaoId));
    assertEquals(opcoes.status, 204);
    assertEquals(opcoes.texto, "");
  });
});

async function requisicaoBruta(
  servidor: ServidorDeTeste,
  caminho: string,
  token: string,
): Promise<{ status: number; corpo: string }> {
  const porta = Number(new URL(servidor.origem).port);
  const conexao = await Deno.connect({ hostname: "127.0.0.1", port: porta });
  try {
    await conexao.write(
      new TextEncoder().encode(
        `DELETE ${caminho} HTTP/1.1\r\nHost: 127.0.0.1\r\nAuthorization: Bearer ${token}\r\nConnection: close\r\n\r\n`,
      ),
    );
    const partes: Uint8Array[] = [];
    const buffer = new Uint8Array(65536);
    while (true) {
      const lidos = await conexao.read(buffer);
      if (lidos === null) {
        break;
      }
      partes.push(buffer.slice(0, lidos));
    }
    const total = new Uint8Array(
      partes.reduce((soma, parte) => soma + parte.length, 0),
    );
    let posicao = 0;
    for (const parte of partes) {
      total.set(parte, posicao);
      posicao += parte.length;
    }
    const texto = new TextDecoder().decode(total);
    const status = Number(texto.split(" ")[1]);
    return { status, corpo: texto.slice(texto.indexOf("\r\n\r\n") + 4) };
  } finally {
    conexao.close();
  }
}

function conferirSemFalhas(servidor: ServidorDeTeste): void {
  const respostas500 = servidor.registros.filter(
    (registro) => registro.tipo === "requisicao" && registro.status === 500,
  );
  assertEquals(respostas500.length, 0);
  const erros = servidor.registros.filter(
    (registro) => registro.tipo === "sistema" && registro.nivel === "erro",
  );
  assertEquals(erros, []);
}

async function loginReal(
  servidor: ServidorDeTeste,
  email: string,
  senha: string,
): Promise<Conta> {
  const resposta = await requisitar(servidor, "POST", `${API}/sessions`, {
    corpo: { email, senha },
  });
  assertEquals(resposta.status, 201);
  const corpo = await resposta.json();
  return { id: corpo.usuario.id, token: corpo.token, sessaoId: corpo.id };
}

async function contaReal(
  servidor: ServidorDeTeste,
  email: string,
): Promise<Conta> {
  const cadastro = await requisitar(servidor, "POST", `${API}/users`, {
    corpo: { nome: "Pessoa Teste", email, senha: "senha123" },
  });
  assertEquals(cadastro.status, 201);
  await cadastro.body?.cancel();
  return await loginReal(servidor, email, "senha123");
}

Deno.test("servidor real: ids estranhos e id com mais de 10.000 caracteres dão 403 sem erro de sistema", async () => {
  const servidor = await iniciarServidorDeTeste();
  try {
    const adm = await loginReal(servidor, EMAIL_ADM_PADRAO, SENHA_ADM_PADRAO);
    for (const id of IDS_ESTRANHOS) {
      const resposta = await requisicaoBruta(
        servidor,
        caminhoSessao(id),
        adm.token,
      );
      assertEquals(resposta.status, 403, id.slice(0, 20));
      assertEquals(JSON.parse(resposta.corpo), { mensagem: MSG_SESSAO });
    }
    const longo = await requisitar(
      servidor,
      "DELETE",
      caminhoSessao(ID_LONGO),
      { token: adm.token },
    );
    const lido = await ler(longo);
    assertEquals(lido.status, 403);
    assertEquals(lido.corpo, { mensagem: MSG_SESSAO });
    conferirSemFalhas(servidor);
  } finally {
    await servidor.encerrar();
  }
});

Deno.test("servidor real: segmento '..' é resolvido pela URL e cai no 404 de caminho inexistente", async () => {
  const servidor = await iniciarServidorDeTeste();
  try {
    const adm = await loginReal(servidor, EMAIL_ADM_PADRAO, SENHA_ADM_PADRAO);
    for (const id of ["..", "%2E%2E"]) {
      const resposta = await requisicaoBruta(
        servidor,
        caminhoSessao(id),
        adm.token,
      );
      assertEquals(resposta.status, 404);
      assertEquals(JSON.parse(resposta.corpo), { mensagem: MSG_ROTA });
    }
    conferirSemFalhas(servidor);
  } finally {
    await servidor.encerrar();
  }
});

Deno.test("corrida: dois logouts simultâneos da mesma sessão, um 204 e nenhum 404 ou 500", async () => {
  const servidor = await iniciarServidorDeTeste();
  try {
    for (let rodada = 0; rodada < 8; rodada++) {
      const conta = await contaReal(servidor, `corrida${rodada}@exemplo.com`);
      const respostas = await Promise.all(
        Array.from(
          { length: 3 },
          () =>
            requisitar(servidor, "DELETE", caminhoSessao(conta.sessaoId), {
              token: conta.token,
            }),
        ),
      );
      const status: number[] = [];
      for (const resposta of respostas) {
        const lida = await ler(resposta);
        status.push(lida.status);
        if (lida.status === 204) {
          assertEquals(lida.texto, "");
        } else {
          assert(ehObjeto(lida.corpo));
          assertEquals(Object.keys(lida.corpo), ["mensagem"]);
        }
      }
      assertEquals(status.filter((s) => s === 204).length, 1, `${status}`);
      for (const valor of status) {
        assert([204, 401, 403].includes(valor), `rodada ${rodada}: ${status}`);
      }
    }
    conferirSemFalhas(servidor);
  } finally {
    await servidor.encerrar();
  }
});

Deno.test("corrida: ADM exclui o usuário enquanto ele faz logout, sem nenhum 500", async () => {
  const servidor = await iniciarServidorDeTeste();
  try {
    const adm = await loginReal(servidor, EMAIL_ADM_PADRAO, SENHA_ADM_PADRAO);
    for (let rodada = 0; rodada < 8; rodada++) {
      const conta = await contaReal(servidor, `alvo${rodada}@exemplo.com`);
      const [logout, exclusao] = await Promise.all([
        requisitar(servidor, "DELETE", caminhoSessao(conta.sessaoId), {
          token: conta.token,
        }),
        requisitar(servidor, "DELETE", `${API}/users/${conta.id}`, {
          token: adm.token,
        }),
      ]);
      const lidoLogout = await ler(logout);
      const lidoExclusao = await ler(exclusao);
      assert(
        [204, 401, 403].includes(lidoLogout.status),
        `rodada ${rodada}: logout ${lidoLogout.status}`,
      );
      assert(
        [204, 404].includes(lidoExclusao.status),
        `rodada ${rodada}: exclusão ${lidoExclusao.status}`,
      );
      assertEquals(lidoExclusao.status, 204);
      const depois = await requisitar(
        servidor,
        "DELETE",
        caminhoSessao(conta.sessaoId),
        { token: conta.token },
      );
      assertEquals(depois.status, 401);
      await depois.body?.cancel();
    }
    conferirSemFalhas(servidor);
  } finally {
    await servidor.encerrar();
  }
});
