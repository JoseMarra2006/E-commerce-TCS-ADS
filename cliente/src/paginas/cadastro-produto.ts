import { obterMensagemPadraoStatus } from "../api/cliente-http.ts";
import type { Operacoes, ResultadoOperacao } from "../api/operacoes.ts";
import type { RespostaProduto } from "../tipos/protocolo.ts";
import { validarFormularioProduto } from "../validacao/validacao-produto.ts";
import type {
  CampoProduto,
  CamposFormularioProduto,
  ErrosProduto,
} from "../validacao/validacao-produto.ts";

export const RESUMO_ERROS_PRODUTO = "Corrija os campos destacados.";
export const MENSAGEM_DADOS_RECUSADOS = "Os dados informados foram recusados pelo servidor.";
export const MENSAGEM_SOMENTE_ADM_CADASTRA = "Apenas administradores podem cadastrar produtos.";
export const APOIO_TENTAR_NOVAMENTE = "Verifique a conexão e tente cadastrar novamente.";

export interface EstadoCadastroProduto {
  valores: CamposFormularioProduto;
  tocados: Record<CampoProduto, boolean>;
  tentouEnviar: boolean;
  mostrarResumo: boolean;
  fase: "editando" | "enviando";
  erroServidor: FalhaExibida | null;
}

export interface FalhaExibida {
  mensagem: string;
  apoio: string | null;
}

export type AcaoCadastroProduto =
  | { tipo: "alterar"; campo: CampoProduto; valor: string }
  | { tipo: "sair_do_campo"; campo: CampoProduto }
  | { tipo: "envio_invalido" }
  | { tipo: "iniciar_envio" }
  | { tipo: "falha_envio"; falha: FalhaExibida }
  | { tipo: "fim_envio" };

export type ResultadoEnvioCadastro =
  | { tipo: "invalido"; erros: ErrosProduto }
  | { tipo: "ignorado" }
  | { tipo: "criado"; produto: RespostaProduto }
  | { tipo: "nao_autorizado" }
  | { tipo: "falha"; falha: FalhaExibida };

export interface DependenciasEnvioCadastro {
  criarProduto: Operacoes["criarProduto"];
  token: string;
  trava: { current: boolean };
  aoIniciar?: () => void;
}

type FalhaOperacao = Extract<ResultadoOperacao<RespostaProduto>, { ok: false }>;

export function criarEstadoCadastroProduto(): EstadoCadastroProduto {
  return {
    valores: { nome: "", descricao: "", quantidade: "" },
    tocados: { nome: false, descricao: false, quantidade: false },
    tentouEnviar: false,
    mostrarResumo: false,
    fase: "editando",
    erroServidor: null,
  };
}

export function reduzirCadastroProduto(
  estado: EstadoCadastroProduto,
  acao: AcaoCadastroProduto,
): EstadoCadastroProduto {
  switch (acao.tipo) {
    case "alterar":
      if (estado.fase === "enviando") {
        return estado;
      }
      return { ...estado, valores: { ...estado.valores, [acao.campo]: acao.valor } };
    case "sair_do_campo":
      return estado.tocados[acao.campo]
        ? estado
        : { ...estado, tocados: { ...estado.tocados, [acao.campo]: true } };
    case "envio_invalido":
      return { ...estado, tentouEnviar: true, mostrarResumo: true, erroServidor: null };
    case "iniciar_envio":
      return estado.fase === "enviando"
        ? estado
        : { ...estado, fase: "enviando", tentouEnviar: true, mostrarResumo: false, erroServidor: null };
    case "falha_envio":
      return { ...estado, fase: "editando", erroServidor: acao.falha };
    case "fim_envio":
      return { ...estado, fase: "editando" };
  }
}

export function errosVisiveis(estado: EstadoCadastroProduto): ErrosProduto {
  const resultado = validarFormularioProduto(estado.valores);
  if (resultado.ok) {
    return {};
  }
  const visiveis: ErrosProduto = {};
  for (const campo of ["nome", "descricao", "quantidade"] as const) {
    const erro = resultado.erros[campo];
    if (erro !== undefined && (estado.tentouEnviar || estado.tocados[campo])) {
      visiveis[campo] = erro;
    }
  }
  return visiveis;
}

export function resumoVisivel(estado: EstadoCadastroProduto): boolean {
  return estado.mostrarResumo && Object.keys(errosVisiveis(estado)).length > 0;
}

function mensagemDoServidorOu(falha: FalhaOperacao, padrao: string): string {
  const status = falha.status;
  const generica = status === null ? undefined : obterMensagemPadraoStatus(status);
  return falha.mensagem.trim() === "" || falha.mensagem === generica ? padrao : falha.mensagem;
}

export function interpretarFalhaCadastro(falha: FalhaOperacao): FalhaExibida | null {
  if (falha.tipo === "http" && falha.status === 401) {
    return null;
  }
  if (falha.tipo === "entrada_invalida") {
    return { mensagem: MENSAGEM_DADOS_RECUSADOS, apoio: null };
  }
  if (falha.tipo === "http" && falha.status === 400) {
    return { mensagem: mensagemDoServidorOu(falha, MENSAGEM_DADOS_RECUSADOS), apoio: null };
  }
  if (falha.tipo === "http" && falha.status === 403) {
    return { mensagem: mensagemDoServidorOu(falha, MENSAGEM_SOMENTE_ADM_CADASTRA), apoio: null };
  }
  return { mensagem: falha.mensagem, apoio: APOIO_TENTAR_NOVAMENTE };
}

export async function enviarCadastroProduto(
  dependencias: DependenciasEnvioCadastro,
  valores: CamposFormularioProduto,
): Promise<ResultadoEnvioCadastro> {
  if (dependencias.trava.current) {
    return { tipo: "ignorado" };
  }
  const validacao = validarFormularioProduto(valores);
  if (!validacao.ok) {
    return { tipo: "invalido", erros: validacao.erros };
  }
  dependencias.trava.current = true;
  dependencias.aoIniciar?.();
  try {
    const resultado = await dependencias.criarProduto(dependencias.token, validacao.dados);
    if (resultado.ok) {
      return { tipo: "criado", produto: resultado.dados };
    }
    const falha = interpretarFalhaCadastro(resultado);
    return falha === null ? { tipo: "nao_autorizado" } : { tipo: "falha", falha };
  } finally {
    dependencias.trava.current = false;
  }
}
