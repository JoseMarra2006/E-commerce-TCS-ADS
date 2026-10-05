export function formatarNumeroCadastro(id: number): string {
  return `Nº ${String(id).padStart(6, "0")}`;
}

function doisDigitos(valor: number): string {
  return String(valor).padStart(2, "0");
}

export function formatarHorario(data: Date): string {
  return `${doisDigitos(data.getHours())}:${doisDigitos(data.getMinutes())}:${
    doisDigitos(data.getSeconds())
  }`;
}

export function obterPrimeiroNome(nome: string): string {
  const palavras = nome.trim().split(/\s+/);
  const primeira = palavras[0];
  return primeira === undefined || primeira === "" ? nome : primeira;
}
