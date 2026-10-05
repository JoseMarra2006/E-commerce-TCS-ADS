import { criarAplicacaoIntermediario } from "./aplicacao-intermediario.ts";
import type { ModoIntermediario } from "./aplicacao-intermediario.ts";
import { abrirNavegador } from "./abrir-navegador.ts";

const PORTA_DESENVOLVIMENTO = 4180;
const TEMPO_LIMITE_ENCERRAMENTO_MS = 2000;

function gerarToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function encerrarComMensagem(mensagem: string): never {
  console.log(mensagem);
  Deno.exit(1);
}

async function diretorioInterfaceValido(diretorio: string): Promise<boolean> {
  try {
    const informacao = await Deno.stat(`${diretorio}/index.html`);
    return informacao.isFile;
  } catch {
    return false;
  }
}

const modo: ModoIntermediario = Deno.args.includes("--desenvolvimento")
  ? "desenvolvimento"
  : "producao";
const producao = modo === "producao";

let diretorioInterface: string | undefined;
if (producao) {
  const caminho = decodeURIComponent(new URL("../../dist", import.meta.url).pathname)
    .replace(/^\/([A-Za-z]:)/, "$1");
  if (!(await diretorioInterfaceValido(caminho))) {
    encerrarComMensagem(
      "Interface do cliente não encontrada. Execute o script iniciar-cliente novamente.",
    );
  }
  diretorioInterface = caminho;
}

let portaReal = 0;

const app = criarAplicacaoIntermediario({
  token: gerarToken(),
  obterPorta: () => portaReal,
  modo,
  diretorioInterface,
});

let servidor: Deno.HttpServer<Deno.NetAddr>;
try {
  servidor = Deno.serve(
    {
      hostname: "127.0.0.1",
      port: producao ? 0 : PORTA_DESENVOLVIMENTO,
      onListen: () => {},
    },
    (requisicao, informacao) => app.fetch(requisicao, informacao),
  );
} catch (erro) {
  if (erro instanceof Deno.errors.AddrInUse) {
    encerrarComMensagem(
      `A porta ${PORTA_DESENVOLVIMENTO} já está em uso. Feche o outro intermediário e tente novamente.`,
    );
  }
  throw erro;
}

portaReal = servidor.addr.port;
const endereco = `http://127.0.0.1:${portaReal}`;

console.log(
  producao ? `Cliente: ${endereco}` : `Intermediário em modo de desenvolvimento: ${endereco}`,
);

let encerrando = false;

async function encerrar(): Promise<void> {
  if (encerrando) {
    return;
  }
  encerrando = true;
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<void>((resolver) => {
    temporizador = setTimeout(resolver, TEMPO_LIMITE_ENCERRAMENTO_MS);
  });
  await Promise.race([servidor.shutdown(), limite]);
  clearTimeout(temporizador);
  Deno.exit(0);
}

const sinais: Deno.Signal[] = ["SIGINT"];
if (Deno.build.os === "windows") {
  sinais.push("SIGBREAK");
}
for (const sinal of sinais) {
  try {
    Deno.addSignalListener(sinal, () => {
      void encerrar();
    });
  } catch {
    continue;
  }
}

if (producao) {
  await abrirNavegador(endereco);
}
