export type MetodoEnvio = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface PedidoEnvio {
  ip: string;
  porta: number;
  metodo: MetodoEnvio;
  caminho: string;
  token: string | null;
  corpo: string | null;
}

export type ResultadoValidacaoPedido =
  | { ok: true; pedido: PedidoEnvio }
  | { ok: false; mensagem: string };

const METODOS: readonly MetodoEnvio[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const CAMPOS: readonly string[] = ["ip", "porta", "metodo", "caminho", "token", "corpo"];
const TAMANHO_MAXIMO_CORPO_BYTES = 1024 * 1024;
const TAMANHO_MAXIMO_CAMINHO = 2048;
const TAMANHO_MAXIMO_TOKEN = 8192;
const REGEX_IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const REGEX_ROTULO = /^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
const REGEX_CAMINHO = /^[A-Za-z0-9\-._~%/]+$/;
const REGEX_TOKEN = /^[^\s\p{Cc}]+$/u;

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function ehIpv4(texto: string): boolean {
  const partes = REGEX_IPV4.exec(texto);
  if (partes === null) {
    return false;
  }
  return partes.slice(1).every((parte) => Number(parte) <= 255);
}

function ehNomeDeHost(texto: string): boolean {
  if (texto.length === 0 || texto.length > 253) {
    return false;
  }
  return texto.split(".").every((rotulo) => REGEX_ROTULO.test(rotulo));
}

function ehIpOuHostValido(texto: string): boolean {
  if (REGEX_IPV4.test(texto)) {
    return ehIpv4(texto);
  }
  return ehNomeDeHost(texto);
}

function validarIp(valor: unknown): string | null {
  if (typeof valor !== "string" || !ehIpOuHostValido(valor)) {
    return "O campo ip do pedido deve ser um IPv4 válido ou um nome de host válido.";
  }
  return null;
}

function validarPorta(valor: unknown): string | null {
  if (typeof valor !== "number" || !Number.isInteger(valor) || valor < 1 || valor > 65535) {
    return "O campo porta do pedido deve ser um inteiro entre 1 e 65535.";
  }
  return null;
}

function validarMetodo(valor: unknown): string | null {
  if (typeof valor !== "string" || !METODOS.some((metodo) => metodo === valor)) {
    return "O campo metodo do pedido deve ser GET, POST, PUT, PATCH ou DELETE.";
  }
  return null;
}

function validarCaminho(valor: unknown): string | null {
  if (
    typeof valor !== "string" ||
    !valor.startsWith("/api/v1/") ||
    valor.length > TAMANHO_MAXIMO_CAMINHO ||
    !REGEX_CAMINHO.test(valor) ||
    valor.includes("..")
  ) {
    return "O campo caminho do pedido deve começar com /api/v1/, ter no máximo 2048 caracteres, " +
      "usar apenas letras, dígitos e os símbolos - . _ ~ % / e não conter '..'.";
  }
  return null;
}

function validarToken(valor: unknown): string | null {
  if (valor === null) {
    return null;
  }
  if (typeof valor !== "string" || valor.length < 1 || valor.length > TAMANHO_MAXIMO_TOKEN) {
    return "O campo token do pedido deve ser nulo ou um texto de 1 a 8192 caracteres.";
  }
  if (!REGEX_TOKEN.test(valor)) {
    return "O campo token do pedido não pode conter espaços nem caracteres de controle.";
  }
  return null;
}

function validarCorpo(valor: unknown, metodo: unknown): string | null {
  if (valor === null) {
    return null;
  }
  if (typeof valor !== "string") {
    return "O campo corpo do pedido deve ser nulo ou um texto.";
  }
  if (metodo === "GET" || metodo === "DELETE") {
    return "O campo corpo do pedido deve ser nulo nos métodos GET e DELETE.";
  }
  if (new TextEncoder().encode(valor).length > TAMANHO_MAXIMO_CORPO_BYTES) {
    return "O campo corpo do pedido deve ter no máximo 1 MB.";
  }
  return null;
}

export function validarPedidoEnvio(dados: unknown): ResultadoValidacaoPedido {
  if (!ehObjeto(dados)) {
    return { ok: false, mensagem: "O pedido deve ser um objeto JSON." };
  }

  for (const campo of CAMPOS) {
    if (!(campo in dados)) {
      return { ok: false, mensagem: `O campo ${campo} é obrigatório no pedido.` };
    }
  }

  const extra = Object.keys(dados).find((campo) => !CAMPOS.includes(campo));
  if (extra !== undefined) {
    return { ok: false, mensagem: `O pedido contém um campo não permitido: ${extra}.` };
  }

  const { ip, porta, metodo, caminho, token, corpo } = dados;
  const erro = validarIp(ip) ?? validarPorta(porta) ?? validarMetodo(metodo) ??
    validarCaminho(caminho) ?? validarToken(token) ?? validarCorpo(corpo, metodo);
  if (erro !== null) {
    return { ok: false, mensagem: erro };
  }

  if (
    typeof ip !== "string" || typeof porta !== "number" || typeof metodo !== "string" ||
    typeof caminho !== "string" || (token !== null && typeof token !== "string") ||
    (corpo !== null && typeof corpo !== "string")
  ) {
    return { ok: false, mensagem: "O pedido está em formato inválido." };
  }

  const metodoValido = METODOS.find((m) => m === metodo);
  if (metodoValido === undefined) {
    return { ok: false, mensagem: "O pedido está em formato inválido." };
  }

  return { ok: true, pedido: { ip, porta, metodo: metodoValido, caminho, token, corpo } };
}
