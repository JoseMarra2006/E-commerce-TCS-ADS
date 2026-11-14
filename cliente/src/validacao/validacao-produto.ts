import type { DadosProduto } from "../tipos/protocolo.ts";
import type { ResultadoCampo } from "./validacao-campos.ts";

export const NOME_PRODUTO_MINIMO = 2;
export const NOME_PRODUTO_MAXIMO = 100;
export const DESCRICAO_PRODUTO_MAXIMA = 500;
export const QUANTIDADE_PRODUTO_MAXIMA = 1000000;

export const MENSAGEM_NOME_PRODUTO_VAZIO = "Informe o nome do produto.";
export const MENSAGEM_NOME_PRODUTO_TAMANHO = "O nome deve ter entre 2 e 100 caracteres.";
export const MENSAGEM_DESCRICAO_PRODUTO_TAMANHO = "A descrição deve ter no máximo 500 caracteres.";
export const MENSAGEM_QUANTIDADE_VAZIA = "Informe a quantidade.";
export const MENSAGEM_QUANTIDADE_FORMATO =
  "Digite apenas números inteiros, sem sinais, pontos, vírgulas ou letras.";
export const MENSAGEM_QUANTIDADE_FAIXA = "A quantidade deve estar entre 0 e 1.000.000.";

const PADRAO_DIGITOS_ASCII = /^[0-9]+$/;
const DIGITOS_QUANTIDADE_MAXIMA = String(QUANTIDADE_PRODUTO_MAXIMA).length;

export type ResultadoQuantidade = { ok: true; valor: number } | { ok: false; mensagem: string };

export interface CamposFormularioProduto {
  nome: string;
  descricao: string;
  quantidade: string;
}

export interface ErrosProduto {
  nome?: string;
  descricao?: string;
  quantidade?: string;
}

export type CampoProduto = keyof ErrosProduto;

export type ResultadoFormularioProduto =
  | { ok: true; dados: DadosProduto }
  | { ok: false; erros: ErrosProduto };

export function contarCaracteres(texto: string): number {
  return Array.from(texto).length;
}

export function validarNomeProduto(valor: string): ResultadoCampo {
  const aparado = valor.trim();
  if (aparado === "") {
    return { ok: false, mensagem: MENSAGEM_NOME_PRODUTO_VAZIO };
  }
  const tamanho = contarCaracteres(aparado);
  if (tamanho < NOME_PRODUTO_MINIMO || tamanho > NOME_PRODUTO_MAXIMO) {
    return { ok: false, mensagem: MENSAGEM_NOME_PRODUTO_TAMANHO };
  }
  return { ok: true, valor: aparado };
}

export function validarDescricaoProduto(valor: string): ResultadoCampo {
  const aparado = valor.trim();
  if (contarCaracteres(aparado) > DESCRICAO_PRODUTO_MAXIMA) {
    return { ok: false, mensagem: MENSAGEM_DESCRICAO_PRODUTO_TAMANHO };
  }
  return { ok: true, valor: aparado };
}

export function validarQuantidadeProduto(valor: string): ResultadoQuantidade {
  const aparado = valor.trim();
  if (aparado === "") {
    return { ok: false, mensagem: MENSAGEM_QUANTIDADE_VAZIA };
  }
  if (!PADRAO_DIGITOS_ASCII.test(aparado)) {
    return { ok: false, mensagem: MENSAGEM_QUANTIDADE_FORMATO };
  }
  const semZerosAEsquerda = aparado.replace(/^0+/, "");
  if (semZerosAEsquerda === "") {
    return { ok: true, valor: 0 };
  }
  if (semZerosAEsquerda.length > DIGITOS_QUANTIDADE_MAXIMA) {
    return { ok: false, mensagem: MENSAGEM_QUANTIDADE_FAIXA };
  }
  const numero = Number(semZerosAEsquerda);
  if (!Number.isSafeInteger(numero) || numero < 0 || numero > QUANTIDADE_PRODUTO_MAXIMA) {
    return { ok: false, mensagem: MENSAGEM_QUANTIDADE_FAIXA };
  }
  return { ok: true, valor: numero };
}

export function validarFormularioProduto(campos: CamposFormularioProduto): ResultadoFormularioProduto {
  const nome = validarNomeProduto(campos.nome);
  const descricao = validarDescricaoProduto(campos.descricao);
  const quantidade = validarQuantidadeProduto(campos.quantidade);

  if (nome.ok && descricao.ok && quantidade.ok) {
    return {
      ok: true,
      dados: { nome: nome.valor, descricao: descricao.valor, quantidade: quantidade.valor },
    };
  }

  const erros: ErrosProduto = {};
  if (!nome.ok) {
    erros.nome = nome.mensagem;
  }
  if (!descricao.ok) {
    erros.descricao = descricao.mensagem;
  }
  if (!quantidade.ok) {
    erros.quantidade = quantidade.mensagem;
  }
  return { ok: false, erros };
}

export function primeiroCampoInvalido(erros: ErrosProduto): CampoProduto | null {
  if (erros.nome !== undefined) {
    return "nome";
  }
  if (erros.descricao !== undefined) {
    return "descricao";
  }
  if (erros.quantidade !== undefined) {
    return "quantidade";
  }
  return null;
}

export function quantidadeParaTexto(quantidade: number): string {
  if (!Number.isSafeInteger(quantidade) || quantidade < 0) {
    return "";
  }
  return String(quantidade);
}
