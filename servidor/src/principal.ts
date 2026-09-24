import { ControladorServidor } from "./controlador-servidor.ts";
import { criarAplicacaoPainel } from "./painel/aplicacao-painel.ts";
import { abrirNavegador } from "./utilitarios/abrir-navegador.ts";

function gerarTokenPainel(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

const token = gerarTokenPainel();
const controlador = new ControladorServidor();

let portaPainel = 0;
let processoEncerrado = false;

async function encerrarProcesso(): Promise<void> {
  if (processoEncerrado) {
    return;
  }
  processoEncerrado = true;

  if (controlador.obterEstado().status === "em_execucao") {
    await controlador.parar();
  }

  await servidorPainel.shutdown();
  Deno.exit(0);
}

const aplicacaoPainel = await criarAplicacaoPainel({
  controlador,
  token,
  obterPortaPainel: () => portaPainel,
  encerrarProcesso: () => {
    void encerrarProcesso();
  },
});

const servidorPainel = Deno.serve(
  { hostname: "127.0.0.1", port: 0, onListen: () => {} },
  (request, info) => aplicacaoPainel.fetch(request, info),
);

portaPainel = servidorPainel.addr.transport === "tcp"
  ? servidorPainel.addr.port
  : 0;

const enderecoPainel = `http://127.0.0.1:${portaPainel}`;
console.log(`Painel do servidor: ${enderecoPainel}`);

await abrirNavegador(enderecoPainel);

const sinaisMonitorados: Deno.Signal[] = ["SIGINT"];
if (Deno.build.os === "windows") {
  sinaisMonitorados.push("SIGBREAK");
}

for (const sinal of sinaisMonitorados) {
  try {
    Deno.addSignalListener(sinal, () => {
      void encerrarProcesso();
    });
  } catch {
    continue;
  }
}
