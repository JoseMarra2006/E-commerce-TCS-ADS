import type {
  CorpoAtualizacaoParcial,
  CorpoCadastro,
  CorpoLogin,
  RespostaUsuario,
} from "../tipos/protocolo.ts";

export type ResultadoCampo = { ok: true; valor: string } | { ok: false; mensagem: string };
export type ResultadoPorta = { ok: true; valor: number } | { ok: false; mensagem: string };

export interface ErrosCadastro {
  nome?: string;
  email?: string;
  senha?: string;
}

export interface ErrosLogin {
  email?: string;
  senha?: string;
}

export interface ErrosConexao {
  ip?: string;
  porta?: string;
}

export type ResultadoFormularioCadastro =
  | { ok: true; dados: CorpoCadastro }
  | { ok: false; erros: ErrosCadastro };

export type ResultadoFormularioLogin =
  | { ok: true; dados: CorpoLogin }
  | { ok: false; erros: ErrosLogin };

export type ResultadoFormularioConexao =
  | { ok: true; dados: { ip: string; porta: number } }
  | { ok: false; erros: ErrosConexao };

export type ResultadoFormularioEdicao =
  | { ok: true; dados: CorpoAtualizacaoParcial }
  | { ok: false; erros: ErrosCadastro }
  | { ok: false; nadaAlterado: true };

const PADRAO_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PADRAO_SENHA = /^[a-zA-Z0-9]+$/;
const PADRAO_IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const PADRAO_ROTULO = /^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
const PADRAO_DIGITOS = /^[0-9]+$/;

export function validarEmail(valor: string): ResultadoCampo {
  const tamanho = Array.from(valor).length;

  if (tamanho < 5 || tamanho > 30) {
    return { ok: false, mensagem: "O campo email deve ter entre 5 e 30 caracteres." };
  }

  if (!PADRAO_EMAIL.test(valor)) {
    return {
      ok: false,
      mensagem: 'O campo email deve conter "@" e um domínio válido (ex.: nome@exemplo.com).',
    };
  }

  return { ok: true, valor };
}

export function validarSenha(valor: string): ResultadoCampo {
  const tamanho = Array.from(valor).length;

  if (tamanho < 6 || tamanho > 20) {
    return { ok: false, mensagem: "O campo senha deve ter entre 6 e 20 caracteres." };
  }

  if (!PADRAO_SENHA.test(valor)) {
    return {
      ok: false,
      mensagem:
        "O campo senha deve conter apenas letras sem acento e números, sem espaços ou caracteres especiais.",
    };
  }

  return { ok: true, valor };
}

export function validarNome(valor: string): ResultadoCampo {
  const valorComTrim = valor.trim();
  const tamanho = Array.from(valorComTrim).length;

  if (tamanho < 3 || tamanho > 50) {
    return {
      ok: false,
      mensagem:
        "O campo nome deve ter entre 3 e 50 caracteres, sem contar espaços no início e no fim.",
    };
  }

  return { ok: true, valor: valorComTrim };
}

function ehIpv4Valido(texto: string): boolean {
  const partes = PADRAO_IPV4.exec(texto);
  if (partes === null) {
    return false;
  }
  return partes.slice(1).every((parte) => Number(parte) <= 255);
}

function ehNomeDeHostValido(texto: string): boolean {
  if (texto.length === 0 || texto.length > 253) {
    return false;
  }
  const rotulos = texto.split(".");
  const ultimo = rotulos[rotulos.length - 1] ?? "";
  if (PADRAO_DIGITOS.test(ultimo)) {
    return false;
  }
  return rotulos.every((rotulo) => PADRAO_ROTULO.test(rotulo));
}

export function validarIp(valor: string): ResultadoCampo {
  const texto = valor.trim();

  if (texto.length === 0) {
    return { ok: false, mensagem: "Informe o IP do servidor." };
  }

  const valido = PADRAO_IPV4.test(texto) ? ehIpv4Valido(texto) : ehNomeDeHostValido(texto);
  if (!valido) {
    return {
      ok: false,
      mensagem: "Informe um IP válido (ex.: 10.20.50.123) ou um nome de host (ex.: localhost).",
    };
  }

  return { ok: true, valor: texto };
}

export function validarPorta(valor: string): ResultadoPorta {
  const texto = valor.trim();

  if (texto.length === 0) {
    return { ok: false, mensagem: "Informe a porta do servidor." };
  }

  if (!PADRAO_DIGITOS.test(texto)) {
    return { ok: false, mensagem: "A porta deve conter apenas números." };
  }

  const numero = Number(texto);
  if (!Number.isInteger(numero) || numero < 1 || numero > 65535) {
    return { ok: false, mensagem: "A porta deve estar entre 1 e 65535." };
  }

  return { ok: true, valor: numero };
}

export function validarFormularioCadastro(campos: {
  nome: string;
  email: string;
  senha: string;
}): ResultadoFormularioCadastro {
  const nome = validarNome(campos.nome);
  const email = validarEmail(campos.email);
  const senha = validarSenha(campos.senha);

  if (nome.ok && email.ok && senha.ok) {
    return { ok: true, dados: { nome: nome.valor, email: email.valor, senha: senha.valor } };
  }

  const erros: ErrosCadastro = {};
  if (!nome.ok) {
    erros.nome = nome.mensagem;
  }
  if (!email.ok) {
    erros.email = email.mensagem;
  }
  if (!senha.ok) {
    erros.senha = senha.mensagem;
  }
  return { ok: false, erros };
}

export function validarFormularioLogin(campos: {
  email: string;
  senha: string;
}): ResultadoFormularioLogin {
  const email = validarEmail(campos.email);
  const senha = validarSenha(campos.senha);

  if (email.ok && senha.ok) {
    return { ok: true, dados: { email: email.valor, senha: senha.valor } };
  }

  const erros: ErrosLogin = {};
  if (!email.ok) {
    erros.email = email.mensagem;
  }
  if (!senha.ok) {
    erros.senha = senha.mensagem;
  }
  return { ok: false, erros };
}

export function validarFormularioConexao(campos: {
  ip: string;
  porta: string;
}): ResultadoFormularioConexao {
  const ip = validarIp(campos.ip);
  const porta = validarPorta(campos.porta);

  if (ip.ok && porta.ok) {
    return { ok: true, dados: { ip: ip.valor, porta: porta.valor } };
  }

  const erros: ErrosConexao = {};
  if (!ip.ok) {
    erros.ip = ip.mensagem;
  }
  if (!porta.ok) {
    erros.porta = porta.mensagem;
  }
  return { ok: false, erros };
}

export function validarFormularioEdicao(
  campos: { nome: string; email: string; senha: string },
  atuais: RespostaUsuario,
): ResultadoFormularioEdicao {
  const dados: CorpoAtualizacaoParcial = {};
  const erros: ErrosCadastro = {};

  if (campos.nome.trim() !== atuais.nome) {
    const nome = validarNome(campos.nome);
    if (nome.ok) {
      dados.nome = nome.valor;
    } else {
      erros.nome = nome.mensagem;
    }
  }

  if (campos.email !== atuais.email) {
    const email = validarEmail(campos.email);
    if (email.ok) {
      dados.email = email.valor;
    } else {
      erros.email = email.mensagem;
    }
  }

  if (campos.senha !== "") {
    const senha = validarSenha(campos.senha);
    if (senha.ok) {
      dados.senha = senha.valor;
    } else {
      erros.senha = senha.mensagem;
    }
  }

  if (Object.keys(erros).length > 0) {
    return { ok: false, erros };
  }

  if (Object.keys(dados).length === 0) {
    return { ok: false, nadaAlterado: true };
  }

  return { ok: true, dados };
}
