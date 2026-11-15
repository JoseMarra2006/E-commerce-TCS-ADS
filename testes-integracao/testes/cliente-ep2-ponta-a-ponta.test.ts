import { assert, assertEquals, assertNotEquals } from "@std/assert";
import { ehAdministrador } from "../../cliente/src/contextos/eh-administrador.ts";
import {
  interpretarFalhaCadastro,
  MENSAGEM_DADOS_RECUSADOS,
} from "../../cliente/src/paginas/cadastro-produto.ts";
import { interpretarFalhaEdicao } from "../../cliente/src/paginas/edicao-produto.ts";
import { enviarExclusaoProduto } from "../../cliente/src/paginas/exclusao-produto.ts";
import { decidirDestinoExclusao } from "../../cliente/src/paginas/exclusao-usuario.ts";
import type { RespostaProduto } from "../../cliente/src/tipos/protocolo.ts";
import { exigirFalha, exigirSucesso } from "../auxiliares/ambiente.ts";
import {
  ALVOS_HONESTOS,
  cadastrarEEntrar,
  cadastrarUsuario,
  comCliente,
  EMAIL_ADM,
  emailUnico,
  entrarComoAdm,
  exigirFalhaHttp,
  ID_INEXISTENTE,
  SENHA_CLIENTE,
  ultimoRegistro,
} from "../auxiliares/alvos-cliente.ts";

const PRODUTO_BASE = {
  nome: "Ingresso Pista",
  descricao: "Setor norte",
  quantidade: 50,
};

function chavesUsuario(valor: object): string[] {
  return Object.keys(valor).sort();
}

function corpoEnviado(texto: string | null): Record<string, unknown> {
  assert(texto !== null, "o corpo enviado deveria existir");
  const dados: unknown = JSON.parse(texto);
  assert(typeof dados === "object" && dados !== null && !Array.isArray(dados));
  return { ...dados };
}

for (const alvo of ALVOS_HONESTOS) {
  Deno.test(`[${alvo.nome}] a: ADM lista usuários ordenados e com admin; comum recebe 403`, async () => {
    await comCliente(alvo, async ({ operacoes }) => {
      const adm = await entrarComoAdm(operacoes);
      assertEquals(adm.usuario.admin, true);
      assertEquals(ehAdministrador(adm.usuario), true);
      const primeiro = await cadastrarUsuario(operacoes, "lista.a", "Lista Um");
      const segundo = await cadastrarUsuario(
        operacoes,
        "lista.b",
        "Lista Dois",
      );

      const lista = exigirSucesso(await operacoes.listarUsuarios(adm.token));
      const ids = lista.map((usuario) => usuario.id);
      assertEquals(ids, [...ids].sort((a, b) => a - b));
      assertEquals(lista.length, 3);
      for (const usuario of lista) {
        assertEquals(chavesUsuario(usuario), ["admin", "email", "id", "nome"]);
        assertEquals(usuario.admin, usuario.email === EMAIL_ADM);
      }
      assertEquals(
        lista.find((usuario) => usuario.id === adm.usuario.id),
        adm.usuario,
      );
      assertEquals(
        lista.find((usuario) => usuario.id === primeiro.id)?.nome,
        "Lista Um",
      );
      assertEquals(
        lista.find((usuario) => usuario.id === segundo.id)?.nome,
        "Lista Dois",
      );

      const comum = await cadastrarEEntrar(operacoes, "lista.c");
      assertEquals(ehAdministrador(comum.usuario), false);
      exigirFalhaHttp(await operacoes.listarUsuarios(comum.token), 403);
    });
  });

  Deno.test(`[${alvo.nome}] b: ADM lê e atualiza outro usuário; 404 e 403 mapeados`, async () => {
    await comCliente(alvo, async ({ operacoes, registros }) => {
      const adm = await entrarComoAdm(operacoes);
      const outro = await cadastrarUsuario(operacoes, "ler.o", "Outro Usuario");

      const lido = exigirSucesso(
        await operacoes.lerCadastro(outro.id, adm.token),
      );
      assertEquals(lido, {
        id: outro.id,
        nome: outro.nome,
        email: outro.email,
        admin: false,
      });

      const novoEmail = emailUnico("ler.n");
      const atualizado = exigirSucesso(
        await operacoes.atualizarCadastro(outro.id, adm.token, {
          nome: "Outro Renomeado",
          email: novoEmail,
        }),
      );
      assertEquals(atualizado, {
        id: outro.id,
        nome: "Outro Renomeado",
        email: novoEmail,
        admin: false,
      });
      const registroPatch = ultimoRegistro(registros, "PATCH");
      assertEquals(
        Object.keys(corpoEnviado(registroPatch.corpoEnviado)).sort(),
        [
          "email",
          "nome",
        ],
      );
      assertEquals(registroPatch.status, 200);
      assertEquals(
        exigirSucesso(await operacoes.lerCadastro(outro.id, adm.token)),
        atualizado,
      );

      exigirSucesso(
        await operacoes.atualizarCadastro(outro.id, adm.token, {
          senha: "NovaSenha77",
        }),
      );
      exigirFalhaHttp(
        await operacoes.entrar({ email: novoEmail, senha: SENHA_CLIENTE }),
        401,
      );
      const sessaoOutro = exigirSucesso(
        await operacoes.entrar({ email: novoEmail, senha: "NovaSenha77" }),
      );
      assertEquals(sessaoOutro.usuario, atualizado);

      const terceiro = await cadastrarUsuario(operacoes, "ler.t");
      exigirFalhaHttp(
        await operacoes.atualizarCadastro(outro.id, adm.token, {
          email: terceiro.email,
        }),
        409,
      );
      exigirFalhaHttp(
        await operacoes.lerCadastro(ID_INEXISTENTE, adm.token),
        404,
      );
      exigirFalhaHttp(
        await operacoes.atualizarCadastro(ID_INEXISTENTE, adm.token, {
          nome: "Ninguem",
        }),
        404,
      );

      const comum = await cadastrarEEntrar(operacoes, "ler.c");
      exigirFalhaHttp(await operacoes.lerCadastro(outro.id, comum.token), 403);
      exigirFalhaHttp(
        await operacoes.lerCadastro(ID_INEXISTENTE, comum.token),
        403,
      );
      exigirFalhaHttp(
        await operacoes.atualizarCadastro(adm.usuario.id, comum.token, {
          nome: "Invasor",
        }),
        403,
      );
      assertEquals(
        exigirSucesso(await operacoes.lerCadastro(adm.usuario.id, adm.token)),
        adm.usuario,
      );
    });
  });

  Deno.test(`[${alvo.nome}] c: ADM exclui outro usuário, derruba as sessões dele e o segundo DELETE dá 404`, async () => {
    await comCliente(alvo, async ({ operacoes, registros }) => {
      const adm = await entrarComoAdm(operacoes);
      const alvoExclusao = await cadastrarEEntrar(operacoes, "exc.u");

      const resultado = await operacoes.excluirCadastro(
        alvoExclusao.usuario.id,
        adm.token,
      );
      assertEquals(resultado, { ok: true, dados: true });
      assertEquals(ultimoRegistro(registros, "DELETE").status, 204);
      const destino = decidirDestinoExclusao(resultado);
      assertEquals(destino.tipo, "navegar");
      if (destino.tipo === "navegar") {
        assertEquals(destino.estado, { avisoUsuario: "excluido" });
      }

      exigirFalhaHttp(
        await operacoes.lerCadastro(alvoExclusao.usuario.id, adm.token),
        404,
      );
      exigirFalhaHttp(
        await operacoes.lerCadastro(
          alvoExclusao.usuario.id,
          alvoExclusao.token,
        ),
        401,
      );
      exigirFalhaHttp(await operacoes.listarProdutos(alvoExclusao.token), 401);

      const repetido = await operacoes.excluirCadastro(
        alvoExclusao.usuario.id,
        adm.token,
      );
      exigirFalhaHttp(repetido, 404);
      const destinoRepetido = decidirDestinoExclusao(repetido);
      assertEquals(destinoRepetido.tipo, "navegar");
      if (destinoRepetido.tipo === "navegar") {
        assertEquals(destinoRepetido.estado, { avisoUsuario: "ja_excluido" });
      }

      const lista = exigirSucesso(await operacoes.listarUsuarios(adm.token));
      assertEquals(
        lista.some((usuario) => usuario.id === alvoExclusao.usuario.id),
        false,
      );
      exigirSucesso(await operacoes.listarUsuarios(adm.token));
    });
  });

  Deno.test(`[${alvo.nome}] d: ADM cadastra produtos com bordas, vazio e emoji; comum recebe 403`, async () => {
    await comCliente(alvo, async ({ operacoes, registros }) => {
      const adm = await entrarComoAdm(operacoes);
      const casos = [
        PRODUTO_BASE,
        { nome: "Esgotado", descricao: "", quantidade: 0 },
        {
          nome: "Estoque Máximo",
          descricao: "Limite superior",
          quantidade: 1000000,
        },
        {
          nome: "Café ☕ e ingresso 🎟️",
          descricao: "Ação, promoção e coração 💜 — “aspas” e ñ",
          quantidade: 7,
        },
        { nome: "Descrição longa", descricao: "d".repeat(500), quantidade: 1 },
      ];
      for (const dados of casos) {
        const criado = exigirSucesso(
          await operacoes.criarProduto(adm.token, dados),
        );
        assertEquals(criado, { id: criado.id, ...dados });
        const registro = ultimoRegistro(registros, "POST");
        assertEquals(registro.status, 201);
        const enviado = corpoEnviado(registro.corpoEnviado);
        assertEquals(enviado, dados);
        assertEquals(typeof enviado.quantidade, "number");
        assertEquals(
          exigirSucesso(await operacoes.lerProduto(criado.id, adm.token)),
          criado,
        );
      }

      const comum = await cadastrarEEntrar(operacoes, "cad.c");
      const proibido = await operacoes.criarProduto(comum.token, PRODUTO_BASE);
      exigirFalhaHttp(proibido, 403);
      if (!proibido.ok) {
        assert(interpretarFalhaCadastro(proibido)?.mensagem);
      }
      const recusado = await operacoes.criarProduto(adm.token, {
        ...PRODUTO_BASE,
        nome: "x",
      });
      exigirFalhaHttp(recusado, 400);
      if (!recusado.ok) {
        assertNotEquals(
          interpretarFalhaCadastro(recusado)?.mensagem,
          undefined,
        );
      }
      assertEquals(
        exigirSucesso(await operacoes.listarProdutos(adm.token)).length,
        casos.length,
      );
    });
  });

  Deno.test(`[${alvo.nome}] e: ADM consulta lista e detalhe; 404 e id inválido sem requisição`, async () => {
    await comCliente(alvo, async ({ operacoes, registros }) => {
      const adm = await entrarComoAdm(operacoes);
      assertEquals(
        exigirSucesso(await operacoes.listarProdutos(adm.token)),
        [],
      );
      const criados: RespostaProduto[] = [];
      for (let indice = 0; indice < 4; indice++) {
        criados.push(
          exigirSucesso(
            await operacoes.criarProduto(adm.token, {
              nome: `Produto ${indice}`,
              descricao: `Detalhe ${indice}`,
              quantidade: indice * 10,
            }),
          ),
        );
      }
      const lista = exigirSucesso(await operacoes.listarProdutos(adm.token));
      assertEquals(lista, criados);
      for (const produto of lista) {
        assertEquals(Object.keys(produto).sort(), [
          "descricao",
          "id",
          "nome",
          "quantidade",
        ]);
        assertEquals(
          exigirSucesso(await operacoes.lerProduto(produto.id, adm.token)),
          produto,
        );
      }
      exigirFalhaHttp(
        await operacoes.lerProduto(ID_INEXISTENTE, adm.token),
        404,
      );

      const antes = registros.length;
      for (
        const idInvalido of [
          0,
          -1,
          1.5,
          Number.NaN,
          Number.MAX_SAFE_INTEGER + 1,
        ]
      ) {
        exigirFalha(
          await operacoes.lerProduto(idInvalido, adm.token),
          "entrada_invalida",
          null,
        );
        exigirFalha(
          await operacoes.atualizarProduto(idInvalido, adm.token, PRODUTO_BASE),
          "entrada_invalida",
          null,
        );
        exigirFalha(
          await operacoes.excluirProduto(idInvalido, adm.token),
          "entrada_invalida",
          null,
        );
      }
      assertEquals(registros.length, antes);
    });
  });

  Deno.test(`[${alvo.nome}] f: ADM atualiza produto por PUT completo; 400, 404 e 403 mapeados`, async () => {
    await comCliente(alvo, async ({ operacoes, registros }) => {
      const adm = await entrarComoAdm(operacoes);
      const produto = exigirSucesso(
        await operacoes.criarProduto(adm.token, PRODUTO_BASE),
      );

      const atualizado = exigirSucesso(
        await operacoes.atualizarProduto(produto.id, adm.token, {
          nome: "  Ingresso Camarote  ",
          descricao: "  Área VIP  ",
          quantidade: 3,
        }),
      );
      assertEquals(atualizado, {
        id: produto.id,
        nome: "Ingresso Camarote",
        descricao: "Área VIP",
        quantidade: 3,
      });
      const registroPut = ultimoRegistro(registros, "PUT");
      assertEquals(registroPut.status, 200);
      assertEquals(Object.keys(corpoEnviado(registroPut.corpoEnviado)).sort(), [
        "descricao",
        "nome",
        "quantidade",
      ]);
      assertEquals(
        exigirSucesso(await operacoes.lerProduto(produto.id, adm.token)),
        atualizado,
      );

      const semDescricao = exigirSucesso(
        await operacoes.atualizarProduto(produto.id, adm.token, {
          nome: "Ingresso Camarote",
          descricao: "",
          quantidade: 0,
        }),
      );
      assertEquals(semDescricao.descricao, "");
      assertEquals(semDescricao.quantidade, 0);

      for (
        const invalido of [
          { ...PRODUTO_BASE, nome: "" },
          { ...PRODUTO_BASE, descricao: "d".repeat(501) },
          { ...PRODUTO_BASE, quantidade: 1.5 },
          { ...PRODUTO_BASE, quantidade: -1 },
          { ...PRODUTO_BASE, quantidade: 1000001 },
        ]
      ) {
        const falha = await operacoes.atualizarProduto(
          produto.id,
          adm.token,
          invalido,
        );
        const mensagem = exigirFalhaHttp(falha, 400);
        if (!falha.ok) {
          const exibida = interpretarFalhaEdicao(falha);
          assertEquals(exibida, { mensagem, apoio: null });
          assertNotEquals(exibida?.mensagem, MENSAGEM_DADOS_RECUSADOS);
        }
      }
      assertEquals(
        exigirSucesso(await operacoes.lerProduto(produto.id, adm.token)),
        semDescricao,
      );

      const comum = await cadastrarEEntrar(operacoes, "put.c");
      exigirFalhaHttp(
        await operacoes.atualizarProduto(produto.id, comum.token, PRODUTO_BASE),
        403,
      );
      exigirFalhaHttp(
        await operacoes.atualizarProduto(
          ID_INEXISTENTE,
          comum.token,
          PRODUTO_BASE,
        ),
        403,
      );

      exigirSucesso(await operacoes.excluirProduto(produto.id, adm.token));
      exigirFalhaHttp(
        await operacoes.atualizarProduto(produto.id, adm.token, PRODUTO_BASE),
        404,
      );
    });
  });

  Deno.test(`[${alvo.nome}] g: ADM exclui produto; segunda exclusão é tratada como já excluído; comum recebe 403`, async () => {
    await comCliente(alvo, async ({ operacoes, registros }) => {
      const adm = await entrarComoAdm(operacoes);
      const produto = exigirSucesso(
        await operacoes.criarProduto(adm.token, PRODUTO_BASE),
      );
      const outro = exigirSucesso(
        await operacoes.criarProduto(adm.token, {
          ...PRODUTO_BASE,
          nome: "Fica",
        }),
      );
      const comum = await cadastrarEEntrar(operacoes, "exc.c");
      const trava = { current: false };

      const mensagemProibido = exigirFalhaHttp(
        await operacoes.excluirProduto(produto.id, comum.token),
        403,
      );
      assertEquals(
        await enviarExclusaoProduto({
          excluirProduto: operacoes.excluirProduto,
          token: comum.token,
          id: produto.id,
          trava,
        }),
        { tipo: "proibido", mensagem: mensagemProibido },
      );

      assertEquals(
        await enviarExclusaoProduto({
          excluirProduto: operacoes.excluirProduto,
          token: adm.token,
          id: produto.id,
          trava,
        }),
        { tipo: "excluido" },
      );
      const registroDelete = registros.findLast((registro) =>
        registro.metodo === "DELETE" && registro.status !== 403
      );
      assertEquals(registroDelete?.status, 204);
      assertEquals(registroDelete?.corpoRecebido ?? "", "");
      exigirFalhaHttp(await operacoes.lerProduto(produto.id, adm.token), 404);

      assertEquals(
        await enviarExclusaoProduto({
          excluirProduto: operacoes.excluirProduto,
          token: adm.token,
          id: produto.id,
          trava,
        }),
        { tipo: "ja_excluido" },
      );
      assertEquals(exigirSucesso(await operacoes.listarProdutos(adm.token)), [
        outro,
      ]);
    });
  });

  Deno.test(`[${alvo.nome}] h: usuário comum consulta estoque e não escreve; sem sessão válida recebe 401`, async () => {
    await comCliente(alvo, async ({ operacoes }) => {
      const adm = await entrarComoAdm(operacoes);
      const esgotado = exigirSucesso(
        await operacoes.criarProduto(adm.token, {
          nome: "Esgotado",
          descricao: "",
          quantidade: 0,
        }),
      );
      const cheio = exigirSucesso(
        await operacoes.criarProduto(adm.token, {
          nome: "Lotado",
          descricao: "Muito estoque",
          quantidade: 1000000,
        }),
      );

      const comum = await cadastrarEEntrar(operacoes, "est.c");
      assertEquals(comum.usuario.admin, false);
      assertEquals(exigirSucesso(await operacoes.listarProdutos(comum.token)), [
        esgotado,
        cheio,
      ]);
      assertEquals(
        exigirSucesso(await operacoes.lerProduto(esgotado.id, comum.token)),
        esgotado,
      );
      assertEquals(
        exigirSucesso(await operacoes.lerProduto(cheio.id, comum.token))
          .quantidade,
        1000000,
      );
      exigirFalhaHttp(
        await operacoes.lerProduto(ID_INEXISTENTE, comum.token),
        404,
      );

      exigirFalhaHttp(
        await operacoes.criarProduto(comum.token, PRODUTO_BASE),
        403,
      );
      exigirFalhaHttp(
        await operacoes.atualizarProduto(cheio.id, comum.token, PRODUTO_BASE),
        403,
      );
      exigirFalhaHttp(
        await operacoes.excluirProduto(cheio.id, comum.token),
        403,
      );
      assertEquals(
        exigirSucesso(await operacoes.lerProduto(cheio.id, comum.token)),
        cheio,
      );

      for (const token of ["token-invalido", `${comum.token}x`]) {
        exigirFalhaHttp(await operacoes.listarProdutos(token), 401);
        exigirFalhaHttp(await operacoes.lerProduto(cheio.id, token), 401);
        exigirFalhaHttp(await operacoes.criarProduto(token, PRODUTO_BASE), 401);
      }
      const semToken = await operacoes.listarProdutos("");
      assertEquals(semToken.ok, false);
      if (!semToken.ok) {
        assertEquals(semToken.tipo, "intermediario");
        assertEquals(semToken.status, null);
      }
      exigirSucesso(await operacoes.sair(comum.sessao.id, comum.token));
      exigirFalhaHttp(await operacoes.listarProdutos(comum.token), 401);
      exigirFalhaHttp(
        await operacoes.lerProduto(esgotado.id, comum.token),
        401,
      );
      exigirFalhaHttp(
        await operacoes.lerCadastro(comum.usuario.id, comum.token),
        401,
      );
    });
  });
}
