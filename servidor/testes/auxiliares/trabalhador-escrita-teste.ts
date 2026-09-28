/// <reference lib="deno.worker" />
import { abrirConexao, fecharConexao } from "../../src/banco/conexao.ts";
import { executarTransacao } from "../../src/banco/transacao.ts";
import { criarUsuario } from "../../src/modulos/usuarios/repositorio-usuarios.ts";

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
      executarTransacao(conexaoAtual, () => {
        criarUsuario(conexaoAtual, {
          nome: `${mensagem.prefixo}-${indice}`,
          email: `${mensagem.prefixo}-${indice}@teste.com`,
          senhaHash: "hash-teste",
          senhaSalt: "salt-teste",
        });
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
