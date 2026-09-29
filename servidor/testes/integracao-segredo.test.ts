import "./auxiliares/vigia-arquivos-reais.ts";
import { assert, assertEquals } from "@std/assert";
import { ControladorServidor } from "../src/controlador-servidor.ts";
import type { Registro } from "../src/estado.ts";
import {
  criarCaminhoBancoTemporario,
  removerBancoTemporario,
} from "./auxiliares/banco-temporario.ts";
import {
  criarCaminhoSegredoTemporario,
  removerSegredoTemporario,
} from "./auxiliares/segredo-temporario.ts";

const MENSAGEM_SUBSTITUIDO =
  "O segredo do JWT estava inválido e foi substituído. As sessões anteriores deixaram de ser válidas.";

function obterPortaLivre(): number {
  const listener = Deno.listen({ port: 0 });
  const porta = (listener.addr as Deno.NetAddr).port;
  listener.close();
  return porta;
}

function mensagensDeSistema(registros: Registro[]): string[] {
  return registros.flatMap((registro) =>
    registro.tipo === "sistema" ? [registro.mensagem] : []
  );
}

function nenhumRegistroContem(registros: Registro[], texto: string): boolean {
  return registros.every((registro) =>
    !JSON.stringify(registro).includes(texto)
  );
}

Deno.test("primeira inicialização gera o segredo entre banco e servidor iniciado", async () => {
  const caminhoBanco = criarCaminhoBancoTemporario();
  const caminhoSegredoJwt = criarCaminhoSegredoTemporario();
  const controlador = new ControladorServidor({
    caminhoBanco,
    caminhoSegredoJwt,
  });
  try {
    const resultado = await controlador.iniciar(obterPortaLivre());
    assertEquals(resultado.ok, true);

    const segredo = Deno.readTextFileSync(caminhoSegredoJwt);
    assert(/^[0-9a-f]{128}$/.test(segredo));

    const mensagens = mensagensDeSistema(controlador.obterRegistros());
    const banco = mensagens.indexOf("Banco de dados preparado.");
    const gerado = mensagens.indexOf("Segredo do JWT gerado.");
    const iniciado = mensagens.findIndex((m) =>
      m.startsWith("Servidor iniciado na porta")
    );
    assert(banco !== -1 && gerado !== -1 && iniciado !== -1);
    assert(banco < gerado && gerado < iniciado);
    assert(nenhumRegistroContem(controlador.obterRegistros(), segredo));
  } finally {
    await controlador.parar();
    removerBancoTemporario(caminhoBanco);
    removerSegredoTemporario(caminhoSegredoJwt);
  }
});

Deno.test("reiniciar carrega o mesmo segredo sem alterar o arquivo", async () => {
  const caminhoBanco = criarCaminhoBancoTemporario();
  const caminhoSegredoJwt = criarCaminhoSegredoTemporario();
  const controlador = new ControladorServidor({
    caminhoBanco,
    caminhoSegredoJwt,
  });
  try {
    await controlador.iniciar(obterPortaLivre());
    const segredo = Deno.readTextFileSync(caminhoSegredoJwt);
    await controlador.parar();

    const resultado = await controlador.iniciar(obterPortaLivre());
    assertEquals(resultado.ok, true);
    assertEquals(Deno.readTextFileSync(caminhoSegredoJwt), segredo);
    assert(
      mensagensDeSistema(controlador.obterRegistros()).includes(
        "Segredo do JWT carregado.",
      ),
    );
    assert(nenhumRegistroContem(controlador.obterRegistros(), segredo));
  } finally {
    await controlador.parar();
    removerBancoTemporario(caminhoBanco);
    removerSegredoTemporario(caminhoSegredoJwt);
  }
});

Deno.test("segredo corrompido é substituído e o servidor inicia", async () => {
  const caminhoBanco = criarCaminhoBancoTemporario();
  const caminhoSegredoJwt = criarCaminhoSegredoTemporario();
  Deno.writeTextFileSync(caminhoSegredoJwt, "corrompido");
  const controlador = new ControladorServidor({
    caminhoBanco,
    caminhoSegredoJwt,
  });
  try {
    const resultado = await controlador.iniciar(obterPortaLivre());
    assertEquals(resultado.ok, true);

    const registro = controlador.obterRegistros().find((r) =>
      r.tipo === "sistema" && r.mensagem === MENSAGEM_SUBSTITUIDO
    );
    assert(registro !== undefined);
    assert(registro.tipo === "sistema" && registro.nivel === "erro");
    const segredo = Deno.readTextFileSync(caminhoSegredoJwt);
    assert(/^[0-9a-f]{128}$/.test(segredo));
    assert(nenhumRegistroContem(controlador.obterRegistros(), segredo));
  } finally {
    await controlador.parar();
    removerBancoTemporario(caminhoBanco);
    removerSegredoTemporario(caminhoSegredoJwt);
  }
});

Deno.test("caminho de segredo inválido impede a criação de threads", async () => {
  const caminhoBanco = criarCaminhoBancoTemporario();
  const arquivoBloqueador = criarCaminhoSegredoTemporario();
  Deno.writeTextFileSync(arquivoBloqueador, "bloqueio");
  const controlador = new ControladorServidor({
    caminhoBanco,
    caminhoSegredoJwt: `${arquivoBloqueador}/segredo.txt`,
  });
  try {
    const resultado = await controlador.iniciar(obterPortaLivre());
    assertEquals(resultado.ok, false);
    assert(
      resultado.mensagem.startsWith(
        "Não foi possível carregar o segredo do JWT:",
      ),
    );
    assertEquals(controlador.obterEstado().status, "erro");
    assertEquals(controlador.obterEstado().threads.length, 0);
  } finally {
    removerBancoTemporario(caminhoBanco);
    removerSegredoTemporario(arquivoBloqueador);
  }
});
