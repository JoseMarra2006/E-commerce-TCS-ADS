import { assertEquals } from "@std/assert";
import { ControladorServidor } from "../src/controlador-servidor.ts";
import {
  criarCaminhoBancoTemporario,
  removerBancoTemporario,
} from "./auxiliares/banco-temporario.ts";

function obterPortaLivre(): number {
  const listener = Deno.listen({ port: 0 });
  const porta = (listener.addr as Deno.NetAddr).port;
  listener.close();
  return porta;
}

Deno.test("processa 50 requisições simultâneas usando o pool de threads", async () => {
  const caminhoBanco = criarCaminhoBancoTemporario();
  const controlador = new ControladorServidor({ caminhoBanco });
  const porta = obterPortaLivre();

  try {
    const resultadoInicio = await controlador.iniciar(porta);
    assertEquals(resultadoInicio.ok, true);

    const respostas = await Promise.all(
      Array.from(
        { length: 50 },
        () => fetch(`http://127.0.0.1:${porta}/api/v1/inexistente`),
      ),
    );

    for (const resposta of respostas) {
      assertEquals(resposta.status, 404);
      assertEquals(resposta.headers.get("Access-Control-Allow-Origin"), "*");
      const corpo = await resposta.json();
      assertEquals(corpo, { mensagem: "Rota não encontrada." });
    }

    const registros = controlador.obterRegistros();
    const threadsUtilizadas = new Set(
      registros
        .filter((registro) => registro.tipo === "requisicao")
        .map((registro) => registro.thread),
    );
    assertEquals(threadsUtilizadas.size > 1, true);
  } finally {
    await controlador.parar();
    removerBancoTemporario(caminhoBanco);
  }
});

Deno.test("substituirThread mantém o servidor respondendo com a mesma quantidade de threads", async () => {
  const caminhoBanco = criarCaminhoBancoTemporario();
  const controlador = new ControladorServidor({ caminhoBanco });
  const porta = obterPortaLivre();

  try {
    await controlador.iniciar(porta);
    const quantidadeAntes = controlador.obterEstado().threads.length;

    await controlador.substituirThread(1);

    const resposta = await fetch(
      `http://127.0.0.1:${porta}/api/v1/inexistente`,
    );
    assertEquals(resposta.status, 404);
    await resposta.json();

    const quantidadeDepois = controlador.obterEstado().threads.length;
    assertEquals(quantidadeDepois, quantidadeAntes);
  } finally {
    await controlador.parar();
    removerBancoTemporario(caminhoBanco);
  }
});

Deno.test("iniciar novamente na mesma porta enquanto em execução falha", async () => {
  const caminhoBanco = criarCaminhoBancoTemporario();
  const controlador = new ControladorServidor({ caminhoBanco });
  const porta = obterPortaLivre();

  try {
    await controlador.iniciar(porta);
    const segundaTentativa = await controlador.iniciar(porta);
    assertEquals(segundaTentativa.ok, false);
  } finally {
    await controlador.parar();
    removerBancoTemporario(caminhoBanco);
  }
});

Deno.test("iniciar em porta ocupada falha com mensagem apropriada", async () => {
  const caminhoBanco = criarCaminhoBancoTemporario();
  const porta = obterPortaLivre();
  const listenerOcupando = Deno.listen({ port: porta });
  const controlador = new ControladorServidor({ caminhoBanco });

  try {
    const resultado = await controlador.iniciar(porta);
    assertEquals(resultado.ok, false);
    assertEquals(
      resultado.mensagem,
      `A porta ${porta} já está em uso por outro programa. Escolha outra porta.`,
    );
    assertEquals(controlador.obterEstado().status, "erro");
    assertEquals(controlador.obterEstado().threads.length, 0);
  } finally {
    listenerOcupando.close();
    removerBancoTemporario(caminhoBanco);
  }
});

Deno.test("parar interrompe o servidor e novas conexões são recusadas", async () => {
  const caminhoBanco = criarCaminhoBancoTemporario();
  const controlador = new ControladorServidor({ caminhoBanco });
  const porta = obterPortaLivre();

  try {
    await controlador.iniciar(porta);
    const resultadoParar = await controlador.parar();
    assertEquals(resultadoParar.ok, true);
    assertEquals(controlador.obterEstado().status, "parada");

    let conexaoRecusada = false;
    try {
      await fetch(`http://127.0.0.1:${porta}/api/v1/inexistente`);
    } catch {
      conexaoRecusada = true;
    }
    assertEquals(conexaoRecusada, true);
  } finally {
    removerBancoTemporario(caminhoBanco);
  }
});
