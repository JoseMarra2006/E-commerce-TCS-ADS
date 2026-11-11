import "./auxiliares/vigia-arquivos-reais.ts";
import { assertEquals } from "@std/assert";
import type { Registro } from "../src/estado.ts";
import {
  GerenciadorPool,
  type RequisicaoParaProcessar,
  type ResultadoProcessamento,
  type TipoFalhaProcessamento,
} from "../src/pool/gerenciador-pool.ts";
import { iniciarRecepcao } from "../src/recepcao.ts";
import { MENSAGEM_ERRO_INTERNO } from "../src/utilitarios/respostas-erro.ts";
import { verificarRespostaErro } from "./auxiliares/conformidade.ts";

class PoolQueFalha extends GerenciadorPool {
  constructor(private readonly tipoFalha: TipoFalhaProcessamento) {
    super();
  }

  override processar(
    _requisicao: RequisicaoParaProcessar,
  ): Promise<ResultadoProcessamento> {
    return Promise.resolve({ falha: this.tipoFalha, numeroThread: 1 });
  }
}

function obterPortaLivre(): number {
  const listener = Deno.listen({ port: 0 });
  const porta = (listener.addr as Deno.NetAddr).port;
  listener.close();
  return porta;
}

for (
  const tipoFalha of [
    "tempo_esgotado",
    "thread_falhou",
    "encerrando",
  ] as const
) {
  Deno.test(`falha "${tipoFalha}" do pool vira 500 com ErroResponse e CORS`, async () => {
    const registros: Registro[] = [];
    const porta = obterPortaLivre();
    const recepcao = iniciarRecepcao({
      porta,
      gerenciadorPool: new PoolQueFalha(tipoFalha),
      registrar: (registro) => registros.push(registro),
    });
    try {
      for (
        const [metodo, caminho] of [
          ["GET", "/api/v1/users"],
          ["POST", "/api/v1/sessions"],
          ["DELETE", "/api/v1/sessions/qualquer"],
        ]
      ) {
        const resposta = await fetch(`http://127.0.0.1:${porta}${caminho}`, {
          method: metodo,
          body: metodo === "POST"
            ? JSON.stringify({ senha: "senha123" })
            : undefined,
        });
        await verificarRespostaErro(resposta, 500, MENSAGEM_ERRO_INTERNO);
      }
      assertEquals(registros.length, 3);
      for (const registro of registros) {
        assertEquals(registro.tipo, "requisicao");
        if (registro.tipo === "requisicao") {
          assertEquals(registro.status, 500);
          assertEquals(
            JSON.stringify(registro).includes("senha123"),
            false,
          );
        }
      }
    } finally {
      await recepcao.encerrar();
    }
  });
}
