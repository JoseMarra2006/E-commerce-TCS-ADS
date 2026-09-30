import "./auxiliares/vigia-arquivos-reais.ts";
import { assert, assertEquals } from "@std/assert";
import {
  verificarRespostaSessao,
  verificarRespostaUsuario,
  verificarRespostaVazia,
} from "./auxiliares/conformidade.ts";
import {
  iniciarServidorDeTeste,
  requisitar,
} from "./auxiliares/servidor-teste.ts";

const API = "/api/v1";

Deno.test("os registros não expõem senhas nem o token completo", async () => {
  const servidor = await iniciarServidorDeTeste();
  try {
    const senhaInicial = "SenhaInicial123";
    const senhaNova = "SenhaNovaXyz789";

    const cadastro = await requisitar(servidor, "POST", `${API}/users`, {
      corpo: {
        nome: "Ana Souza",
        email: "ana@exemplo.com",
        senha: senhaInicial,
      },
    });
    const usuario = await verificarRespostaUsuario(cadastro, 201);

    const login = await requisitar(servidor, "POST", `${API}/sessions`, {
      corpo: { email: "ana@exemplo.com", senha: senhaInicial },
    });
    const sessao = await verificarRespostaSessao(login);
    const { token, id: sessaoId } = sessao.corpo;

    await verificarRespostaUsuario(
      await requisitar(servidor, "PATCH", `${API}/users/${usuario.corpo.id}`, {
        token,
        corpo: { senha: senhaNova },
      }),
      200,
    );

    await verificarRespostaVazia(
      await requisitar(servidor, "DELETE", `${API}/sessions/${sessaoId}`, {
        token,
      }),
    );

    const registros = servidor.registros;
    const requisicoes = registros.filter(
      (registro) => registro.tipo === "requisicao",
    );
    assertEquals(requisicoes.length, 4);

    const textoDosRegistros = registros
      .map((registro) => JSON.stringify(registro))
      .join("\n");
    assertEquals(textoDosRegistros.includes(senhaInicial), false);
    assertEquals(textoDosRegistros.includes(senhaNova), false);
    assertEquals(textoDosRegistros.includes(token), false);
    assert(textoDosRegistros.includes(`${token.slice(0, 8)}...`));
    assert(textoDosRegistros.includes("***"));

    for (const registro of requisicoes) {
      assert(registro.metodo.length > 0);
      assert(registro.caminho.startsWith(API));
      assert(Number.isInteger(registro.status) && registro.status >= 200);
      assert(
        registro.thread !== null && Number.isInteger(registro.thread) &&
          registro.thread > 0,
      );
      assert(Number.isFinite(registro.duracaoMs) && registro.duracaoMs > 0);
    }
  } finally {
    await servidor.encerrar();
  }
});
