export type ClasseStatus = "sucesso" | "redirecionamento" | "erro_cliente" | "erro_servidor" | "falha";

const NOMES_STATUS: Record<number, string> = {
  200: "OK",
  201: "Created",
  204: "No Content",
  301: "Moved Permanently",
  302: "Found",
  304: "Not Modified",
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  409: "Conflict",
  422: "Unprocessable Entity",
  500: "Internal Server Error",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
};

const INDENTACAO_JSON = 2;

export function classificarStatus(status: number | null): ClasseStatus {
  if (status === null) {
    return "falha";
  }
  if (status >= 200 && status <= 299) {
    return "sucesso";
  }
  if (status >= 300 && status <= 399) {
    return "redirecionamento";
  }
  if (status >= 400 && status <= 499) {
    return "erro_cliente";
  }
  if (status >= 500 && status <= 599) {
    return "erro_servidor";
  }
  return "falha";
}

export function descreverStatus(status: number | null): string {
  if (status === null) {
    return "Sem resposta";
  }
  const nome = NOMES_STATUS[status];
  return nome === undefined ? String(status) : `${status} ${nome}`;
}

function lerUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

export function extrairCaminho(url: string): string {
  const lida = lerUrl(url);
  return lida === null ? url : lida.pathname;
}

export function extrairServidor(url: string): string {
  const lida = lerUrl(url);
  return lida === null ? "" : lida.host;
}

export function formatarCorpo(texto: string | null): string | null {
  if (texto === null || texto === "") {
    return null;
  }
  try {
    const dados: unknown = JSON.parse(texto);
    return JSON.stringify(dados, null, INDENTACAO_JSON) ?? texto;
  } catch {
    return texto;
  }
}

export function formatarHorario(horario: string): string {
  const data = new Date(horario);
  if (Number.isNaN(data.getTime())) {
    return "--:--:--";
  }
  return [data.getHours(), data.getMinutes(), data.getSeconds()]
    .map((parte) => String(parte).padStart(2, "0"))
    .join(":");
}
