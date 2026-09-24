export const CABECALHOS_CORS_ENTRADAS: [string, string][] = [
  ["Access-Control-Allow-Origin", "*"],
  ["Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS"],
  ["Access-Control-Allow-Headers", "Content-Type, Authorization"],
];

export const CABECALHOS_CORS: Record<string, string> = Object.fromEntries(
  CABECALHOS_CORS_ENTRADAS,
);

export const MENSAGEM_ERRO_INTERNO = "Erro interno no servidor.";

export function criarRespostaErro(status: number, mensagem: string): Response {
  const corpo = JSON.stringify({ mensagem });

  return new Response(corpo, {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CABECALHOS_CORS,
    },
  });
}
