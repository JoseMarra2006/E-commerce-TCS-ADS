export const TEXTO_SEM_DESCRICAO = "Sem descrição";
export const ROTULO_ESGOTADO = "Esgotado";
const RETICENCIAS = "…";

export function formatarQuantidade(quantidade: number): string {
  if (!Number.isSafeInteger(quantidade) || quantidade < 0) {
    return "";
  }
  return String(quantidade).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function rotuloEstoque(quantidade: number): string {
  return quantidade === 0 ? ROTULO_ESGOTADO : "";
}

export function resumirDescricao(texto: string, limite = 80): string {
  const umaLinha = texto.replace(/\r\n|\r|\n/g, " ").trim();
  if (umaLinha === "") {
    return TEXTO_SEM_DESCRICAO;
  }
  const caracteres = Array.from(umaLinha);
  if (caracteres.length <= limite) {
    return umaLinha;
  }
  return `${caracteres.slice(0, limite).join("").trimEnd()}${RETICENCIAS}`;
}
