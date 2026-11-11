import {
  lerCampoInteiro,
  lerCampoTexto,
  lerCorpoJson,
} from "../../utilitarios/ler-json.ts";
import { interpretarIdInteiroPositivo } from "../../utilitarios/validar-id.ts";
import type { ResultadoValidacao } from "../usuarios/validacao-usuarios.ts";
import type { AlteracoesProduto, DadosNovoProduto } from "./tipos-produtos.ts";

const QUANTIDADE_MINIMA = 0;
const QUANTIDADE_MAXIMA = 1000000;

type ResultadoCampo<T> =
  | { ok: true; presente: false }
  | { ok: true; presente: true; valor: T }
  | { ok: false; mensagem: string };

export function validarNomeProduto(valor: string): ResultadoValidacao<string> {
  const valorComTrim = valor.trim();
  const tamanho = Array.from(valorComTrim).length;

  if (tamanho < 2 || tamanho > 100) {
    return {
      ok: false,
      mensagem:
        "O campo nome deve ter entre 2 e 100 caracteres, sem contar espaços no início e no fim.",
    };
  }

  return { ok: true, dados: valorComTrim };
}

export function validarDescricaoProduto(
  valor: string,
): ResultadoValidacao<string> {
  const valorComTrim = valor.trim();

  if (Array.from(valorComTrim).length > 500) {
    return {
      ok: false,
      mensagem:
        "O campo descricao deve ter no máximo 500 caracteres, sem contar espaços no início e no fim.",
    };
  }

  return { ok: true, dados: valorComTrim };
}

export function validarQuantidadeProduto(
  valor: number,
): ResultadoValidacao<number> {
  if (valor < QUANTIDADE_MINIMA || valor > QUANTIDADE_MAXIMA) {
    return {
      ok: false,
      mensagem: "O campo quantidade deve estar entre 0 e 1.000.000.",
    };
  }

  return { ok: true, dados: valor };
}

export function validarIdProduto(texto: string): ResultadoValidacao<number> {
  const id = interpretarIdInteiroPositivo(texto);

  if (id === undefined) {
    return {
      ok: false,
      mensagem: "O id do produto na URL deve ser um número inteiro positivo.",
    };
  }

  return { ok: true, dados: id };
}

function lerTexto(
  dados: Record<string, unknown>,
  campo: string,
  obrigatorio: boolean,
  validador: (valor: string) => ResultadoValidacao<string>,
): ResultadoCampo<string> {
  const leitura = lerCampoTexto(dados, campo, obrigatorio);
  if (!leitura.ok || !leitura.presente) {
    return leitura;
  }

  const validacao = validador(leitura.valor);
  if (!validacao.ok) {
    return validacao;
  }

  return { ok: true, presente: true, valor: validacao.dados };
}

function lerQuantidade(
  dados: Record<string, unknown>,
  obrigatorio: boolean,
): ResultadoCampo<number> {
  const leitura = lerCampoInteiro(dados, "quantidade", obrigatorio);
  if (!leitura.ok || !leitura.presente) {
    return leitura;
  }

  const validacao = validarQuantidadeProduto(leitura.valor);
  if (!validacao.ok) {
    return validacao;
  }

  return { ok: true, presente: true, valor: validacao.dados };
}

function lerCampos(
  texto: string | null,
  obrigatorio: boolean,
): ResultadoValidacao<AlteracoesProduto> {
  const resultadoCorpo = lerCorpoJson(texto ?? "");
  if (!resultadoCorpo.ok) {
    return { ok: false, mensagem: resultadoCorpo.mensagem };
  }

  const dados = resultadoCorpo.dados;
  const campos: AlteracoesProduto = {};

  const nome = lerTexto(dados, "nome", obrigatorio, validarNomeProduto);
  if (!nome.ok) {
    return { ok: false, mensagem: nome.mensagem };
  }
  if (nome.presente) {
    campos.nome = nome.valor;
  }

  const descricao = lerTexto(
    dados,
    "descricao",
    obrigatorio,
    validarDescricaoProduto,
  );
  if (!descricao.ok) {
    return { ok: false, mensagem: descricao.mensagem };
  }
  if (descricao.presente) {
    campos.descricao = descricao.valor;
  }

  const quantidade = lerQuantidade(dados, obrigatorio);
  if (!quantidade.ok) {
    return { ok: false, mensagem: quantidade.mensagem };
  }
  if (quantidade.presente) {
    campos.quantidade = quantidade.valor;
  }

  return { ok: true, dados: campos };
}

export function validarCorpoCadastroProduto(
  texto: string | null,
): ResultadoValidacao<DadosNovoProduto> {
  const resultado = lerCampos(texto, true);
  if (!resultado.ok) {
    return resultado;
  }

  const { nome, descricao, quantidade } = resultado.dados;
  if (
    nome === undefined || descricao === undefined || quantidade === undefined
  ) {
    return {
      ok: false,
      mensagem: "Os campos nome, descricao e quantidade são obrigatórios.",
    };
  }

  return { ok: true, dados: { nome, descricao, quantidade } };
}

export function validarCorpoAtualizacaoParcialProduto(
  texto: string | null,
): ResultadoValidacao<AlteracoesProduto> {
  const resultado = lerCampos(texto, false);
  if (!resultado.ok) {
    return resultado;
  }

  const { nome, descricao, quantidade } = resultado.dados;
  if (
    nome === undefined && descricao === undefined && quantidade === undefined
  ) {
    return {
      ok: false,
      mensagem:
        "Informe ao menos um dos campos: nome, descricao ou quantidade.",
    };
  }

  return { ok: true, dados: resultado.dados };
}
