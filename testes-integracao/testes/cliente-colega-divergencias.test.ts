import { assert, assertEquals } from "@std/assert";
import { ehAdministrador } from "../../cliente/src/contextos/eh-administrador.ts";
import { interpretarFalhaCadastro } from "../../cliente/src/paginas/cadastro-produto.ts";
import { enviarExclusaoProduto } from "../../cliente/src/paginas/exclusao-produto.ts";
import {
  LOCATION_DIFERENTE_COLEGA,
  MENSAGENS_COLEGA_DIFERENTES,
} from "../colega-simulado/servidor-colega.ts";
import { exigirSucesso } from "../auxiliares/ambiente.ts";
import {
  alvoColega,
  cadastrarEEntrar,
  cadastrarUsuario,
  comCliente,
  EMAIL_ADM,
  entrarComoAdm,
  exigirFalhaHttp,
  ID_INEXISTENTE,
  SENHA_ADM,
} from "../auxiliares/alvos-cliente.ts";

const PRODUTO = { nome: "Ingresso Lote", descricao: "Lote 1", quantidade: 5 };

async function cabecalhoLocation(
  porta: number,
  caminho: string,
  corpo: unknown,
  token?: string,
): Promise<{ status: number; location: string | null }> {
  const cabecalhos = new Headers({ "Content-Type": "application/json" });
  if (token !== undefined) {
    cabecalhos.set("Authorization", `Bearer ${token}`);
  }
  const resposta = await fetch(`http://127.0.0.1:${porta}/api/v1${caminho}`, {
    method: "POST",
    headers: cabecalhos,
    body: JSON.stringify(corpo),
  });
  await resposta.body?.cancel();
  return {
    status: resposta.status,
    location: resposta.headers.get("Location"),
  };
}

for (
  const [modo, esperado] of [
    ["sem_location", null],
    ["location_diferente", LOCATION_DIFERENTE_COLEGA],
  ] as const
) {
  Deno.test(`colega ${modo}: o cliente usa o id do corpo e ignora o Location`, async () => {
    await comCliente(alvoColega(modo), async ({ operacoes, porta }) => {
      const usuario = await cadastrarUsuario(operacoes, "loc.u");
      const adm = await entrarComoAdm(operacoes);
      const produto = exigirSucesso(
        await operacoes.criarProduto(adm.token, PRODUTO),
      );
      assertEquals(produto, { id: produto.id, ...PRODUTO });
      assertEquals(
        exigirSucesso(await operacoes.lerProduto(produto.id, adm.token)),
        produto,
      );
      assertEquals(
        exigirSucesso(await operacoes.lerCadastro(usuario.id, adm.token)).email,
        usuario.email,
      );

      const diretoUsuario = await cabecalhoLocation(porta, "/users", {
        nome: "Direto Location",
        email: `d${crypto.randomUUID().slice(0, 8)}@teste.com`,
        senha: "SenhaDireta1",
      });
      assertEquals(diretoUsuario, { status: 201, location: esperado });
      const diretoSessao = await cabecalhoLocation(porta, "/sessions", {
        email: EMAIL_ADM,
        senha: SENHA_ADM,
      });
      assertEquals(diretoSessao, { status: 201, location: esperado });
      const diretoProduto = await cabecalhoLocation(
        porta,
        "/products",
        PRODUTO,
        adm.token,
      );
      assertEquals(diretoProduto, { status: 201, location: esperado });
    });
  });
}

Deno.test("colega sem_admin: o ADM do colega antigo não é tratado como ADM e o usuário comum funciona", async () => {
  await comCliente(alvoColega("sem_admin"), async ({ operacoes }) => {
    const adm = await entrarComoAdm(operacoes);
    assertEquals(adm.usuario.admin, false);
    assertEquals(ehAdministrador(adm.usuario), false);

    const comum = await cadastrarEEntrar(operacoes, "semadm");
    assertEquals(comum.usuario.admin, false);
    assertEquals(
      exigirSucesso(await operacoes.lerCadastro(comum.usuario.id, comum.token)),
      comum.usuario,
    );
    const atualizado = exigirSucesso(
      await operacoes.atualizarCadastro(comum.usuario.id, comum.token, {
        nome: "Comum Antigo",
      }),
    );
    assertEquals(atualizado.admin, false);
    assertEquals(
      exigirSucesso(await operacoes.listarProdutos(comum.token)),
      [],
    );

    const lista = exigirSucesso(await operacoes.listarUsuarios(adm.token));
    assertEquals(lista.every((usuario) => usuario.admin === false), true);
    exigirSucesso(await operacoes.sair(comum.sessao.id, comum.token));
  });
});

Deno.test("colega mensagens_diferentes: o cliente mostra a mensagem do servidor e mantém o status", async () => {
  await comCliente(
    alvoColega("mensagens_diferentes"),
    async ({ operacoes }) => {
      const adm = await entrarComoAdm(operacoes);
      const comum = await cadastrarEEntrar(operacoes, "msg.c");
      assertEquals(
        exigirFalhaHttp(
          await operacoes.cadastrar({
            nome: "Repetido",
            email: comum.email,
            senha: "SenhaRep1",
          }),
          409,
        ),
        MENSAGENS_COLEGA_DIFERENTES[409],
      );
      assertEquals(
        exigirFalhaHttp(
          await operacoes.entrar({ email: comum.email, senha: "Errada123" }),
          401,
        ),
        MENSAGENS_COLEGA_DIFERENTES[401],
      );
      assertEquals(
        exigirFalhaHttp(await operacoes.listarUsuarios(comum.token), 403),
        MENSAGENS_COLEGA_DIFERENTES[403],
      );
      assertEquals(
        exigirFalhaHttp(
          await operacoes.lerProduto(ID_INEXISTENTE, adm.token),
          404,
        ),
        MENSAGENS_COLEGA_DIFERENTES[404],
      );
      const recusado = await operacoes.criarProduto(adm.token, {
        ...PRODUTO,
        quantidade: -1,
      });
      assertEquals(
        exigirFalhaHttp(recusado, 400),
        MENSAGENS_COLEGA_DIFERENTES[400],
      );
      const proibido = await operacoes.criarProduto(comum.token, PRODUTO);
      exigirFalhaHttp(proibido, 403);
      if (!proibido.ok) {
        assertEquals(interpretarFalhaCadastro(proibido), {
          mensagem: MENSAGENS_COLEGA_DIFERENTES[403],
          apoio: null,
        });
      }
      const produto = exigirSucesso(
        await operacoes.criarProduto(adm.token, PRODUTO),
      );
      assertEquals(
        await enviarExclusaoProduto({
          excluirProduto: operacoes.excluirProduto,
          token: comum.token,
          id: produto.id,
          trava: { current: false },
        }),
        { tipo: "proibido", mensagem: MENSAGENS_COLEGA_DIFERENTES[403] },
      );
    },
  );
});

Deno.test("colega lento: atraso curto não estoura o tempo limite e o fluxo do ADM conclui", async () => {
  const atrasoMs = 250;
  await comCliente(
    alvoColega("lento", { atrasoMs }),
    async ({ operacoes, registros }) => {
      const adm = await entrarComoAdm(operacoes);
      const produto = exigirSucesso(
        await operacoes.criarProduto(adm.token, PRODUTO),
      );
      assertEquals(exigirSucesso(await operacoes.listarProdutos(adm.token)), [
        produto,
      ]);
      exigirSucesso(await operacoes.excluirProduto(produto.id, adm.token));
      exigirFalhaHttp(await operacoes.lerProduto(produto.id, adm.token), 404);
      assertEquals(registros.length, 5);
      for (const registro of registros) {
        assert(
          registro.duracaoMs >= atrasoMs - 20,
          `duração ${registro.duracaoMs} ms`,
        );
        assertEquals(registro.erro, null);
      }
    },
  );
});

Deno.test("colega divergente: campos extras, id em texto, 200 na criação e confirmação com corpo são tolerados", async () => {
  await comCliente(
    alvoColega("divergente"),
    async ({ operacoes, registros }) => {
      const adm = await entrarComoAdm(operacoes);
      assertEquals(adm.usuario.admin, false);
      const produto = exigirSucesso(
        await operacoes.criarProduto(adm.token, PRODUTO),
      );
      assertEquals(Object.keys(produto).sort(), [
        "descricao",
        "id",
        "nome",
        "quantidade",
      ]);
      assertEquals(typeof produto.id, "number");
      assertEquals(produto, { id: produto.id, ...PRODUTO });
      assertEquals(registros.at(-1)?.status, 200);

      const lista = exigirSucesso(await operacoes.listarProdutos(adm.token));
      assertEquals(lista, [produto]);
      const atualizado = exigirSucesso(
        await operacoes.atualizarProduto(produto.id, adm.token, {
          ...PRODUTO,
          quantidade: 9,
        }),
      );
      assertEquals(atualizado, { ...produto, quantidade: 9 });
      const usuarios = exigirSucesso(await operacoes.listarUsuarios(adm.token));
      for (const usuario of usuarios) {
        assertEquals(Object.keys(usuario).sort(), [
          "admin",
          "email",
          "id",
          "nome",
        ]);
      }
      assertEquals(
        exigirSucesso(await operacoes.excluirProduto(produto.id, adm.token)),
        true,
      );
      assertEquals(registros.at(-1)?.status, 200);
      exigirFalhaHttp(await operacoes.lerProduto(produto.id, adm.token), 404);
    },
  );
});
