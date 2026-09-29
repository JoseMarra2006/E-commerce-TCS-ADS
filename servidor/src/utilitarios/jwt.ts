import { sign, verify } from "@hono/hono/jwt";

const ALGORITMO = "HS256";
const PADRAO_SUB = /^[0-9]+$/;
const PADRAO_BASE64_URL = /^[A-Za-z0-9_-]+$/;
const TAMANHO_MAXIMO_SID = 100;

export interface DadosToken {
  usuarioId: number;
  sessaoId: string;
}

export type ResultadoVerificacaoToken =
  | { ok: true; usuarioId: number; sessaoId: string }
  | { ok: false };

export function gerarTokenJwt(
  dados: DadosToken,
  segredo: string,
): Promise<string> {
  return sign(
    {
      sub: String(dados.usuarioId),
      sid: dados.sessaoId,
      iat: Math.floor(Date.now() / 1000),
    },
    segredo,
    ALGORITMO,
  );
}

function decodificarBase64Url(texto: string): string | null {
  if (!PADRAO_BASE64_URL.test(texto)) {
    return null;
  }
  try {
    const base64 = texto.replace(/-/g, "+").replace(/_/g, "/");
    const preenchido = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const binario = atob(preenchido);
    const bytes = Uint8Array.from(binario, (letra) => letra.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function cabecalhoEhHs256(cabecalhoBase64Url: string): boolean {
  const texto = decodificarBase64Url(cabecalhoBase64Url);
  if (texto === null) {
    return false;
  }
  try {
    const cabecalho: unknown = JSON.parse(texto);
    return (
      typeof cabecalho === "object" &&
      cabecalho !== null &&
      (cabecalho as Record<string, unknown>).alg === ALGORITMO
    );
  } catch {
    return false;
  }
}

function extrairDados(payload: Record<string, unknown>): DadosToken | null {
  const { sub, sid } = payload;
  if (typeof sub !== "string" || !PADRAO_SUB.test(sub)) {
    return null;
  }
  const usuarioId = Number(sub);
  if (!Number.isSafeInteger(usuarioId) || usuarioId <= 0) {
    return null;
  }
  if (
    typeof sid !== "string" ||
    sid.length === 0 ||
    sid.length > TAMANHO_MAXIMO_SID
  ) {
    return null;
  }
  return { usuarioId, sessaoId: sid };
}

export async function verificarTokenJwt(
  token: string,
  segredo: string,
): Promise<ResultadoVerificacaoToken> {
  try {
    const partes = token.split(".");
    if (partes.length !== 3 || !cabecalhoEhHs256(partes[0])) {
      return { ok: false };
    }
    const payload = await verify(token, segredo, ALGORITMO);
    const dados = extrairDados(payload);
    if (dados === null) {
      return { ok: false };
    }
    return { ok: true, ...dados };
  } catch {
    return { ok: false };
  }
}
