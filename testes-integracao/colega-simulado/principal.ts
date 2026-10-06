import {
  iniciarServidorColega,
  type ModoColega,
  MODOS_COLEGA,
} from "./servidor-colega.ts";

function lerArgumento(nome: string): string | null {
  const prefixo = `--${nome}=`;
  const argumento = Deno.args.find((item) => item.startsWith(prefixo));
  return argumento === undefined ? null : argumento.slice(prefixo.length);
}

function lerModo(texto: string | null): ModoColega {
  if (texto === null) {
    return "correto";
  }
  const modo = MODOS_COLEGA.find((item) => item === texto);
  if (modo === undefined) {
    throw new Error(`Modo inválido. Use: ${MODOS_COLEGA.join(", ")}.`);
  }
  return modo;
}

function lerPorta(texto: string | null): number | undefined {
  if (texto === null) {
    return undefined;
  }
  const porta = Number(texto);
  if (!Number.isInteger(porta) || porta < 1 || porta > 65535) {
    throw new Error("Porta inválida. Use um inteiro entre 1 e 65535.");
  }
  return porta;
}

const modo = lerModo(lerArgumento("modo"));
const servidor = await iniciarServidorColega(
  modo,
  lerPorta(lerArgumento("porta")),
  { hostname: "0.0.0.0" },
);

console.log(
  `Colega simulado (${modo}) em http://0.0.0.0:${servidor.porta}/api/v1`,
);

Deno.addSignalListener("SIGINT", async () => {
  await servidor.encerrar();
  Deno.exit(0);
});
