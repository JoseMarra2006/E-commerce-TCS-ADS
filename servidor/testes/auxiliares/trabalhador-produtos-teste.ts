/// <reference lib="deno.worker" />
import { abrirConexao, fecharConexao } from "../../src/banco/conexao.ts";
import { criarProduto } from "../../src/modulos/produtos/repositorio-produtos.ts";

interface MensagemEntrada {
  caminhoBanco: string;
  prefixo: string;
  quantidade: number;
}

type MensagemSaida =
  | { ok: true; ids: number[] }
  | { ok: false; mensagem: string };

function ehMensagemEntrada(dado: unknown): dado is MensagemEntrada {
  if (typeof dado !== "object" || dado === null) {
    return false;
  }
  const objeto = dado as Record<string, unknown>;
  return (
    typeof objeto.caminhoBanco === "string" &&
    typeof objeto.prefixo === "string" &&
    typeof objeto.quantidade === "number"
  );
}

self.onmessage = (evento: MessageEvent<unknown>) => {
  const mensagem = evento.data;

  if (!ehMensagemEntrada(mensagem)) {
    return;
  }

  let conexao: ReturnType<typeof abrirConexao> | null = null;
  let resposta: MensagemSaida;

  try {
    conexao = abrirConexao(mensagem.caminhoBanco);
    const ids: number[] = [];

    for (let indice = 0; indice < mensagem.quantidade; indice++) {
      const produto = criarProduto(conexao, {
        nome: `${mensagem.prefixo}-${indice}`,
        descricao: `Produto ${mensagem.prefixo} ${indice}`,
        quantidade: indice,
      });
      ids.push(produto.id);
    }

    resposta = { ok: true, ids };
  } catch (erro) {
    resposta = {
      ok: false,
      mensagem: erro instanceof Error ? erro.message : String(erro),
    };
  }

  if (conexao !== null) {
    fecharConexao(conexao);
  }

  self.postMessage(resposta);
  self.close();
};
