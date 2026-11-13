import "./auxiliares/vigia-arquivos-reais.ts";
import { assert, assertEquals } from "@std/assert";
import {
  ehResultadoDeSucesso,
  EVENTO_SESSOES_ALTERADAS,
  GerenciadorPool,
  type ResultadoProcessamento,
} from "../src/pool/gerenciador-pool.ts";
import { SEGREDO_TESTE } from "./auxiliares/segredo-temporario.ts";

const URL_TRABALHADOR_SIMULADO = new URL(
  "./auxiliares/trabalhador-simulado-sinal-teste.ts",
  import.meta.url,
).href;
const ESPERA_ATRASO_MS = 400;

interface Observacao {
  sinais: number;
  estados: number;
  sistemas: number;
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function processar(
  pool: GerenciadorPool,
  caminho: string,
): Promise<ResultadoProcessamento> {
  return pool.processar({
    metodo: "POST",
    url: `http://127.0.0.1${caminho}`,
    cabecalhos: [],
    corpo: null,
  });
}

function totalEmAndamento(pool: GerenciadorPool): number {
  return pool.obterEstadoThreads().reduce((s, t) => s + t.emAndamento, 0);
}

async function comPool(
  teste: (pool: GerenciadorPool, observacao: Observacao) => Promise<void>,
  opcoes: { ouvirSinais: boolean } = { ouvirSinais: true },
): Promise<void> {
  const pool = new GerenciadorPool({
    urlTrabalhador: URL_TRABALHADOR_SIMULADO,
  });
  const observacao: Observacao = { sinais: 0, estados: 0, sistemas: 0 };
  if (opcoes.ouvirSinais) {
    pool.addEventListener(EVENTO_SESSOES_ALTERADAS, (evento) => {
      assertEquals(evento.constructor, Event);
      observacao.sinais++;
    });
  }
  pool.addEventListener("estado", () => observacao.estados++);
  pool.addEventListener("sistema", () => observacao.sistemas++);
  await pool.iniciar("banco-nao-usado", SEGREDO_TESTE);
  try {
    await teste(pool, observacao);
  } finally {
    await pool.encerrar();
  }
}

Deno.test("o nome do evento exportado é sessoes_alteradas", () => {
  assertEquals(EVENTO_SESSOES_ALTERADAS, "sessoes_alteradas");
});

Deno.test("um sinal da thread emite o evento exatamente uma vez, sem payload", async () => {
  await comPool(async (pool, observacao) => {
    const resultado = await processar(pool, "/sinal");
    assert(ehResultadoDeSucesso(resultado));
    assertEquals(resultado.status, 200);
    assertEquals(observacao.sinais, 1);
    await esperar(50);
    assertEquals(observacao.sinais, 1);
    assertEquals(observacao.sistemas, 0);
    assertEquals(totalEmAndamento(pool), 0);
  });
});

Deno.test("o sinal não conta como resposta: não muda emAndamento, estado nem pendência", async () => {
  await comPool(async (pool, observacao) => {
    const estadosAntes = observacao.estados;
    const capturas: { emAndamento: number; estados: number }[] = [];
    pool.addEventListener(EVENTO_SESSOES_ALTERADAS, () => {
      capturas.push({
        emAndamento: totalEmAndamento(pool),
        estados: observacao.estados,
      });
    });
    const promessa = processar(pool, "/sinal-antes-de-responder");
    const estadosDespacho = observacao.estados;
    assertEquals(estadosDespacho, estadosAntes + 1);
    assertEquals(totalEmAndamento(pool), 1);
    const resultado = await promessa;
    assert(ehResultadoDeSucesso(resultado));
    assertEquals(capturas, [{ emAndamento: 1, estados: estadosDespacho }]);
    assertEquals(observacao.sinais, 1);
    assertEquals(observacao.estados, estadosDespacho + 1);
    assertEquals(totalEmAndamento(pool), 0);
    assertEquals(observacao.sistemas, 0);
    assert(pool.obterEstadoThreads().every((t) => t.pronta));
  });
});

Deno.test("sem ouvinte registrado, o sinal não causa erro", async () => {
  await comPool(async (pool, observacao) => {
    for (let i = 0; i < 5; i++) {
      const resultado = await processar(pool, "/sinal");
      assert(ehResultadoDeSucesso(resultado));
    }
    assertEquals(observacao.sinais, 0);
    assertEquals(observacao.sistemas, 0);
    assertEquals(totalEmAndamento(pool), 0);
  }, { ouvirSinais: false });
});

Deno.test("variações inválidas do sinal são ignoradas", async () => {
  await comPool(async (pool, observacao) => {
    const resultado = await processar(pool, "/sinal-invalido");
    assert(ehResultadoDeSucesso(resultado));
    await esperar(50);
    assertEquals(observacao.sinais, 0);
    assertEquals(observacao.sistemas, 0);
  });
});

Deno.test("requisição comum não emite o evento", async () => {
  await comPool(async (pool, observacao) => {
    const resultado = await processar(pool, "/outra");
    assert(ehResultadoDeSucesso(resultado));
    assertEquals(observacao.sinais, 0);
  });
});

Deno.test("sinal de thread substituída é ignorado", async () => {
  await comPool(async (pool, observacao) => {
    const resultado = await processar(pool, "/sinal-adiado");
    assert(ehResultadoDeSucesso(resultado));
    await pool.substituirThread(resultado.numeroThread);
    await esperar(ESPERA_ATRASO_MS);
    assertEquals(observacao.sinais, 0);
    assert(pool.obterEstadoThreads().every((t) => t.pronta));
  });
});

Deno.test("sinal enviado por thread durante o encerramento é ignorado", async () => {
  const pool = new GerenciadorPool({
    urlTrabalhador: URL_TRABALHADOR_SIMULADO,
  });
  let sinais = 0;
  pool.addEventListener(EVENTO_SESSOES_ALTERADAS, () => sinais++);
  await pool.iniciar("banco-nao-usado", SEGREDO_TESTE);
  const resultado = await processar(pool, "/sinal");
  assert(ehResultadoDeSucesso(resultado));
  assertEquals(sinais, 1);
  await pool.encerrar();
  await esperar(50);
  assertEquals(sinais, 1);
  assertEquals(pool.obterEstadoThreads(), []);
});

Deno.test("sinal adiado que chega depois do encerramento é ignorado", async () => {
  const pool = new GerenciadorPool({
    urlTrabalhador: URL_TRABALHADOR_SIMULADO,
  });
  let sinais = 0;
  pool.addEventListener(EVENTO_SESSOES_ALTERADAS, () => sinais++);
  await pool.iniciar("banco-nao-usado", SEGREDO_TESTE);
  const resultado = await processar(pool, "/sinal-adiado");
  assert(ehResultadoDeSucesso(resultado));
  await pool.encerrar();
  await esperar(ESPERA_ATRASO_MS);
  assertEquals(sinais, 0);
});

Deno.test("50 sinais simultâneos em várias threads geram 50 eventos", async () => {
  await comPool(async (pool, observacao) => {
    const resultados = await Promise.all(
      Array.from({ length: 50 }, () => processar(pool, "/sinal")),
    );
    assert(resultados.every(ehResultadoDeSucesso));
    const threads = new Set(
      resultados.filter(ehResultadoDeSucesso).map((r) => r.numeroThread),
    );
    assert(threads.size >= 2, `threads distintas: ${threads.size}`);
    assertEquals(observacao.sinais, 50);
    assertEquals(totalEmAndamento(pool), 0);
    assertEquals(observacao.sistemas, 0);
  });
});
