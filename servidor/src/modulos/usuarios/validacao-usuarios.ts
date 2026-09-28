import { lerCampoTexto, lerCorpoJson } from "../../utilitarios/ler-json.ts";

export type ResultadoValidacao<T> =
  | { ok: true; dados: T }
  | { ok: false; mensagem: string };

const PADRAO_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PADRAO_SENHA = /^[a-zA-Z0-9]+$/;
const PADRAO_ID_USUARIO = /^[0-9]+$/;

export function validarEmail(valor: string): ResultadoValidacao<string> {
  const tamanho = Array.from(valor).length;

  if (tamanho < 5 || tamanho > 30) {
    return {
      ok: false,
      mensagem: "O campo email deve ter entre 5 e 30 caracteres.",
    };
  }

  if (!PADRAO_EMAIL.test(valor)) {
    return {
      ok: false,
      mensagem:
        'O campo email deve conter "@" e um domínio válido (ex.: nome@exemplo.com).',
    };
  }

  return { ok: true, dados: valor };
}

export function validarSenha(valor: string): ResultadoValidacao<string> {
  const tamanho = Array.from(valor).length;

  if (tamanho < 6 || tamanho > 20) {
    return {
      ok: false,
      mensagem: "O campo senha deve ter entre 6 e 20 caracteres.",
    };
  }

  if (!PADRAO_SENHA.test(valor)) {
    return {
      ok: false,
      mensagem:
        "O campo senha deve conter apenas letras sem acento e números, sem espaços ou caracteres especiais.",
    };
  }

  return { ok: true, dados: valor };
}

export function validarNome(valor: string): ResultadoValidacao<string> {
  const valorComTrim = valor.trim();
  const tamanho = Array.from(valorComTrim).length;

  if (tamanho < 3 || tamanho > 50) {
    return {
      ok: false,
      mensagem:
        "O campo nome deve ter entre 3 e 50 caracteres, sem contar espaços no início e no fim.",
    };
  }

  return { ok: true, dados: valorComTrim };
}

export function validarIdUsuario(texto: string): ResultadoValidacao<number> {
  const mensagemErro =
    "O id do usuário na URL deve ser um número inteiro positivo.";

  if (!PADRAO_ID_USUARIO.test(texto)) {
    return { ok: false, mensagem: mensagemErro };
  }

  const valorNumerico = Number(texto);

  if (!Number.isSafeInteger(valorNumerico) || valorNumerico <= 0) {
    return { ok: false, mensagem: mensagemErro };
  }

  return { ok: true, dados: valorNumerico };
}

function obterCampoObrigatorio(
  dados: Record<string, unknown>,
  campo: string,
  validador: (valor: string) => ResultadoValidacao<string>,
): ResultadoValidacao<string> {
  const leitura = lerCampoTexto(dados, campo, true);

  if (!leitura.ok) {
    return { ok: false, mensagem: leitura.mensagem };
  }

  if (!leitura.presente) {
    return { ok: false, mensagem: `O campo ${campo} é obrigatório.` };
  }

  return validador(leitura.valor);
}

export function validarCorpoCadastro(
  texto: string | null,
): ResultadoValidacao<{ nome: string; email: string; senha: string }> {
  const resultadoCorpo = lerCorpoJson(texto ?? "");
  if (!resultadoCorpo.ok) {
    return { ok: false, mensagem: resultadoCorpo.mensagem };
  }

  const dados = resultadoCorpo.dados;

  const resultadoNome = obterCampoObrigatorio(dados, "nome", validarNome);
  if (!resultadoNome.ok) {
    return resultadoNome;
  }

  const resultadoEmail = obterCampoObrigatorio(dados, "email", validarEmail);
  if (!resultadoEmail.ok) {
    return resultadoEmail;
  }

  const resultadoSenha = obterCampoObrigatorio(dados, "senha", validarSenha);
  if (!resultadoSenha.ok) {
    return resultadoSenha;
  }

  return {
    ok: true,
    dados: {
      nome: resultadoNome.dados,
      email: resultadoEmail.dados,
      senha: resultadoSenha.dados,
    },
  };
}

export function validarCorpoLogin(
  texto: string | null,
): ResultadoValidacao<{ email: string; senha: string }> {
  const resultadoCorpo = lerCorpoJson(texto ?? "");
  if (!resultadoCorpo.ok) {
    return { ok: false, mensagem: resultadoCorpo.mensagem };
  }

  const dados = resultadoCorpo.dados;

  const resultadoEmail = obterCampoObrigatorio(dados, "email", validarEmail);
  if (!resultadoEmail.ok) {
    return resultadoEmail;
  }

  const resultadoSenha = obterCampoObrigatorio(dados, "senha", validarSenha);
  if (!resultadoSenha.ok) {
    return resultadoSenha;
  }

  return {
    ok: true,
    dados: {
      email: resultadoEmail.dados,
      senha: resultadoSenha.dados,
    },
  };
}

export function validarCorpoAtualizacaoParcial(
  texto: string | null,
): ResultadoValidacao<{ nome?: string; email?: string; senha?: string }> {
  const resultadoCorpo = lerCorpoJson(texto ?? "");
  if (!resultadoCorpo.ok) {
    return { ok: false, mensagem: resultadoCorpo.mensagem };
  }

  const dados = resultadoCorpo.dados;
  const resultado: { nome?: string; email?: string; senha?: string } = {};

  const leituraNome = lerCampoTexto(dados, "nome", false);
  if (!leituraNome.ok) {
    return { ok: false, mensagem: leituraNome.mensagem };
  }
  if (leituraNome.presente) {
    const validacaoNome = validarNome(leituraNome.valor);
    if (!validacaoNome.ok) {
      return validacaoNome;
    }
    resultado.nome = validacaoNome.dados;
  }

  const leituraEmail = lerCampoTexto(dados, "email", false);
  if (!leituraEmail.ok) {
    return { ok: false, mensagem: leituraEmail.mensagem };
  }
  if (leituraEmail.presente) {
    const validacaoEmail = validarEmail(leituraEmail.valor);
    if (!validacaoEmail.ok) {
      return validacaoEmail;
    }
    resultado.email = validacaoEmail.dados;
  }

  const leituraSenha = lerCampoTexto(dados, "senha", false);
  if (!leituraSenha.ok) {
    return { ok: false, mensagem: leituraSenha.mensagem };
  }
  if (leituraSenha.presente) {
    const validacaoSenha = validarSenha(leituraSenha.valor);
    if (!validacaoSenha.ok) {
      return validacaoSenha;
    }
    resultado.senha = validacaoSenha.dados;
  }

  if (
    resultado.nome === undefined &&
    resultado.email === undefined &&
    resultado.senha === undefined
  ) {
    return {
      ok: false,
      mensagem: "Informe ao menos um dos campos: nome, email ou senha.",
    };
  }

  return { ok: true, dados: resultado };
}
