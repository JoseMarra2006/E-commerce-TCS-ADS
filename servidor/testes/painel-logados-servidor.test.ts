import "./auxiliares/vigia-arquivos-reais.ts";
import { assert, assertEquals } from "@std/assert";
import {
  ControladorServidor,
  type OpcoesControladorServidor,
} from "../src/controlador-servidor.ts";
import type { Registro } from "../src/estado.ts";
import type { InstantaneoLogados } from "../src/logados/monitor-usuarios-logados.ts";
import { MonitorUsuariosLogados } from "../src/logados/monitor-usuarios-logados.ts";
import {
  EMAIL_ADM_PADRAO,
  SENHA_ADM_PADRAO,
} from "../src/modulos/usuarios/adm-padrao.ts";
import { criarAplicacaoPainel } from "../src/painel/aplicacao-painel.ts";
import {
  criarFonteLogadosDoControlador,
  type FonteUsuariosLogados,
} from "../src/painel/logados-painel.ts";
import {
  criarCaminhoBancoTemporario,
  removerBancoTemporario,
} from "./auxiliares/banco-temporario.ts";
import {
  type ClienteSse,
  type EventoSse,
  lerFluxoSse,
} from "./auxiliares/cliente-sse-teste.ts";
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
const CHAVES = ["id", "nome", "email", "tipo", "sessoes", "desde"];

interface Ambiente {
  controlador: ControladorServidor;
  registros: Registro[];
  sinal: AbortController;
  inscricoesAtivas: () => number;
  conectar: () => Promise<ClienteSse>;
  api: (
    metodo: string,
    caminho: string,
    opcoes?: { token?: string; corpo?: unknown },
  ) => Promise<Response>;
}

function obterPortaLivre(): number {
  const listener = Deno.listen({ port: 0 });
  const porta = (listener.addr as Deno.NetAddr).port;
  listener.close();
  return porta;
}

function contarInscricoes(fonte: FonteUsuariosLogados) {
  let ativas = 0;
  const contadora: FonteUsuariosLogados = {
    obter: fonte.obter,
    inscrever: (ouvinte) => {
      const cancelar = fonte.inscrever(ouvinte);
      ativas++;
      let cancelada = false;
      return () => {
        if (!cancelada) {
          cancelada = true;
          ativas--;
        }
        cancelar();
      };
    },
  };
  return { contadora, ativas: () => ativas };
}

async function comAmbiente(
  teste: (ambiente: Ambiente) => Promise<void>,
  opcoesControlador: OpcoesControladorServidor = {},
): Promise<void> {
  const caminhoBanco = criarCaminhoBancoTemporario();
  const caminhoSegredoJwt = criarCaminhoSegredoTemporario();
  const controlador = new ControladorServidor({
    caminhoBanco,
    caminhoSegredoJwt,
    ...opcoesControlador,
  });
  const registros: Registro[] = [];
  controlador.addEventListener("registro", (evento) => {
    registros.push((evento as CustomEvent<Registro>).detail);
  });
  const sinal = new AbortController();
  const { contadora, ativas } = contarInscricoes(
    criarFonteLogadosDoControlador(controlador),
  );
  let portaPainel = 0;
  const app = await criarAplicacaoPainel({
    controlador,
    token: "token-de-teste",
    obterPortaPainel: () => portaPainel,
    encerrarProcesso: () => {},
    sinalEncerramento: sinal.signal,
    fonteLogados: contadora,
  });
  const servidorPainel = Deno.serve(
    { hostname: "127.0.0.1", port: 0, onListen: () => {} },
    (requisicao) => app.fetch(requisicao),
  );
  portaPainel = servidorPainel.addr.port;
  const portaApi = obterPortaLivre();
  const clientes: ClienteSse[] = [];
  try {
    const resultado = await controlador.iniciar(portaApi);
    assertEquals(resultado.ok, true, resultado.mensagem);
    await teste({
      controlador,
      registros,
      sinal,
      inscricoesAtivas: ativas,
      conectar: async () => {
        const resposta = await fetch(`http://127.0.0.1:${portaPainel}/eventos`);
        assertEquals(resposta.status, 200);
        const cliente = lerFluxoSse(resposta);
        clientes.push(cliente);
        await cliente.esperar(
          (eventos) => eventos.some((e) => e.evento === "logados"),
          "logados inicial",
        );
        return cliente;
      },
      api: (metodo, caminho, opcoes = {}) => {
        const cabecalhos: Record<string, string> = {};
        if (opcoes.token !== undefined) {
          cabecalhos["Authorization"] = `Bearer ${opcoes.token}`;
        }
        let corpo: string | undefined;
        if (opcoes.corpo !== undefined) {
          cabecalhos["Content-Type"] = "application/json";
          corpo = JSON.stringify(opcoes.corpo);
        }
        return fetch(`http://127.0.0.1:${portaApi}${caminho}`, {
          method: metodo,
          headers: cabecalhos,
          body: corpo,
        });
      },
    });
  } finally {
    for (const cliente of clientes) {
      await cliente.fechar();
    }
    if (controlador.obterEstado().status === "em_execucao") {
      await controlador.parar();
    }
    sinal.abort();
    await servidorPainel.shutdown();
    removerBancoTemporario(caminhoBanco);
    removerSegredoTemporario(caminhoSegredoJwt);
  }
}

function logados(cliente: ClienteSse): EventoSse[] {
  return cliente.eventos.filter((e) => e.evento === "logados");
}

function ultimo(cliente: ClienteSse): InstantaneoLogados {
  const lista = logados(cliente);
  return JSON.parse(lista[lista.length - 1].dados);
}

async function esperarLista(
  cliente: ClienteSse,
  condicao: (instantaneo: InstantaneoLogados) => boolean,
  descricao: string,
): Promise<InstantaneoLogados> {
  await cliente.esperar(
    () => logados(cliente).length > 0 && condicao(ultimo(cliente)),
    descricao,
  );
  return ultimo(cliente);
}

function sessoesDe(instantaneo: InstantaneoLogados, id: number): number {
  return instantaneo.usuarios.find((u) => u.id === id)?.sessoes ?? 0;
}

async function cadastrar(
  ambiente: Ambiente,
  nome: string,
  email: string,
): Promise<number> {
  return (await verificarRespostaUsuario(
    await ambiente.api("POST", `${API}/users`, {
      corpo: { nome, email, senha: "senha123" },
    }),
    201,
  )).corpo.id;
}

async function logar(
  ambiente: Ambiente,
  email: string,
  senha = "senha123",
): Promise<CorpoSessao> {
  return (await verificarRespostaSessao(
    await ambiente.api("POST", `${API}/sessions`, {
      corpo: { email, senha },
    }),
  )).corpo;
}

async function sair(ambiente: Ambiente, sessao: CorpoSessao): Promise<void> {
  await verificarRespostaVazia(
    await ambiente.api("DELETE", `${API}/sessions/${sessao.id}`, {
      token: sessao.token,
    }),
  );
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

Deno.test("fluxo completo pelo protocolo chega ao SSE do painel, sem dados sensíveis", async () => {
  await comAmbiente(async (ambiente) => {
    const cliente = await ambiente.conectar();
    assertEquals(cliente.eventos[0].evento, "estado");
    assertEquals(cliente.eventos[1].evento, "logados");
    const inicial = ultimo(cliente);
    assertEquals(inicial.estado, "disponivel");
    assertEquals(inicial.usuarios, []);

    const idAna = await cadastrar(ambiente, "Ana Souza", "ana@exemplo.com");
    const idBruno = await cadastrar(
      ambiente,
      "Bruno Lima",
      "bruno@exemplo.com",
    );
    const sessoes: CorpoSessao[] = [];

    const ana1 = await logar(ambiente, "ana@exemplo.com");
    sessoes.push(ana1);
    let lista = await esperarLista(
      cliente,
      (i) => sessoesDe(i, idAna) === 1,
      "login da Ana",
    );
    assertEquals(lista.usuarios[0].tipo, "comum");
    const ana2 = await logar(ambiente, "ana@exemplo.com");
    sessoes.push(ana2);
    await esperarLista(cliente, (i) => sessoesDe(i, idAna) === 2, "2 sessões");
    await sair(ambiente, ana1);
    await esperarLista(cliente, (i) => sessoesDe(i, idAna) === 1, "logout");
    await sair(ambiente, ana2);
    await esperarLista(
      cliente,
      (i) => i.usuarios.length === 0,
      "último logout",
    );

    const adm = await logar(ambiente, EMAIL_ADM_PADRAO, SENHA_ADM_PADRAO);
    sessoes.push(adm);
    lista = await esperarLista(
      cliente,
      (i) => i.usuarios.length === 1,
      "login do ADM",
    );
    assertEquals(lista.usuarios[0].tipo, "administrador");

    const bruno = await logar(ambiente, "bruno@exemplo.com");
    sessoes.push(bruno);
    await esperarLista(cliente, (i) => sessoesDe(i, idBruno) === 1, "Bruno");
    await verificarRespostaUsuario(
      await ambiente.api("PATCH", `${API}/users/${idBruno}`, {
        token: bruno.token,
        corpo: { nome: "Bruno Novo" },
      }),
      200,
    );
    await esperarLista(
      cliente,
      (i) => i.usuarios.some((u) => u.nome === "Bruno Novo"),
      "PATCH de nome",
    );
    await verificarRespostaVazia(
      await ambiente.api("DELETE", `${API}/users/${idBruno}`, {
        token: adm.token,
      }),
    );
    await esperarLista(
      cliente,
      (i) => i.usuarios.map((u) => u.id).join() === `${adm.usuario.id}`,
      "exclusão do Bruno logado",
    );
    await verificarRespostaVazia(
      await ambiente.api("DELETE", `${API}/users/${adm.usuario.id}`, {
        token: adm.token,
      }),
    );
    await esperarLista(cliente, (i) => i.usuarios.length === 0, "ADM sai");

    const eventos = logados(cliente);
    assert(eventos.length >= 10, `eventos: ${eventos.length}`);
    for (const evento of eventos) {
      assertEquals(evento.campos, ["event", "data"]);
      const dado: InstantaneoLogados = JSON.parse(evento.dados);
      assertEquals(Object.keys(dado), ["estado", "usuarios", "atualizadoEm"]);
      for (const item of dado.usuarios) {
        assertEquals(Object.keys(item), CHAVES);
      }
      for (const sessao of sessoes) {
        assertEquals(evento.dados.includes(sessao.id), false);
        assertEquals(evento.dados.includes(sessao.token), false);
      }
      for (const proibido of ["senha", "hash", "salt", "token", "papel"]) {
        assertEquals(evento.dados.includes(proibido), false, proibido);
      }
    }
    const bruto = cliente.bruto();
    for (const sessao of sessoes) {
      assertEquals(bruto.includes(sessao.token), false);
    }
    assertEquals(bruto.includes("senha123"), false);
    assertEquals(bruto.includes("hash-"), false);
    assertEquals(bruto.includes("senha_hash"), false);
    assertEquals(bruto.includes("senha_salt"), false);
    conferirSemFalhas(ambiente.registros);
  });
});

Deno.test("cliente conectado depois recebe a lista completa na hora; vários clientes veem os mesmos eventos", async () => {
  await comAmbiente(async (ambiente) => {
    const primeiro = await ambiente.conectar();
    const ids: number[] = [];
    for (const nome of ["Ana", "Bruno", "Carla"]) {
      ids.push(
        await cadastrar(
          ambiente,
          `${nome} Teste`,
          `${nome.toLowerCase()}@x.com`,
        ),
      );
      await logar(ambiente, `${nome.toLowerCase()}@x.com`);
    }
    await esperarLista(primeiro, (i) => i.usuarios.length === 3, "3 logados");

    const segundo = await ambiente.conectar();
    const terceiro = await ambiente.conectar();
    assertEquals(logados(segundo).length, 1);
    assertEquals(ultimo(segundo).usuarios.map((u) => u.id), ids);
    assertEquals(ambiente.inscricoesAtivas(), 3);

    await terceiro.fechar();
    const davi = await cadastrar(ambiente, "Davi Teste", "davi@x.com");
    await logar(ambiente, "davi@x.com");
    for (const cliente of [primeiro, segundo]) {
      await esperarLista(cliente, (i) => i.usuarios.length === 4, "Davi");
    }
    assertEquals(ultimo(primeiro), ultimo(segundo));
    assertEquals(ultimo(primeiro).usuarios.at(-1)?.id, davi);
    assertEquals(ambiente.inscricoesAtivas(), 2);

    for (let i = 0; i < 5; i++) {
      const extra = await ambiente.conectar();
      assertEquals(ultimo(extra).usuarios.length, 4);
      await extra.fechar();
    }
    const inicio = Date.now();
    while (ambiente.inscricoesAtivas() !== 2 && Date.now() - inicio < 1000) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assertEquals(ambiente.inscricoesAtivas(), 2);
    conferirSemFalhas(ambiente.registros);
  });
});

Deno.test("nomes com caracteres problemáticos atravessam o protocolo e o SSE intactos", async () => {
  await comAmbiente(async (ambiente) => {
    const cliente = await ambiente.conectar();
    const nome = 'Zé\nevent: x\r\ndata: y\u2028"\\🚀\u2029fim';
    const id = await cadastrar(ambiente, nome, "ze@x.com");
    await logar(ambiente, "ze@x.com");
    const lista = await esperarLista(
      cliente,
      (i) => i.usuarios.length === 1,
      "login do Zé",
    );
    assertEquals(lista.usuarios[0], {
      ...lista.usuarios[0],
      id,
      nome,
      email: "ze@x.com",
    });
    for (const evento of logados(cliente)) {
      assertEquals(evento.campos, ["event", "data"]);
    }
    assertEquals(
      cliente.eventos.filter((e) =>
        !["estado", "logados", "registro", "ping"].includes(e.evento)
      ),
      [],
    );
  });
});

Deno.test("monitor indisponível: o fluxo traz estado indisponivel e o servidor segue atendendo", async () => {
  await comAmbiente(async (ambiente) => {
    const cliente = await ambiente.conectar();
    assertEquals(ultimo(cliente), {
      estado: "indisponivel",
      usuarios: [],
      atualizadoEm: null,
    });
    await cadastrar(ambiente, "Ana Souza", "ana@exemplo.com");
    const sessao = await logar(ambiente, "ana@exemplo.com");
    await sair(ambiente, sessao);
    await new Promise((resolve) => setTimeout(resolve, 300));
    assertEquals(ultimo(cliente).estado, "indisponivel");
    assert(!cliente.terminou());
    assertEquals(ambiente.controlador.obterEstado().status, "em_execucao");
  }, {
    criarMonitorLogados: (opcoes) =>
      new MonitorUsuariosLogados({
        ...opcoes,
        abrirConexao: () => {
          throw new Error("falha simulada");
        },
      }),
  });
});

Deno.test("parada do controlador envia lista indisponível e o encerramento fecha o fluxo sem ouvinte", async () => {
  await comAmbiente(async (ambiente) => {
    const cliente = await ambiente.conectar();
    await cadastrar(ambiente, "Ana Souza", "ana@exemplo.com");
    await logar(ambiente, "ana@exemplo.com");
    await esperarLista(cliente, (i) => i.usuarios.length === 1, "login");

    assertEquals((await ambiente.controlador.parar()).ok, true);
    const parado = await esperarLista(
      cliente,
      (i) => i.estado === "indisponivel",
      "parada",
    );
    assertEquals(parado, {
      estado: "indisponivel",
      usuarios: [],
      atualizadoEm: null,
    });
    await cliente.esperar(
      (eventos) =>
        eventos.some((e) =>
          e.evento === "estado" && JSON.parse(e.dados).status === "parada"
        ),
      "estado parada",
    );
    assert(!cliente.terminou());

    ambiente.sinal.abort();
    await cliente.esperar(() => cliente.terminou(), "fim do fluxo");
    assertEquals(ambiente.inscricoesAtivas(), 0);
    conferirSemFalhas(ambiente.registros);
  });
});

Deno.test("rajada de 40 logins gera menos de 40 eventos e o último traz os 40 ordenados", async () => {
  await comAmbiente(async (ambiente) => {
    const ids = await Promise.all(
      Array.from(
        { length: 40 },
        (_, i) => cadastrar(ambiente, `Usuário ${i}`, `u${i}@teste.com`),
      ),
    );
    const cliente = await ambiente.conectar();
    const antes = logados(cliente).length;
    await Promise.all(
      Array.from({ length: 40 }, (_, i) => logar(ambiente, `u${i}@teste.com`)),
    );
    const lista = await esperarLista(
      cliente,
      (i) => i.usuarios.length === 40,
      "40 logados",
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
    const durante = logados(cliente).length - antes;
    assert(durante < 40, `eventos durante a rajada: ${durante}`);
    assertEquals(ultimo(cliente), lista);
    assertEquals(
      lista.usuarios.map((u) => u.id),
      [...ids].sort((a, b) => a - b),
    );
    conferirSemFalhas(ambiente.registros);
  });
});
