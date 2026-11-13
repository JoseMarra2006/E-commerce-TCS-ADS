/// <reference lib="deno.worker" />
import { abrirConexao, fecharConexao } from "../../src/banco/conexao.ts";
import { executarTransacao } from "../../src/banco/transacao.ts";

interface MensagemEntrada {
  caminhoBanco: string;
  prefixo: string;
  quantidade: number;
}

type MensagemSaida = { ok: true } | { ok: false; mensagem: string };

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
    for (let indice = 0; indice < mensagem.quantidade; indice++) {
      const conexaoAtual = conexao;
      const agora = new Date().toISOString();
      executarTransacao(conexaoAtual, () => {
        const linha = conexaoAtual
          .prepare(
            "INSERT INTO usuarios (nome, email, senha_hash, senha_salt, papel, criado_em, atualizado_em) VALUES (?, ?, 'h', 's', 'comum', ?, ?) RETURNING id;",
          )
          .get(
            `${mensagem.prefixo}-${indice}`,
            `${mensagem.prefixo}-${indice}@teste.com`,
            agora,
            agora,
          );
        conexaoAtual
          .prepare(
            "INSERT INTO sessoes (id, usuario_id, criado_em) VALUES (?, ?, ?);",
          )
          .run(crypto.randomUUID(), Number(linha?.id), agora);
        return 1;
      });
    }
    resposta = { ok: true };
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
