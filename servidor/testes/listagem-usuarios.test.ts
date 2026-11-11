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
import {
  iniciarServidorDeTeste,
  requisitar,
} from "./auxiliares/servidor-teste.ts";
import type { ServidorDeTeste } from "./auxiliares/servidor-teste.ts";

type Aplicacao = ReturnType<typeof criarAplicacao>;

const CAMINHO = "/api/v1/users";
const CHAVES_USUARIO = ["id", "nome", "email", "admin"];
const JSON_CT = "application/json; charset=utf-8";
const ALLOW_USUARIOS = "GET, HEAD, POST, OPTIONS";
const MSG_TOKEN_AUSENTE = "Token de acesso ausente. Faça login para continuar.";
const MSG_TOKEN_INVALIDO =
  "Token de acesso inválido ou sessão encerrada. Faça login novamente.";
const MSG_LISTAGEM = "Apenas administradores podem listar os usuários.";
const MSG_METODO = "Método não permitido nesta rota.";
const PADRAO_CHAVE_SENSIVEL = /"[^"]*(papel|senha|hash|salt)[^"]*"\s*:/i;

interface Conta {
  id: number;
  email: string;
  token: string;
  sessaoId: string;
}

interface ItemUsuario {
  id: number;
  nome: string;
  email: string;
  admin: boolean;
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
  assertEquals(PADRAO_CHAVE_SENSIVEL.test(texto), false, "chave sensível");
  assertEquals(texto.toLowerCase().includes("papel"), false, "contém papel");
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
  return { id: usuario.id, email, token, sessaoId: id };
}

async function cadastrar(
  app: Aplicacao,
  nome: string,
  email: string,
): Promise<number> {
  const resposta = await enviar(app, "POST", CAMINHO, {
    corpo: { nome, email, senha: "senha123" },
  });
  assertEquals(resposta.status, 201);
  assert(ehObjeto(resposta.corpo) && typeof resposta.corpo.id === "number");
  return resposta.corpo.id;
}

async function comApp(
  teste: (app: Aplicacao, conexao: ConexaoBanco, adm: Conta) => Promise<void>,
): Promise<void> {
  const caminho = criarCaminhoBancoTemporario();
  const conexao = abrirConexao(caminho);
  try {
    executarMigracoes(conexao);
    await garantirAdmPadrao(conexao, () => {});
    const app = criarAplicacao({ conexao, segredoJwt: SEGREDO_TESTE });
    const adm = await logar(app, EMAIL_ADM_PADRAO, SENHA_ADM_PADRAO);
    await teste(app, conexao, adm);
  } finally {
    fecharConexao(conexao);
    removerBancoTemporario(caminho);
  }
}

function conferirLista(resposta: RespostaLida): ItemUsuario[] {
  assertEquals(resposta.status, 200);
  assertEquals(resposta.cabecalhos.get("Content-Type"), JSON_CT);
  assert(Array.isArray(resposta.corpo), "o corpo deve ser um array");
  const itens: ItemUsuario[] = [];
  for (const item of resposta.corpo) {
    assert(ehObjeto(item), "cada item deve ser um objeto");
    assertEquals(Object.keys(item), CHAVES_USUARIO);
    const { id, nome, email, admin } = item;
    assert(typeof id === "number" && Number.isInteger(id) && id > 0);
    assert(typeof nome === "string");
    assert(typeof email === "string");
    assert(typeof admin === "boolean");
    itens.push({ id, nome, email, admin });
  }
  for (let i = 1; i < itens.length; i++) {
    assert(itens[i - 1].id < itens[i].id, "ids devem ser crescentes");
  }
  return itens;
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

function adulterar(token: string): string {
  const [cabecalho, carga, assinatura] = token.split(".");
  const primeiro = assinatura[0] === "A" ? "B" : "A";
  return `${cabecalho}.${carga}.${primeiro}${assinatura.slice(1)}`;
}

Deno.test("GET /users sem token, com token adulterado ou sessão removida dá 401 com CORS", async () => {
  await comApp(async (app, conexao, adm) => {
    await cadastrar(app, "Ana Souza", "ana@exemplo.com");
    const ana = await logar(app, "ana@exemplo.com", "senha123");
    conferirErro(await enviar(app, "GET", CAMINHO), 401, MSG_TOKEN_AUSENTE);
    for (const conta of [ana, adm]) {
      conferirErro(
        await enviar(app, "GET", CAMINHO, { token: adulterar(conta.token) }),
        401,
        MSG_TOKEN_INVALIDO,
      );
    }
    conexao.prepare("DELETE FROM sessoes WHERE id IN (?, ?);").run(
      ana.sessaoId,
      adm.sessaoId,
    );
    for (const conta of [ana, adm]) {
      conferirErro(
        await enviar(app, "GET", CAMINHO, { token: conta.token }),
        401,
        MSG_TOKEN_INVALIDO,
      );
    }
  });
});

Deno.test("GET /users por usuário comum dá 403 sem vazar dados", async () => {
  await comApp(async (app) => {
    await cadastrar(app, "Ana Souza", "ana@exemplo.com");
    await cadastrar(app, "Bruno Lima", "bruno@exemplo.com");
    const ana = await logar(app, "ana@exemplo.com", "senha123");
    const resposta = await enviar(app, "GET", CAMINHO, { token: ana.token });
    conferirErro(resposta, 403, MSG_LISTAGEM);
    assertEquals(resposta.texto.includes("bruno"), false);
    assertEquals(resposta.texto.includes(EMAIL_ADM_PADRAO), false);
  });
});

Deno.test("GET /users pelo ADM devolve array ordenado com admin correto", async () => {
  await comApp(async (app, _conexao, adm) => {
    const idAna = await cadastrar(app, "Ana Souza", "ana@exemplo.com");
    const idBruno = await cadastrar(app, "Bruno Lima", "bruno@exemplo.com");
    const itens = conferirLista(
      await enviar(app, "GET", CAMINHO, { token: adm.token }),
    );
    assertEquals(itens, [
      {
        id: adm.id,
        nome: NOME_ADM_PADRAO,
        email: EMAIL_ADM_PADRAO,
        admin: true,
      },
      { id: idAna, nome: "Ana Souza", email: "ana@exemplo.com", admin: false },
      {
        id: idBruno,
        nome: "Bruno Lima",
        email: "bruno@exemplo.com",
        admin: false,
      },
    ]);
  });
});

Deno.test("GET /users com banco só com o ADM devolve um item", async () => {
  await comApp(async (app, _conexao, adm) => {
    const itens = conferirLista(
      await enviar(app, "GET", CAMINHO, { token: adm.token }),
    );
    assertEquals(itens, [{
      id: adm.id,
      nome: NOME_ADM_PADRAO,
      email: EMAIL_ADM_PADRAO,
      admin: true,
    }]);
  });
});

Deno.test("GET /users reflete cadastro, edição e exclusão mantendo a ordem", async () => {
  await comApp(async (app, _conexao, adm) => {
    const idAna = await cadastrar(app, "Ana Souza", "ana@exemplo.com");
    const idBruno = await cadastrar(app, "Bruno Lima", "bruno@exemplo.com");
    const idCarla = await cadastrar(app, "Carla Dias", "carla@exemplo.com");
    let itens = conferirLista(
      await enviar(app, "GET", CAMINHO, { token: adm.token }),
    );
    assertEquals(itens.map((item) => item.id), [
      adm.id,
      idAna,
      idBruno,
      idCarla,
    ]);

    assertEquals(
      (await enviar(app, "PUT", `${CAMINHO}/${idBruno}`, {
        token: adm.token,
        corpo: {
          nome: "Bruno Novo",
          email: "bruno.novo@exemplo.com",
          senha: "senha123",
        },
      })).status,
      200,
    );
    assertEquals(
      (await enviar(app, "PATCH", `${CAMINHO}/${idCarla}`, {
        token: adm.token,
        corpo: { nome: "Carla Patch" },
      })).status,
      200,
    );
    assertEquals(
      (await enviar(app, "DELETE", `${CAMINHO}/${idAna}`, {
        token: adm.token,
      })).status,
      204,
    );
    const idDaniel = await cadastrar(app, "Daniel Reis", "daniel@exemplo.com");

    itens = conferirLista(
      await enviar(app, "GET", CAMINHO, { token: adm.token }),
    );
    assertEquals(itens, [
      {
        id: adm.id,
        nome: NOME_ADM_PADRAO,
        email: EMAIL_ADM_PADRAO,
        admin: true,
      },
      {
        id: idBruno,
        nome: "Bruno Novo",
        email: "bruno.novo@exemplo.com",
        admin: false,
      },
      {
        id: idCarla,
        nome: "Carla Patch",
        email: "carla@exemplo.com",
        admin: false,
      },
      {
        id: idDaniel,
        nome: "Daniel Reis",
        email: "daniel@exemplo.com",
        admin: false,
      },
    ]);
  });
});

Deno.test("GET /users ignora query string e aceita barra final", async () => {
  await comApp(async (app, _conexao, adm) => {
    await cadastrar(app, "Ana Souza", "ana@exemplo.com");
    await cadastrar(app, "Bruno Lima", "bruno@exemplo.com");
    const base = await enviar(app, "GET", CAMINHO, { token: adm.token });
    const itens = conferirLista(base);
    assertEquals(itens.length, 3);
    for (
      const caminho of [
        `${CAMINHO}?nome=x&pagina=2`,
        `${CAMINHO}?limit=1&offset=1&ordem=desc`,
        `${CAMINHO}/`,
        `${CAMINHO}/?nome=Ana`,
      ]
    ) {
      const resposta = await enviar(app, "GET", caminho, { token: adm.token });
      conferirLista(resposta);
      assertEquals(resposta.texto, base.texto);
    }
    conferirErro(
      await enviar(app, "GET", `${CAMINHO}/`),
      401,
      MSG_TOKEN_AUSENTE,
    );
  });
});

Deno.test("HEAD /users: ADM recebe 200 sem corpo, sem token dá 401", async () => {
  await comApp(async (app, _conexao, adm) => {
    const ok = await enviar(app, "HEAD", CAMINHO, { token: adm.token });
    assertEquals(ok.status, 200);
    assertEquals(ok.texto, "");
    assertEquals((await enviar(app, "HEAD", CAMINHO)).status, 401);
  });
});

Deno.test("PUT, PATCH e DELETE em /users dão 405 com Allow, com e sem token", async () => {
  await comApp(async (app, _conexao, adm) => {
    await cadastrar(app, "Ana Souza", "ana@exemplo.com");
    const ana = await logar(app, "ana@exemplo.com", "senha123");
    for (const metodo of ["PUT", "PATCH", "DELETE"]) {
      for (const token of [undefined, adm.token, ana.token]) {
        for (const caminho of [CAMINHO, `${CAMINHO}/`]) {
          const resposta = await enviar(app, metodo, caminho, {
            token,
            corpo: metodo === "DELETE" ? undefined : { nome: "Ana Souza" },
          });
          conferirErro(resposta, 405, MSG_METODO);
          assertEquals(resposta.cabecalhos.get("Allow"), ALLOW_USUARIOS);
        }
      }
    }
  });
});

Deno.test("OPTIONS /users dá 204 sem corpo e com CORS", async () => {
  await comApp(async (app) => {
    const resposta = await enviar(app, "OPTIONS", CAMINHO);
    assertEquals(resposta.status, 204);
    assertEquals(resposta.texto, "");
  });
});

Deno.test("ADM excluído recebe 401 em GET /users", async () => {
  await comApp(async (app, _conexao, adm) => {
    conferirLista(await enviar(app, "GET", CAMINHO, { token: adm.token }));
    assertEquals(
      (await enviar(app, "DELETE", `${CAMINHO}/${adm.id}`, {
        token: adm.token,
      })).status,
      204,
    );
    conferirErro(
      await enviar(app, "GET", CAMINHO, { token: adm.token }),
      401,
      MSG_TOKEN_INVALIDO,
    );
  });
});

async function requisicaoBruta(
  servidor: ServidorDeTeste,
  texto: string,
): Promise<string> {
  const porta = Number(new URL(servidor.origem).port);
  const conexao = await Deno.connect({ hostname: "127.0.0.1", port: porta });
  try {
    await conexao.write(new TextEncoder().encode(texto));
    const partes: Uint8Array[] = [];
    const buffer = new Uint8Array(4096);
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
    return new TextDecoder().decode(total);
  } finally {
    conexao.close();
  }
}

Deno.test("GET /users com corpo enviado ignora o corpo", async () => {
  const servidor = await iniciarServidorDeTeste();
  try {
    const login = await requisitar(servidor, "POST", "/api/v1/sessions", {
      corpo: { email: EMAIL_ADM_PADRAO, senha: SENHA_ADM_PADRAO },
    });
    assertEquals(login.status, 201);
    const token = (await login.json()).token;
    const semCorpo = await requisitar(servidor, "GET", CAMINHO, { token });
    const esperado = await semCorpo.text();
    assertEquals(semCorpo.status, 200);

    const corpo = JSON.stringify({ nome: "x", pagina: 2, papel: "comum" });
    const host = new URL(servidor.origem).host;
    const bruta = await requisicaoBruta(
      servidor,
      `GET ${CAMINHO} HTTP/1.1\r\nHost: ${host}\r\nAuthorization: Bearer ${token}\r\nContent-Type: application/json\r\nContent-Length: ${
        new TextEncoder().encode(corpo).length
      }\r\nConnection: close\r\n\r\n${corpo}`,
    );
    assert(bruta.startsWith("HTTP/1.1 200"), bruta.split("\r\n")[0]);
    assert(bruta.includes(esperado), "a lista deve ser a mesma");
  } finally {
    await servidor.encerrar();
  }
});

Deno.test("concorrência: ADM lista enquanto outros cadastram e excluem, sem nenhum 500", async () => {
  const servidor = await iniciarServidorDeTeste();
  try {
    const login = await requisitar(servidor, "POST", "/api/v1/sessions", {
      corpo: { email: EMAIL_ADM_PADRAO, senha: SENHA_ADM_PADRAO },
    });
    assertEquals(login.status, 201);
    const tokenAdm = (await login.json()).token;

    const contas: { id: number; token: string }[] = [];
    for (let i = 0; i < 6; i++) {
      const email = `existente${i}@exemplo.com`;
      const cadastro = await requisitar(servidor, "POST", CAMINHO, {
        corpo: { nome: "Existente", email, senha: "senha123" },
      });
      assertEquals(cadastro.status, 201);
      const id = (await cadastro.json()).id;
      const sessao = await requisitar(servidor, "POST", "/api/v1/sessions", {
        corpo: { email, senha: "senha123" },
      });
      assertEquals(sessao.status, 201);
      contas.push({ id, token: (await sessao.json()).token });
    }

    const listagens = Array.from(
      { length: 20 },
      () => requisitar(servidor, "GET", CAMINHO, { token: tokenAdm }),
    );
    const cadastros = Array.from(
      { length: 8 },
      (_, i) =>
        requisitar(servidor, "POST", CAMINHO, {
          corpo: {
            nome: "Novo Usuario",
            email: `novo${i}@exemplo.com`,
            senha: "senha123",
          },
        }),
    );
    const exclusoes = contas.map((conta, i) =>
      requisitar(servidor, "DELETE", `${CAMINHO}/${conta.id}`, {
        token: i % 2 === 0 ? conta.token : tokenAdm,
      })
    );

    const [respostasLista, respostasCadastro, respostasExclusao] = await Promise
      .all([
        Promise.all(listagens),
        Promise.all(cadastros),
        Promise.all(exclusoes),
      ]);

    for (const resposta of respostasLista) {
      const itens = conferirLista(await ler(resposta));
      const ids = itens.map((item) => item.id);
      assertEquals(new Set(ids).size, ids.length, "ids repetidos");
      assert(itens.some((item) => item.admin), "o ADM deve aparecer");
    }
    for (const resposta of respostasCadastro) {
      assertEquals(resposta.status, 201);
      await resposta.body?.cancel();
    }
    for (const resposta of respostasExclusao) {
      assertEquals(resposta.status, 204);
      await resposta.body?.cancel();
    }

    const final = conferirLista(
      await ler(
        await requisitar(servidor, "GET", CAMINHO, { token: tokenAdm }),
      ),
    );
    assertEquals(final.length, 1 + 8);

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
