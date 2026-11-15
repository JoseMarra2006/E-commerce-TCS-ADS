import { assert, assertEquals } from "@std/assert";
import type { RespostaProduto } from "../../cliente/src/tipos/protocolo.ts";
import { exigirSucesso } from "../auxiliares/ambiente.ts";
import {
  ALVO_REAL,
  comCliente,
  entrarComoAdm,
  ultimoRegistro,
} from "../auxiliares/alvos-cliente.ts";

const TOTAL_PRODUTOS = 500;
const LOTE = 25;
const LIMITE_RESPOSTA_BYTES = 2 * 1024 * 1024;
const TRECHO_DESCRICAO =
  "Descrição com acentuação, ação e coração; ingresso nº ";

function descricaoLonga(indice: number): string {
  const base = Array.from(`${indice} ${TRECHO_DESCRICAO.repeat(12)}`);
  return base.slice(0, 500).join("");
}

Deno.test("intermediário: produto com descrição de 500 caracteres acentuados vai e volta intacto", async () => {
  await comCliente(ALVO_REAL, async ({ operacoes }) => {
    const adm = await entrarComoAdm(operacoes);
    const descricao = descricaoLonga(0);
    assertEquals(Array.from(descricao).length, 500);
    const criado = exigirSucesso(
      await operacoes.criarProduto(adm.token, {
        nome: "Ç".repeat(100),
        descricao,
        quantidade: 1000000,
      }),
    );
    assertEquals(criado.descricao, descricao);
    assertEquals(criado.nome, "Ç".repeat(100));
    assertEquals(
      exigirSucesso(await operacoes.lerProduto(criado.id, adm.token)),
      criado,
    );
  });
});

Deno.test("intermediário: lista com 500 produtos de descrição longa cabe no limite de 2 MB e é validada", async () => {
  await comCliente(ALVO_REAL, async ({ operacoes, registros, porta }) => {
    const adm = await entrarComoAdm(operacoes);
    const criados: RespostaProduto[] = [];
    for (let inicio = 0; inicio < TOTAL_PRODUTOS; inicio += LOTE) {
      const lote = await Promise.all(
        Array.from({ length: LOTE }, (_, deslocamento) => {
          const indice = inicio + deslocamento;
          return operacoes.criarProduto(adm.token, {
            nome: `Produto em massa ${indice}`,
            descricao: descricaoLonga(indice),
            quantidade: indice,
          });
        }),
      );
      criados.push(...lote.map(exigirSucesso));
    }
    criados.sort((a, b) => a.id - b.id);

    const lista = exigirSucesso(await operacoes.listarProdutos(adm.token));
    assertEquals(lista.length, TOTAL_PRODUTOS);
    assertEquals(lista, criados);

    const registro = ultimoRegistro(registros, "GET");
    assertEquals(registro.status, 200);
    assertEquals(registro.erro, null);
    const direta = await fetch(`http://127.0.0.1:${porta}/api/v1/products`, {
      headers: { Authorization: `Bearer ${adm.token}` },
    });
    const bytes = (await direta.arrayBuffer()).byteLength;
    assert(bytes > 250 * 1024, `resposta menor que o esperado: ${bytes} bytes`);
    assert(
      bytes < LIMITE_RESPOSTA_BYTES,
      `resposta acima do limite: ${bytes} bytes`,
    );
    assert(
      registro.duracaoMs < 10000,
      `listagem lenta: ${registro.duracaoMs} ms`,
    );
  });
});
