import { assertEquals } from "@std/assert";
import {
  ControladorServidor,
  type OpcoesControladorServidor,
} from "../../src/controlador-servidor.ts";
import type { Registro } from "../../src/estado.ts";
import {
  abrirConexaoSomenteLeitura,
  consultarUsuariosLogados,
  type UsuarioLogado,
} from "../../src/logados/consulta-usuarios-logados.ts";
import type { InstantaneoLogados } from "../../src/logados/monitor-usuarios-logados.ts";
import { criarAplicacaoPainel } from "../../src/painel/aplicacao-painel.ts";
import {
  criarFonteLogadosDoControlador,
  type FonteUsuariosLogados,
} from "../../src/painel/logados-painel.ts";
import { fecharConexao } from "../../src/banco/conexao.ts";
import {
  criarCaminhoBancoTemporario,
  removerBancoTemporario,
} from "./banco-temporario.ts";
import {
  type ClienteSse,
  type EventoSse,
  lerFluxoSse,
} from "./cliente-sse-teste.ts";
import {
  type CorpoSessao,
  verificarRespostaSessao,
  verificarRespostaUsuario,
  verificarRespostaVazia,
} from "./conformidade.ts";
import {
  criarCaminhoSegredoTemporario,
  removerSegredoTemporario,
} from "./segredo-temporario.ts";

export const API = "/api/v1";
export const SENHA_PADRAO_TESTE = "senha123";

export interface OpcoesEnvio {
  token?: string;
  corpo?: unknown;
}

export interface AmbienteLogados {
  caminhoBanco: string;
  controlador: ControladorServidor;
  registros: Registro[];
  origemPainel: string;
  inscricoesAtivas: () => number;
  iniciar: () => Promise<void>;
  conectar: () => Promise<ClienteSse>;
  api: (
    metodo: string,
    caminho: string,
    opcoes?: OpcoesEnvio,
  ) => Promise<Response>;
}

export interface OpcoesAmbienteLogados {
  opcoesControlador?: OpcoesControladorServidor;
  criarControlador?: (
    opcoes: OpcoesControladorServidor,
  ) => ControladorServidor;
  prepararBanco?: (caminhoBanco: string) => void;
  iniciarAutomaticamente?: boolean;
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

export async function comAmbienteLogados(
  teste: (ambiente: AmbienteLogados) => Promise<void>,
  opcoes: OpcoesAmbienteLogados = {},
): Promise<void> {
  const caminhoBanco = criarCaminhoBancoTemporario();
  const caminhoSegredoJwt = criarCaminhoSegredoTemporario();
  const opcoesControlador: OpcoesControladorServidor = {
    caminhoBanco,
    caminhoSegredoJwt,
    ...opcoes.opcoesControlador,
  };
  const controlador = opcoes.criarControlador
    ? opcoes.criarControlador(opcoesControlador)
    : new ControladorServidor(opcoesControlador);
  const registros: Registro[] = [];
  controlador.addEventListener("registro", (evento) => {
    registros.push((evento as CustomEvent<Registro>).detail);
  });
  const sinal = new AbortController();
  const { contadora, ativas } = contarInscricoes(
    criarFonteLogadosDoControlador(controlador),
  );
  let portaPainel = 0;
  let portaApi = 0;
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
  const origemPainel = `http://127.0.0.1:${portaPainel}`;
  const clientes: ClienteSse[] = [];

  const iniciar = async () => {
    portaApi = obterPortaLivre();
    const resultado = await controlador.iniciar(portaApi);
    assertEquals(resultado.ok, true, resultado.mensagem);
  };

  try {
    opcoes.prepararBanco?.(caminhoBanco);
    if (opcoes.iniciarAutomaticamente ?? true) {
      await iniciar();
    }
    await teste({
      caminhoBanco,
      controlador,
      registros,
      origemPainel,
      inscricoesAtivas: ativas,
      iniciar,
      conectar: async () => {
        const resposta = await fetch(`${origemPainel}/eventos`);
        assertEquals(resposta.status, 200);
        const cliente = lerFluxoSse(resposta);
        clientes.push(cliente);
        await cliente.esperar(
          (eventos) => eventos.some((e) => e.evento === "logados"),
          "logados inicial",
        );
        return cliente;
      },
      api: (metodo, caminho, opcoesEnvio = {}) => {
        const cabecalhos: Record<string, string> = {};
        if (opcoesEnvio.token !== undefined) {
          cabecalhos["Authorization"] = `Bearer ${opcoesEnvio.token}`;
        }
        let corpo: string | undefined;
        if (opcoesEnvio.corpo !== undefined) {
          cabecalhos["Content-Type"] = "application/json";
          corpo = JSON.stringify(opcoesEnvio.corpo);
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

export function eventosLogados(cliente: ClienteSse): EventoSse[] {
  return cliente.eventos.filter((e) => e.evento === "logados");
}

export function ultimoLogados(cliente: ClienteSse): InstantaneoLogados {
  const lista = eventosLogados(cliente);
  return JSON.parse(lista[lista.length - 1].dados);
}

export async function esperarLista(
  cliente: ClienteSse,
  condicao: (instantaneo: InstantaneoLogados) => boolean,
  descricao: string,
  limiteMs = 1000,
): Promise<InstantaneoLogados> {
  await cliente.esperar(
    () =>
      eventosLogados(cliente).length > 0 && condicao(ultimoLogados(cliente)),
    descricao,
    limiteMs,
  );
  return ultimoLogados(cliente);
}

export function sessoesDe(instantaneo: InstantaneoLogados, id: number): number {
  return instantaneo.usuarios.find((u) => u.id === id)?.sessoes ?? 0;
}

export function lerLogadosDoBanco(caminhoBanco: string): UsuarioLogado[] {
  const conexao = abrirConexaoSomenteLeitura(caminhoBanco);
  try {
    return consultarUsuariosLogados(conexao);
  } finally {
    fecharConexao(conexao);
  }
}

export async function esperarIgualAoBanco(
  caminhoBanco: string,
  cliente: ClienteSse,
  descricao: string,
  limiteMs = 1000,
): Promise<InstantaneoLogados> {
  const inicio = Date.now();
  while (true) {
    const verdade = JSON.stringify(lerLogadosDoBanco(caminhoBanco));
    const eventos = eventosLogados(cliente);
    const ultimo = eventos.length > 0 ? ultimoLogados(cliente) : null;
    if (
      ultimo !== null && ultimo.estado === "disponivel" &&
      JSON.stringify(ultimo.usuarios) === verdade
    ) {
      return ultimo;
    }
    if (Date.now() - inicio > limiteMs) {
      throw new Error(
        `A lista do SSE não convergiu para o banco em ${limiteMs} ms: ${descricao}. Banco: ${verdade}. SSE: ${
          JSON.stringify(ultimo)
        }`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

export async function cadastrar(
  ambiente: AmbienteLogados,
  nome: string,
  email: string,
): Promise<number> {
  return (await verificarRespostaUsuario(
    await ambiente.api("POST", `${API}/users`, {
      corpo: { nome, email, senha: SENHA_PADRAO_TESTE },
    }),
    201,
  )).corpo.id;
}

export async function logar(
  ambiente: AmbienteLogados,
  email: string,
  senha = SENHA_PADRAO_TESTE,
): Promise<CorpoSessao> {
  return (await verificarRespostaSessao(
    await ambiente.api("POST", `${API}/sessions`, {
      corpo: { email, senha },
    }),
  )).corpo;
}

export async function sair(
  ambiente: AmbienteLogados,
  sessao: CorpoSessao,
): Promise<void> {
  await verificarRespostaVazia(
    await ambiente.api("DELETE", `${API}/sessions/${sessao.id}`, {
      token: sessao.token,
    }),
  );
}

export function conferirSemFalhas(
  registros: Registro[],
  errosEsperados: string[] = [],
): void {
  assertEquals(
    registros.filter((r) => r.tipo === "requisicao" && r.status >= 500),
    [],
  );
  assertEquals(
    registros.filter((r) =>
      r.tipo === "sistema" && r.nivel === "erro" &&
      !errosEsperados.includes(r.mensagem)
    ),
    [],
  );
}
