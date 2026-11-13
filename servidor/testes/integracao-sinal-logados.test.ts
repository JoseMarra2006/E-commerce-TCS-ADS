import "./auxiliares/vigia-arquivos-reais.ts";
import { assert, assertEquals } from "@std/assert";
import { abrirConexao, fecharConexao } from "../src/banco/conexao.ts";
import { executarMigracoes } from "../src/banco/migracoes.ts";
import type { Registro } from "../src/estado.ts";
import { ehMensagemDaThread } from "../src/pool/mensagens.ts";
import {
  EVENTO_SESSOES_ALTERADAS,
  GerenciadorPool,
} from "../src/pool/gerenciador-pool.ts";
import { iniciarRecepcao } from "../src/recepcao.ts";
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
  type CorpoSessao,
  verificarRespostaSessao,
} from "./auxiliares/conformidade.ts";
import { SEGREDO_TESTE } from "./auxiliares/segredo-temporario.ts";

const API = "/api/v1";
const URL_TRABALHADOR_FALHO = new URL(
  "./auxiliares/trabalhador-sinal-falho-teste.ts",
  import.meta.url,
).href;

interface Ambiente {
  origem: string;
  registros: Registro[];
  errosSistema: string[];
  sinais: () => number;
}

interface OpcoesEnvio {
  token?: string;
  corpo?: unknown;
}

function obterPortaLivre(): number {
  const listener = Deno.listen({ port: 0 });
  const porta = (listener.addr as Deno.NetAddr).port;
  listener.close();
  return porta;
}

async function prepararBanco(): Promise<string> {
  const caminhoBanco = criarCaminhoBancoTemporario();
  const conexao = abrirConexao(caminhoBanco);
  try {
    executarMigracoes(conexao);
    await garantirAdmPadrao(conexao, () => {});
  } finally {
    fecharConexao(conexao);
  }
  return caminhoBanco;
}

async function comServidor(
  teste: (ambiente: Ambiente) => Promise<void>,
  urlTrabalhador?: string,
): Promise<void> {
  const caminhoBanco = await prepararBanco();

  const pool = new GerenciadorPool({ urlTrabalhador });
  let sinais = 0;
  pool.addEventListener(EVENTO_SESSOES_ALTERADAS, () => sinais++);
  const registros: Registro[] = [];
  const errosSistema: string[] = [];
  pool.addEventListener("sistema", (evento) => {
    const detalhe = (evento as CustomEvent<
      { nivel: "info" | "erro"; mensagem: string }
    >).detail;
    if (detalhe.nivel === "erro") {
      errosSistema.push(detalhe.mensagem);
    }
  });
  await pool.iniciar(caminhoBanco, SEGREDO_TESTE);
  const porta = obterPortaLivre();
  const recepcao = iniciarRecepcao({
    porta,
    gerenciadorPool: pool,
    registrar: (registro) => registros.push(registro),
  });
  try {
    await teste({
      origem: `http://127.0.0.1:${porta}`,
      registros,
      errosSistema,
      sinais: () => sinais,
    });
    assertEquals(
      registros.filter((r) => r.tipo === "requisicao" && r.status === 500),
      [],
    );
    assertEquals(
      registros.filter((r) => r.tipo === "sistema" && r.nivel === "erro"),
      [],
    );
    assertEquals(errosSistema, []);
  } finally {
    await recepcao.encerrar();
    await pool.encerrar();
    removerBancoTemporario(caminhoBanco);
  }
}

function enviar(
  ambiente: Ambiente,
  metodo: string,
  caminho: string,
  opcoes: OpcoesEnvio = {},
): Promise<Response> {
  const cabecalhos: Record<string, string> = {};
  if (opcoes.token !== undefined) {
    cabecalhos["Authorization"] = `Bearer ${opcoes.token}`;
  }
  let corpo: string | undefined;
  if (opcoes.corpo !== undefined) {
    cabecalhos["Content-Type"] = "application/json";
    corpo = JSON.stringify(opcoes.corpo);
  }
  return fetch(`${ambiente.origem}${caminho}`, {
    method: metodo,
    headers: cabecalhos,
    body: corpo,
  });
}

async function medir(
  ambiente: Ambiente,
  sinaisEsperados: number,
  statusEsperado: number,
  metodo: string,
  caminho: string,
  opcoes: OpcoesEnvio = {},
): Promise<string> {
  const antes = ambiente.sinais();
  const resposta = await enviar(ambiente, metodo, caminho, opcoes);
  const depois = ambiente.sinais();
  const texto = await resposta.text();
  assertEquals(resposta.status, statusEsperado, `${metodo} ${caminho}`);
  assertEquals(depois - antes, sinaisEsperados, `${metodo} ${caminho}`);
  return texto;
}

async function logar(
  ambiente: Ambiente,
  email: string,
  senha: string,
  caminho = `${API}/sessions`,
): Promise<CorpoSessao> {
  const antes = ambiente.sinais();
  const resposta = await enviar(ambiente, "POST", caminho, {
    corpo: { email, senha },
  });
  assertEquals(ambiente.sinais() - antes, 1, "o sinal chega antes da resposta");
  return (await verificarRespostaSessao(resposta)).corpo;
}

async function cadastrar(
  ambiente: Ambiente,
  nome: string,
  email: string,
): Promise<number> {
  const texto = await medir(ambiente, 0, 201, "POST", `${API}/users`, {
    corpo: { nome, email, senha: "senha123" },
  });
  const corpo: unknown = JSON.parse(texto);
  assert(typeof corpo === "object" && corpo !== null && "id" in corpo);
  const id = corpo.id;
  assert(typeof id === "number");
  return id;
}

async function conferirSemSinalExtra(
  ambiente: Ambiente,
  esperado: number,
): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 100));
  assertEquals(ambiente.sinais(), esperado);
}

Deno.test("cada caso positivo dispara exatamente um evento, já recebido quando a resposta chega", async () => {
  await comServidor(async (ambiente) => {
    const idAna = await cadastrar(ambiente, "Ana Souza", "ana@exemplo.com");
    const ana = await logar(ambiente, "ana@exemplo.com", "senha123");
    await logar(
      ambiente,
      "ANA@exemplo.com",
      "senha123",
      `${API}/sessions/?origem=teste`,
    );

    await medir(ambiente, 1, 200, "PATCH", `${API}/users/${idAna}`, {
      token: ana.token,
      corpo: { nome: "Ana Nova" },
    });
    await medir(ambiente, 1, 200, "PUT", `${API}/users/${idAna}/`, {
      token: ana.token,
      corpo: { nome: "Ana Put", email: "ana@exemplo.com", senha: "senha123" },
    });

    await medir(ambiente, 1, 204, "DELETE", `${API}/sessions/${ana.id}`, {
      token: ana.token,
    });
    const outra = await logar(ambiente, "ana@exemplo.com", "senha123");
    const codificado = `%${outra.id.charCodeAt(0).toString(16)}${
      outra.id.slice(1)
    }`;
    await medir(ambiente, 1, 204, "DELETE", `${API}/sessions/${codificado}`, {
      token: outra.token,
    });

    const sessoes = [
      await logar(ambiente, "ana@exemplo.com", "senha123"),
      await logar(ambiente, "ana@exemplo.com", "senha123"),
      await logar(ambiente, "ana@exemplo.com", "senha123"),
    ];
    const adm = await logar(ambiente, EMAIL_ADM_PADRAO, SENHA_ADM_PADRAO);
    await medir(ambiente, 1, 204, "DELETE", `${API}/users/${idAna}`, {
      token: adm.token,
    });
    for (const sessao of sessoes) {
      await medir(ambiente, 0, 401, "GET", `${API}/users/${idAna}`, {
        token: sessao.token,
      });
    }

    await medir(ambiente, 1, 204, "DELETE", `${API}/users/${adm.usuario.id}`, {
      token: adm.token,
    });

    await conferirSemSinalExtra(ambiente, 13);
  });
});

Deno.test("casos negativos não disparam nenhum evento", async () => {
  await comServidor(async (ambiente) => {
    const idAna = await cadastrar(ambiente, "Ana Souza", "ana@exemplo.com");
    const idBruno = await cadastrar(
      ambiente,
      "Bruno Lima",
      "bruno@exemplo.com",
    );
    const ana = await logar(ambiente, "ana@exemplo.com", "senha123");
    const bruno = await logar(ambiente, "bruno@exemplo.com", "senha123");
    const adm = await logar(ambiente, EMAIL_ADM_PADRAO, SENHA_ADM_PADRAO);
    const base = ambiente.sinais();
    assertEquals(base, 3);

    await medir(ambiente, 0, 401, "POST", `${API}/sessions`, {
      corpo: { email: "ana@exemplo.com", senha: "errada123" },
    });
    await medir(ambiente, 0, 400, "POST", `${API}/sessions`, {
      corpo: { email: "ana" },
    });
    await medir(ambiente, 0, 403, "DELETE", `${API}/sessions/${bruno.id}`, {
      token: ana.token,
    });
    await medir(ambiente, 0, 401, "DELETE", `${API}/sessions/${ana.id}`);
    await medir(ambiente, 0, 200, "GET", `${API}/users`, { token: adm.token });
    await medir(ambiente, 0, 200, "GET", `${API}/users/${idAna}`, {
      token: ana.token,
    });
    await medir(ambiente, 0, 200, "HEAD", `${API}/users/${idAna}`, {
      token: ana.token,
    });
    await medir(ambiente, 0, 204, "OPTIONS", `${API}/sessions`);
    await medir(ambiente, 0, 204, "OPTIONS", `${API}/users/${idAna}`);
    await medir(ambiente, 0, 403, "PATCH", `${API}/users/${idBruno}`, {
      token: ana.token,
      corpo: { nome: "Invasora" },
    });
    await medir(ambiente, 0, 409, "PATCH", `${API}/users/${idAna}`, {
      token: ana.token,
      corpo: { email: "bruno@exemplo.com" },
    });
    await medir(ambiente, 0, 400, "PUT", `${API}/users/${idAna}`, {
      token: ana.token,
      corpo: { nome: "Ana" },
    });
    await medir(ambiente, 0, 404, "PATCH", `${API}/users/999999`, {
      token: adm.token,
      corpo: { nome: "Ninguém" },
    });
    await medir(ambiente, 0, 404, "DELETE", `${API}/users/999999`, {
      token: adm.token,
    });
    await medir(ambiente, 0, 400, "DELETE", `${API}/users/abc`, {
      token: adm.token,
    });
    await medir(ambiente, 0, 403, "DELETE", `${API}/users/${idBruno}`, {
      token: ana.token,
    });
    await medir(ambiente, 0, 405, "PUT", `${API}/sessions`, {
      token: ana.token,
    });
    await medir(ambiente, 0, 404, "GET", `${API}/inexistente`);
    await medir(ambiente, 0, 201, "POST", `${API}/products`, {
      token: adm.token,
      corpo: { nome: "Ingresso", descricao: "", quantidade: 1 },
    });
    await medir(ambiente, 0, 200, "GET", `${API}/products`, {
      token: ana.token,
    });
    await medir(ambiente, 0, 200, "PATCH", `${API}/products/1`, {
      token: adm.token,
      corpo: { quantidade: 2 },
    });
    await medir(ambiente, 0, 204, "DELETE", `${API}/products/1`, {
      token: adm.token,
    });
    await cadastrar(ambiente, "Carla Dias", "carla@exemplo.com");

    await conferirSemSinalExtra(ambiente, base);
  });
});

Deno.test("40 logins simultâneos geram 40 eventos, sem nenhum 500", async () => {
  await comServidor(async (ambiente) => {
    await cadastrar(ambiente, "Ana Souza", "ana@exemplo.com");
    const respostas = await Promise.all(
      Array.from(
        { length: 40 },
        () =>
          enviar(ambiente, "POST", `${API}/sessions`, {
            corpo: { email: "ana@exemplo.com", senha: "senha123" },
          }),
      ),
    );
    assertEquals(ambiente.sinais(), 40);
    const ids = new Set<string>();
    for (const resposta of respostas) {
      ids.add((await verificarRespostaSessao(resposta)).corpo.id);
    }
    assertEquals(ids.size, 40);
    const threads = new Set(
      ambiente.registros
        .filter((r) => r.tipo === "requisicao" && r.status === 201)
        .map((r) => r.tipo === "requisicao" ? r.thread : null),
    );
    assert(threads.size >= 2, `threads distintas: ${threads.size}`);
    await conferirSemSinalExtra(ambiente, 40);
  });
});

Deno.test("falha ao enviar o sinal não altera a resposta HTTP do login nem gera erro", async () => {
  await comServidor(async (ambiente) => {
    await cadastrar(ambiente, "Ana Souza", "ana@exemplo.com");
    const sessao = await verificarRespostaSessao(
      await enviar(ambiente, "POST", `${API}/sessions`, {
        corpo: { email: "ana@exemplo.com", senha: "senha123" },
      }),
    );
    assertEquals(sessao.corpo.usuario.email, "ana@exemplo.com");
    await medir(
      ambiente,
      0,
      200,
      "PATCH",
      `${API}/users/${sessao.corpo.usuario.id}`,
      {
        token: sessao.corpo.token,
        corpo: { nome: "Ana Nova" },
      },
    );
    await medir(
      ambiente,
      0,
      204,
      "DELETE",
      `${API}/sessions/${sessao.corpo.id}`,
      {
        token: sessao.corpo.token,
      },
    );
    assertEquals(ambiente.sinais(), 0);
    const registrosLogin = ambiente.registros.filter((r) =>
      r.tipo === "requisicao" && r.caminho === `${API}/sessions`
    );
    assertEquals(registrosLogin.length, 1);
    assertEquals(
      registrosLogin[0].tipo === "requisicao" && registrosLogin[0].status,
      201,
    );
  }, URL_TRABALHADOR_FALHO);
});

Deno.test("na thread com envio do sinal falhando, a resposta é enviada normalmente depois da tentativa", async () => {
  const caminhoBanco = await prepararBanco();
  const worker = new Worker(URL_TRABALHADOR_FALHO, { type: "module" });
  const recebidas: unknown[] = [];
  let erros = 0;
  worker.onerror = (evento) => {
    evento.preventDefault();
    erros++;
  };
  try {
    const aguardar = (tipo: string) =>
      new Promise<void>((resolve) => {
        worker.onmessage = (evento: MessageEvent<unknown>) => {
          recebidas.push(evento.data);
          const dado = evento.data as Record<string, unknown>;
          if (dado.tipo === tipo) {
            resolve();
          }
        };
      });
    const pronta = aguardar("pronta");
    worker.postMessage({
      tipo: "iniciar",
      numero: 1,
      caminhoBanco,
      segredoJwt: SEGREDO_TESTE,
    });
    await pronta;
    recebidas.length = 0;
    const resposta = aguardar("resposta");
    worker.postMessage({
      tipo: "requisicao",
      id: 7,
      metodo: "POST",
      url: `http://127.0.0.1${API}/sessions`,
      cabecalhos: [["Content-Type", "application/json"]],
      corpo: JSON.stringify({
        email: EMAIL_ADM_PADRAO,
        senha: SENHA_ADM_PADRAO,
      }),
    });
    await resposta;
    assertEquals(recebidas.length, 2);
    assertEquals(recebidas[0], { tipo: "teste_sinal_recusado" });
    const mensagem = recebidas[1];
    assert(ehMensagemDaThread(mensagem) && mensagem.tipo === "resposta");
    assertEquals(mensagem.id, 7);
    assertEquals(mensagem.status, 201);
    const corpo: unknown = JSON.parse(mensagem.corpo ?? "");
    assert(typeof corpo === "object" && corpo !== null);
    assertEquals(Object.keys(corpo), ["id", "token", "usuario"]);
    assertEquals(erros, 0);
    const encerrada = aguardar("encerrada");
    worker.postMessage({ tipo: "encerrar" });
    await encerrada;
  } finally {
    worker.terminate();
    removerBancoTemporario(caminhoBanco);
  }
});
