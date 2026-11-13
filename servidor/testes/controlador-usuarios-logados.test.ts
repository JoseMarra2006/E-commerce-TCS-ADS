import "./auxiliares/vigia-arquivos-reais.ts";
import { assert, assertEquals, assertThrows } from "@std/assert";
import type { ConexaoBanco } from "../src/banco/conexao.ts";
import {
  ControladorServidor,
  EVENTO_LOGADOS,
  type OpcoesControladorServidor,
} from "../src/controlador-servidor.ts";
import type { Registro } from "../src/estado.ts";
import { abrirConexaoSomenteLeitura } from "../src/logados/consulta-usuarios-logados.ts";
import {
  type InstantaneoLogados,
  MonitorUsuariosLogados,
  type OpcoesMonitorUsuariosLogados,
} from "../src/logados/monitor-usuarios-logados.ts";
import {
  EMAIL_ADM_PADRAO,
  SENHA_ADM_PADRAO,
} from "../src/modulos/usuarios/adm-padrao.ts";
import {
  criarCaminhoBancoTemporario,
  removerBancoTemporario,
} from "./auxiliares/banco-temporario.ts";
import {
  type CorpoSessao,
  verificarRespostaSessao,
  verificarRespostaUsuario,
  verificarRespostaVazia,
} from "./auxiliares/conformidade.ts";
import {
  criarCaminhoSegredoTemporario,
  removerSegredoTemporario,
} from "./auxiliares/segredo-temporario.ts";

const API = "/api/v1";
const LIMITE_ATUALIZACAO_MS = 1000;

interface Servidor {
  controlador: ControladorServidor;
  origem: string;
  registros: Registro[];
  eventos: InstantaneoLogados[];
}

interface Ambiente {
  caminhoBanco: string;
  iniciar: (opcoes?: OpcoesControladorServidor) => Promise<Servidor>;
}

function obterPortaLivre(): number {
  const listener = Deno.listen({ port: 0 });
  const porta = (listener.addr as Deno.NetAddr).port;
  listener.close();
  return porta;
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function comAmbiente(
  teste: (ambiente: Ambiente) => Promise<void>,
): Promise<void> {
  const caminhoBanco = criarCaminhoBancoTemporario();
  const caminhoSegredoJwt = criarCaminhoSegredoTemporario();
  const controladores: ControladorServidor[] = [];
  try {
    await teste({
      caminhoBanco,
      iniciar: async (opcoes = {}) => {
        const controlador = new ControladorServidor({
          caminhoBanco,
          caminhoSegredoJwt,
          ...opcoes,
        });
        controladores.push(controlador);
        const registros: Registro[] = [];
        const eventos: InstantaneoLogados[] = [];
        controlador.addEventListener("registro", (evento) => {
          registros.push((evento as CustomEvent<Registro>).detail);
        });
        controlador.addEventListener(EVENTO_LOGADOS, (evento) => {
          eventos.push((evento as CustomEvent<InstantaneoLogados>).detail);
        });
        const porta = obterPortaLivre();
        const resultado = await controlador.iniciar(porta);
        assertEquals(resultado.ok, true, resultado.mensagem);
        return {
          controlador,
          origem: `http://127.0.0.1:${porta}`,
          registros,
          eventos,
        };
      },
    });
  } finally {
    for (const controlador of controladores) {
      if (controlador.obterEstado().status === "em_execucao") {
        await controlador.parar();
      }
    }
    removerBancoTemporario(caminhoBanco);
    removerSegredoTemporario(caminhoSegredoJwt);
  }
}

function enviar(
  servidor: Servidor,
  metodo: string,
  caminho: string,
  opcoes: { token?: string; corpo?: unknown } = {},
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
  return fetch(`${servidor.origem}${caminho}`, {
    method: metodo,
    headers: cabecalhos,
    body: corpo,
  });
}

async function cadastrar(
  servidor: Servidor,
  nome: string,
  email: string,
): Promise<number> {
  return (await verificarRespostaUsuario(
    await enviar(servidor, "POST", `${API}/users`, {
      corpo: { nome, email, senha: "senha123" },
    }),
    201,
  )).corpo.id;
}

async function logar(
  servidor: Servidor,
  email: string,
  senha = "senha123",
): Promise<CorpoSessao> {
  return (await verificarRespostaSessao(
    await enviar(servidor, "POST", `${API}/sessions`, {
      corpo: { email, senha },
    }),
  )).corpo;
}

async function sair(servidor: Servidor, sessao: CorpoSessao): Promise<void> {
  await verificarRespostaVazia(
    await enviar(servidor, "DELETE", `${API}/sessions/${sessao.id}`, {
      token: sessao.token,
    }),
  );
}

async function esperarLista(
  servidor: Servidor,
  condicao: (instantaneo: InstantaneoLogados) => boolean,
  descricao: string,
): Promise<InstantaneoLogados> {
  const inicio = Date.now();
  while (true) {
    const instantaneo = servidor.controlador.obterUsuariosLogados();
    if (condicao(instantaneo)) {
      return instantaneo;
    }
    if (Date.now() - inicio > LIMITE_ATUALIZACAO_MS) {
      throw new Error(
        `Lista não atualizou em ${LIMITE_ATUALIZACAO_MS} ms: ${descricao}. Atual: ${
          JSON.stringify(instantaneo)
        }`,
      );
    }
    await esperar(10);
  }
}

function sessoesDe(instantaneo: InstantaneoLogados, id: number): number {
  return instantaneo.usuarios.find((u) => u.id === id)?.sessoes ?? 0;
}

function conferirSemFalhas(registros: Registro[]): void {
  assertEquals(
    registros.filter((r) => r.tipo === "requisicao" && r.status === 500),
    [],
  );
  assertEquals(
    registros.filter((r) => r.tipo === "sistema" && r.nivel === "erro"),
    [],
  );
}

Deno.test("a lista acompanha login, logout, edição e exclusões feitas por HTTP", async () => {
  await comAmbiente(async ({ iniciar }) => {
    const servidor = await iniciar();
    const inicial = servidor.controlador.obterUsuariosLogados();
    assertEquals(inicial.estado, "disponivel");
    assertEquals(inicial.usuarios, []);
    assert(
      servidor.registros.some((r) =>
        r.tipo === "sistema" &&
        r.mensagem ===
          "Monitor de usuários logados iniciado com 0 usuários logados."
      ),
    );

    const idAna = await cadastrar(servidor, "Ana Souza", "ana@exemplo.com");
    const idBruno = await cadastrar(
      servidor,
      "Bruno Lima",
      "bruno@exemplo.com",
    );
    assertEquals(servidor.controlador.obterUsuariosLogados().usuarios, []);

    const ana1 = await logar(servidor, "ana@exemplo.com");
    let lista = await esperarLista(
      servidor,
      (i) => sessoesDe(i, idAna) === 1,
      "login da Ana",
    );
    assertEquals(lista.usuarios, [{
      id: idAna,
      nome: "Ana Souza",
      email: "ana@exemplo.com",
      tipo: "comum",
      sessoes: 1,
      desde: lista.usuarios[0].desde,
    }]);
    const desdeAna = lista.usuarios[0].desde;

    const ana2 = await logar(servidor, "ana@exemplo.com");
    lista = await esperarLista(
      servidor,
      (i) => sessoesDe(i, idAna) === 2,
      "segundo login",
    );
    assertEquals(lista.usuarios[0].desde, desdeAna);

    await sair(servidor, ana1);
    await esperarLista(servidor, (i) => sessoesDe(i, idAna) === 1, "logout");
    await sair(servidor, ana2);
    await esperarLista(
      servidor,
      (i) => i.usuarios.length === 0,
      "último logout",
    );

    const adm = await logar(servidor, EMAIL_ADM_PADRAO, SENHA_ADM_PADRAO);
    lista = await esperarLista(
      servidor,
      (i) => i.usuarios.length === 1,
      "login do ADM",
    );
    assertEquals(lista.usuarios[0].id, adm.usuario.id);
    assertEquals(lista.usuarios[0].tipo, "administrador");

    const bruno = await logar(servidor, "bruno@exemplo.com");
    await esperarLista(servidor, (i) => sessoesDe(i, idBruno) === 1, "Bruno");
    await verificarRespostaUsuario(
      await enviar(servidor, "PATCH", `${API}/users/${idBruno}`, {
        token: bruno.token,
        corpo: { nome: "Bruno Novo 🚀" },
      }),
      200,
    );
    lista = await esperarLista(
      servidor,
      (i) => i.usuarios.some((u) => u.nome === "Bruno Novo 🚀"),
      "PATCH de nome",
    );
    assertEquals(lista.usuarios.map((u) => u.id), [adm.usuario.id, idBruno]);

    await verificarRespostaVazia(
      await enviar(servidor, "DELETE", `${API}/users/${idBruno}`, {
        token: adm.token,
      }),
    );
    await esperarLista(
      servidor,
      (i) => i.usuarios.map((u) => u.id).join() === `${adm.usuario.id}`,
      "exclusão do Bruno",
    );

    await verificarRespostaVazia(
      await enviar(servidor, "DELETE", `${API}/users/${adm.usuario.id}`, {
        token: adm.token,
      }),
    );
    await esperarLista(
      servidor,
      (i) => i.usuarios.length === 0,
      "ADM excluiu a si mesmo",
    );

    assert(servidor.eventos.length >= 8);
    assertEquals(servidor.eventos.at(-1)?.usuarios, []);
    const texto = JSON.stringify(servidor.eventos);
    for (const proibido of [ana1.token, ana1.id, adm.token, "senha", "salt"]) {
      assertEquals(texto.includes(proibido), false);
    }
    conferirSemFalhas(servidor.registros);
  });
});

Deno.test("sessão criada antes do reinício aparece logo após a carga inicial", async () => {
  await comAmbiente(async ({ iniciar }) => {
    const primeiro = await iniciar();
    const idAna = await cadastrar(primeiro, "Ana Souza", "ana@exemplo.com");
    await logar(primeiro, "ana@exemplo.com");
    await esperarLista(primeiro, (i) => i.usuarios.length === 1, "login");
    assertEquals((await primeiro.controlador.parar()).ok, true);
    assertEquals(primeiro.controlador.obterUsuariosLogados(), {
      estado: "indisponivel",
      usuarios: [],
      atualizadoEm: null,
    });
    assertEquals(primeiro.eventos.at(-1)?.estado, "indisponivel");

    const segundo = await iniciar();
    const lista = segundo.controlador.obterUsuariosLogados();
    assertEquals(lista.estado, "disponivel");
    assertEquals(lista.usuarios.map((u) => u.id), [idAna]);
    assert(
      segundo.registros.some((r) =>
        r.tipo === "sistema" &&
        r.mensagem ===
          "Monitor de usuários logados iniciado com 1 usuário logado."
      ),
    );
    conferirSemFalhas([...primeiro.registros, ...segundo.registros]);
  });
});

Deno.test("40 logins simultâneos de usuários diferentes: 40 itens ordenados, sem 500", async () => {
  await comAmbiente(async ({ iniciar }) => {
    const servidor = await iniciar();
    const ids = await Promise.all(
      Array.from(
        { length: 40 },
        (_, i) => cadastrar(servidor, `Usuário ${i}`, `u${i}@teste.com`),
      ),
    );
    await Promise.all(
      Array.from({ length: 40 }, (_, i) => logar(servidor, `u${i}@teste.com`)),
    );
    const lista = await esperarLista(
      servidor,
      (i) => i.usuarios.length === 40,
      "40 logins",
    );
    assertEquals(
      lista.usuarios.map((u) => u.id),
      [...ids].sort((a, b) => a - b),
    );
    assert(lista.usuarios.every((u) => u.sessoes === 1 && u.tipo === "comum"));
    conferirSemFalhas(servidor.registros);
  });
});

Deno.test("monitor que não abre a conexão não impede o servidor de atender", async () => {
  await comAmbiente(async ({ iniciar }) => {
    const servidor = await iniciar({
      criarMonitorLogados: (opcoes) =>
        new MonitorUsuariosLogados({
          ...opcoes,
          abrirConexao: () => {
            throw new Error("falha simulada");
          },
        }),
    });
    assertEquals(servidor.controlador.obterEstado().status, "em_execucao");
    const idAna = await cadastrar(servidor, "Ana Souza", "ana@exemplo.com");
    const ana = await logar(servidor, "ana@exemplo.com");
    await verificarRespostaUsuario(
      await enviar(servidor, "GET", `${API}/users/${idAna}`, {
        token: ana.token,
      }),
      200,
    );
    await sair(servidor, ana);
    await esperar(300);
    assertEquals(servidor.controlador.obterUsuariosLogados(), {
      estado: "indisponivel",
      usuarios: [],
      atualizadoEm: null,
    });
    const erros = servidor.registros.filter((r) =>
      r.tipo === "sistema" && r.nivel === "erro"
    );
    assertEquals(erros.length, 1);
    assertEquals(
      servidor.registros.filter((r) =>
        r.tipo === "requisicao" && r.status === 500
      ),
      [],
    );
  });
});

class MonitorQueLanca extends MonitorUsuariosLogados {
  override solicitarAtualizacao(): void {
    throw new Error("monitor quebrado");
  }
}

Deno.test("monitor que lança no ouvinte ou na criação não derruba o servidor", async () => {
  await comAmbiente(async ({ iniciar }) => {
    const quebrado = await iniciar({
      criarMonitorLogados: (opcoes) => new MonitorQueLanca(opcoes),
    });
    await cadastrar(quebrado, "Ana Souza", "ana@exemplo.com");
    for (let i = 0; i < 3; i++) {
      const sessao = await logar(quebrado, "ana@exemplo.com");
      await sair(quebrado, sessao);
    }
    assertEquals(quebrado.controlador.obterEstado().status, "em_execucao");
    conferirSemFalhas(quebrado.registros);
    await quebrado.controlador.parar();

    const semMonitor = await iniciar({
      criarMonitorLogados: () => {
        throw new Error("criação quebrada");
      },
    });
    const sessao = await logar(semMonitor, "ana@exemplo.com");
    await sair(semMonitor, sessao);
    assertEquals(
      semMonitor.controlador.obterUsuariosLogados().estado,
      "indisponivel",
    );
    const erros = semMonitor.registros.filter((r) =>
      r.tipo === "sistema" && r.nivel === "erro"
    );
    assertEquals(erros.map((r) => r.tipo === "sistema" && r.mensagem), [
      "Não foi possível iniciar o monitor de usuários logados. O servidor continua atendendo normalmente.",
    ]);
  });
});

class MonitorContador extends MonitorUsuariosLogados {
  pedidos = 0;

  override solicitarAtualizacao(): void {
    this.pedidos++;
    super.solicitarAtualizacao();
  }
}

Deno.test("parar não deixa ouvinte, temporizador nem conexão, e reiniciar funciona", async () => {
  await comAmbiente(async ({ iniciar }) => {
    const monitores: MonitorContador[] = [];
    const conexoes: ConexaoBanco[] = [];
    const criarMonitorLogados = (opcoes: OpcoesMonitorUsuariosLogados) => {
      const monitor = new MonitorContador({
        ...opcoes,
        abrirConexao: (caminho) => {
          const conexao = abrirConexaoSomenteLeitura(caminho);
          conexoes.push(conexao);
          return conexao;
        },
      });
      monitores.push(monitor);
      return monitor;
    };

    const primeiro = await iniciar({ criarMonitorLogados });
    await cadastrar(primeiro, "Ana Souza", "ana@exemplo.com");
    await logar(primeiro, "ana@exemplo.com");
    await esperarLista(primeiro, (i) => i.usuarios.length === 1, "login");
    assertEquals(monitores[0].pedidos, 1);
    await primeiro.controlador.parar();
    assertThrows(() => conexoes[0].prepare("SELECT 1;"));
    const eventosAposParar = primeiro.eventos.length;

    const reiniciado = await primeiro.controlador.iniciar(obterPortaLivre());
    assertEquals(reiniciado.ok, true, reiniciado.mensagem);
    const porta = primeiro.controlador.obterEstado().porta;
    const segundo: Servidor = {
      ...primeiro,
      origem: `http://127.0.0.1:${porta}`,
    };
    assertEquals(monitores.length, 2);
    assertEquals(segundo.controlador.obterUsuariosLogados().usuarios.length, 1);
    await logar(segundo, "ana@exemplo.com");
    await esperarLista(
      segundo,
      (i) => sessoesDe(i, i.usuarios[0]?.id ?? 0) === 2,
      "segundo login",
    );
    assertEquals(monitores[0].pedidos, 1);
    assertEquals(monitores[1].pedidos, 1);
    assert(primeiro.eventos.length > eventosAposParar);

    await segundo.controlador.parar();
    assertThrows(() => conexoes[1].prepare("SELECT 1;"));
    assertEquals(conexoes.length, 2);
    conferirSemFalhas(primeiro.registros);
  });
});
