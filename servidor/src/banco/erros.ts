export type TipoErroBanco =
  | "unico"
  | "chave_estrangeira"
  | "verificacao"
  | "nao_nulo"
  | "ocupado"
  | "desconhecido";

export interface ErroBancoClassificado {
  tipo: TipoErroBanco;
  detalhe: string | null;
}

function obterErrcode(erro: object): number | undefined {
  if ("errcode" in erro) {
    const valor = (erro as { errcode: unknown }).errcode;
    if (typeof valor === "number") {
      return valor;
    }
  }
  return undefined;
}

function extrairDetalhe(mensagem: string): string | null {
  const indice = mensagem.toLowerCase().indexOf("constraint failed:");
  if (indice === -1) {
    return null;
  }
  const detalhe = mensagem.slice(indice + "constraint failed:".length).trim();
  return detalhe.length > 0 ? detalhe : null;
}

function classificarPorErrcode(errcode: number): TipoErroBanco | null {
  if (errcode === 2067 || errcode === 1555) {
    return "unico";
  }
  if (errcode === 787) {
    return "chave_estrangeira";
  }
  if (errcode === 275) {
    return "verificacao";
  }
  if (errcode === 1299) {
    return "nao_nulo";
  }
  const codigoPrimario = errcode & 0xff;
  if (codigoPrimario === 5 || codigoPrimario === 6) {
    return "ocupado";
  }
  return null;
}

function classificarPorMensagem(mensagem: string): TipoErroBanco {
  const mensagemMinuscula = mensagem.toLowerCase();
  if (
    mensagemMinuscula.includes("unique constraint failed") ||
    (mensagemMinuscula.includes("primary key") &&
      mensagemMinuscula.includes("constraint failed"))
  ) {
    return "unico";
  }
  if (mensagemMinuscula.includes("foreign key constraint failed")) {
    return "chave_estrangeira";
  }
  if (mensagemMinuscula.includes("check constraint failed")) {
    return "verificacao";
  }
  if (mensagemMinuscula.includes("not null constraint failed")) {
    return "nao_nulo";
  }
  if (
    mensagemMinuscula.includes("database is locked") ||
    mensagemMinuscula.includes("database table is locked") ||
    mensagemMinuscula.includes("sqlite_busy")
  ) {
    return "ocupado";
  }
  return "desconhecido";
}

export function classificarErroBanco(erro: unknown): ErroBancoClassificado {
  if (!(erro instanceof Error)) {
    return { tipo: "desconhecido", detalhe: null };
  }

  let tipo: TipoErroBanco | null = null;
  const errcode = obterErrcode(erro);
  if (errcode !== undefined) {
    tipo = classificarPorErrcode(errcode);
  }

  if (tipo === null) {
    tipo = classificarPorMensagem(erro.message);
  }

  if (tipo === "unico" || tipo === "verificacao" || tipo === "nao_nulo") {
    return { tipo, detalhe: extrairDetalhe(erro.message) };
  }

  return { tipo, detalhe: null };
}

export function ehErroEmailDuplicado(erro: unknown): boolean {
  const classificado = classificarErroBanco(erro);
  return classificado.tipo === "unico" &&
    classificado.detalhe === "usuarios.email";
}
