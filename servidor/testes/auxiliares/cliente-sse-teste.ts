export interface EventoSse {
  evento: string;
  dados: string;
  campos: string[];
}

export interface ClienteSse {
  eventos: EventoSse[];
  bruto: () => string;
  terminou: () => boolean;
  esperar: (
    condicao: (eventos: EventoSse[]) => boolean,
    descricao: string,
    limiteMs?: number,
  ) => Promise<void>;
  fechar: () => Promise<void>;
}

function interpretarBloco(bloco: string): EventoSse | null {
  const linhas = bloco.split("\n").filter((linha) => linha.length > 0);
  if (linhas.length === 0) {
    return null;
  }

  let evento = "message";
  const dados: string[] = [];
  const campos: string[] = [];
  for (const linha of linhas) {
    const separador = linha.indexOf(":");
    const campo = separador === -1 ? linha : linha.slice(0, separador);
    let valor = separador === -1 ? "" : linha.slice(separador + 1);
    if (valor.startsWith(" ")) {
      valor = valor.slice(1);
    }
    campos.push(campo);
    if (campo === "event") {
      evento = valor;
    } else if (campo === "data") {
      dados.push(valor);
    }
  }

  return { evento, dados: dados.join("\n"), campos };
}

export function lerFluxoSse(resposta: Response): ClienteSse {
  const eventos: EventoSse[] = [];
  let texto = "";
  let pendente = "";
  let fim = false;
  const corpo = resposta.body;
  if (corpo === null) {
    throw new Error("A resposta não tem corpo.");
  }
  const leitor = corpo.pipeThrough(new TextDecoderStream()).getReader();

  const leitura = (async () => {
    try {
      while (true) {
        const { done, value } = await leitor.read();
        if (done) {
          break;
        }
        texto += value;
        pendente += value;
        let indice = pendente.indexOf("\n\n");
        while (indice !== -1) {
          const bloco = pendente.slice(0, indice);
          pendente = pendente.slice(indice + 2);
          const evento = interpretarBloco(bloco);
          if (evento !== null) {
            eventos.push(evento);
          }
          indice = pendente.indexOf("\n\n");
        }
      }
    } catch {
      return;
    } finally {
      fim = true;
    }
  })();

  return {
    eventos,
    bruto: () => texto,
    terminou: () => fim,
    esperar: async (condicao, descricao, limiteMs = 1000) => {
      const inicio = Date.now();
      while (!condicao(eventos)) {
        if (Date.now() - inicio > limiteMs) {
          throw new Error(
            `Evento SSE não recebido em ${limiteMs} ms: ${descricao}.`,
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    },
    fechar: async () => {
      try {
        await leitor.cancel();
      } catch {
        return;
      }
      await leitura;
    },
  };
}
