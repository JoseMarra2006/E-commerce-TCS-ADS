export type Tema = "claro" | "escuro";

export function resolverTema(escolhaManual: Tema | null, sistemaEscuro: boolean): Tema {
  if (escolhaManual !== null) {
    return escolhaManual;
  }
  return sistemaEscuro ? "escuro" : "claro";
}

export function alternarTema(atual: Tema): Tema {
  return atual === "claro" ? "escuro" : "claro";
}
