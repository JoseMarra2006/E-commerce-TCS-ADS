import type {
  CorpoAtualizacaoParcial,
  CorpoCadastro,
  CorpoLogin,
  RespostaSessao,
  RespostaUsuario,
} from "../tipos/protocolo.ts";
import type { ClienteHttp, ResultadoHttp, TipoFalha } from "./cliente-http.ts";
import { lerRespostaSessao, lerRespostaUsuario } from "./validar-respostas.ts";

export type ResultadoOperacao<T> =
  | { ok: true; dados: T }
  | {
    ok: false;
    tipo: TipoFalha | "fora_protocolo";
    status: number | null;
    mensagem: string;
  };

export interface Operacoes {
  cadastrar: (corpo: CorpoCadastro) => Promise<ResultadoOperacao<RespostaUsuario>>;
  entrar: (corpo: CorpoLogin) => Promise<ResultadoOperacao<RespostaSessao>>;
  lerCadastro: (idUsuario: number, token: string) => Promise<ResultadoOperacao<RespostaUsuario>>;
  atualizarCadastro: (
    idUsuario: number,
    token: string,
    alteracoes: CorpoAtualizacaoParcial,
  ) => Promise<ResultadoOperacao<RespostaUsuario>>;
  excluirCadastro: (idUsuario: number, token: string) => Promise<ResultadoOperacao<true>>;
  sair: (idSessao: string, token: string) => Promise<ResultadoOperacao<true>>;
  verificarServidor: () => Promise<ResultadoOperacao<ResultadoVerificacao>>;
}

export interface ResultadoVerificacao {
  status: number;
  duracaoMs: number;
}

const MENSAGEM_FORA_PROTOCOLO = "Resposta do servidor fora do protocolo.";

function extrairDados<T>(
  resultado: ResultadoHttp,
  ler: (valor: unknown) => T | null,
): ResultadoOperacao<T> {
  if (!resultado.ok) {
    return {
      ok: false,
      tipo: resultado.tipo,
      status: resultado.status,
      mensagem: resultado.mensagem,
    };
  }

  let valor: unknown;
  try {
    valor = JSON.parse(resultado.corpoTexto);
  } catch {
    valor = undefined;
  }

  const dados = ler(valor);
  if (dados === null) {
    return {
      ok: false,
      tipo: "fora_protocolo",
      status: resultado.status,
      mensagem: MENSAGEM_FORA_PROTOCOLO,
    };
  }
  return { ok: true, dados };
}

function extrairConfirmacao(resultado: ResultadoHttp): ResultadoOperacao<true> {
  if (!resultado.ok) {
    return {
      ok: false,
      tipo: resultado.tipo,
      status: resultado.status,
      mensagem: resultado.mensagem,
    };
  }
  return { ok: true, dados: true };
}

function copiarAlteracoes(alteracoes: CorpoAtualizacaoParcial): CorpoAtualizacaoParcial {
  const corpo: CorpoAtualizacaoParcial = {};
  if (alteracoes.nome !== undefined) {
    corpo.nome = alteracoes.nome;
  }
  if (alteracoes.email !== undefined) {
    corpo.email = alteracoes.email;
  }
  if (alteracoes.senha !== undefined) {
    corpo.senha = alteracoes.senha;
  }
  return corpo;
}

async function verificar(cliente: ClienteHttp): Promise<ResultadoOperacao<ResultadoVerificacao>> {
  const inicio = performance.now();
  const resultado = await cliente.enviar({ metodo: "GET", caminho: "/api/v1/sessions" });
  const duracaoMs = Math.round(performance.now() - inicio);

  if (resultado.ok) {
    return { ok: true, dados: { status: resultado.status, duracaoMs } };
  }
  if (resultado.tipo === "http" && resultado.status !== null) {
    return { ok: true, dados: { status: resultado.status, duracaoMs } };
  }
  return {
    ok: false,
    tipo: resultado.tipo,
    status: resultado.status,
    mensagem: resultado.mensagem,
  };
}

export function criarOperacoes(cliente: ClienteHttp): Operacoes {
  return {
    cadastrar: async (corpo) =>
      extrairDados(
        await cliente.enviar({
          metodo: "POST",
          caminho: "/api/v1/users",
          corpo: { nome: corpo.nome, email: corpo.email, senha: corpo.senha },
        }),
        lerRespostaUsuario,
      ),

    entrar: async (corpo) =>
      extrairDados(
        await cliente.enviar({
          metodo: "POST",
          caminho: "/api/v1/sessions",
          corpo: { email: corpo.email, senha: corpo.senha },
        }),
        lerRespostaSessao,
      ),

    lerCadastro: async (idUsuario, token) =>
      extrairDados(
        await cliente.enviar({
          metodo: "GET",
          caminho: `/api/v1/users/${encodeURIComponent(String(idUsuario))}`,
          token,
        }),
        lerRespostaUsuario,
      ),

    atualizarCadastro: async (idUsuario, token, alteracoes) =>
      extrairDados(
        await cliente.enviar({
          metodo: "PATCH",
          caminho: `/api/v1/users/${encodeURIComponent(String(idUsuario))}`,
          token,
          corpo: copiarAlteracoes(alteracoes),
        }),
        lerRespostaUsuario,
      ),

    excluirCadastro: async (idUsuario, token) =>
      extrairConfirmacao(
        await cliente.enviar({
          metodo: "DELETE",
          caminho: `/api/v1/users/${encodeURIComponent(String(idUsuario))}`,
          token,
        }),
      ),

    sair: async (idSessao, token) =>
      extrairConfirmacao(
        await cliente.enviar({
          metodo: "DELETE",
          caminho: `/api/v1/sessions/${encodeURIComponent(idSessao)}`,
          token,
        }),
      ),

    verificarServidor: () => verificar(cliente),
  };
}
