export function criarRespostaJson(
  status: number,
  corpo: unknown,
  cabecalhosExtras: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...cabecalhosExtras,
    },
  });
}

export function criarRespostaSemConteudo(): Response {
  return new Response(null, { status: 204 });
}
