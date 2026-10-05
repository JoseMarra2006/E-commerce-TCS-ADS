const TIPOS_CONTEUDO: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

const CACHE_ASSETS = "public, max-age=31536000, immutable";

function respostaTexto(status: number, texto: string): Response {
  return new Response(texto, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

function extensaoDe(nome: string): string {
  const posicao = nome.lastIndexOf(".");
  return posicao === -1 ? "" : nome.slice(posicao).toLowerCase();
}

function decodificarCaminho(caminho: string): string | null {
  try {
    return decodeURIComponent(caminho);
  } catch {
    return null;
  }
}

function resolverSegmentos(caminhoDecodificado: string): string[] | null {
  if (caminhoDecodificado.includes("\\") || caminhoDecodificado.includes("\0")) {
    return null;
  }
  const segmentos = caminhoDecodificado.split("/").filter((segmento) => segmento !== "");
  if (segmentos.some((segmento) => segmento === ".." || segmento === ".")) {
    return null;
  }
  return segmentos;
}

async function lerArquivo(
  diretorio: string,
  segmentos: string[],
): Promise<Uint8Array<ArrayBuffer> | null> {
  const base = diretorio.replace(/[\/]+$/, "");
  try {
    const caminho = `${base}/${segmentos.join("/")}`;
    const informacao = await Deno.stat(caminho);
    if (!informacao.isFile) {
      return null;
    }
    return await Deno.readFile(caminho);
  } catch {
    return null;
  }
}

function montarResposta(conteudo: Uint8Array<ArrayBuffer>, segmentos: string[]): Response {
  const nome = segmentos[segmentos.length - 1] ?? "index.html";
  const cabecalhos = new Headers({
    "Content-Type": TIPOS_CONTEUDO[extensaoDe(nome)] ?? "application/octet-stream",
  });
  if (nome === "index.html" && segmentos.length === 1) {
    cabecalhos.set("Cache-Control", "no-store");
  } else if (segmentos[0] === "assets") {
    cabecalhos.set("Cache-Control", CACHE_ASSETS);
  }
  return new Response(conteudo, { status: 200, headers: cabecalhos });
}

export async function servirArquivoEstatico(
  diretorio: string,
  caminhoRequisitado: string,
): Promise<Response> {
  const decodificado = decodificarCaminho(caminhoRequisitado);
  if (decodificado === null) {
    return respostaTexto(400, "Caminho inválido.");
  }
  const segmentos = resolverSegmentos(decodificado);
  if (segmentos === null) {
    return respostaTexto(404, "Recurso não encontrado.");
  }

  const alvo = segmentos.length === 0 ? ["index.html"] : segmentos;
  const conteudo = await lerArquivo(diretorio, alvo);
  if (conteudo !== null) {
    return montarResposta(conteudo, alvo);
  }

  const ultimo = alvo[alvo.length - 1] ?? "";
  if (extensaoDe(ultimo) !== "") {
    return respostaTexto(404, "Recurso não encontrado.");
  }
  const indice = await lerArquivo(diretorio, ["index.html"]);
  if (indice === null) {
    return respostaTexto(404, "Recurso não encontrado.");
  }
  return montarResposta(indice, ["index.html"]);
}
