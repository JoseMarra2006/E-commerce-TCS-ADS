import { assert, assertEquals } from "@std/assert";
import {
  cadastrar,
  comServidor,
  conferirErro,
  conferirProduto,
  conferirSemCorpo,
  conferirStatus,
  conferirUsuario,
  criarProduto,
  EMAIL_ADM,
  entrar,
  entrarComoAdm,
  lerId,
  lerLista,
  lerObjeto,
  NOME_ADM,
  requisitar,
  SENHA_PADRAO,
} from "../auxiliares/cliente-colega.ts";

Deno.test("concorrência: 20 cadastros simultâneos de produto geram 20 ids distintos", async () => {
  await comServidor(async ({ porta }) => {
    const adm = await entrarComoAdm(porta);
    const respostas = await Promise.all(
      Array.from(
        { length: 20 },
        (_, indice) =>
          requisitar(porta, "POST", "/products", {
            token: adm.token,
            corpo: {
              nome: `Simultaneo ${indice}`,
              descricao: `Lote ${indice}`,
              quantidade: indice,
            },
          }),
      ),
    );
    const ids = respostas.map((resposta, indice) => {
      conferirStatus(resposta, 201);
      return lerId(
        conferirProduto(lerObjeto(resposta), {
          nome: `Simultaneo ${indice}`,
          descricao: `Lote ${indice}`,
          quantidade: indice,
        }),
      );
    });
    assertEquals(new Set(ids).size, 20);

    const lista = lerLista(
      await requisitar(porta, "GET", "/products", { token: adm.token }),
    );
    assertEquals(lista.length, 20);
    const idsLista = lista.map(lerId);
    assertEquals(idsLista, [...ids].sort((a, b) => a - b));
  });
});

Deno.test("concorrência: 5 exclusões simultâneas do mesmo produto dão um 204 e quatro 404", async () => {
  await comServidor(async ({ porta }) => {
    const adm = await entrarComoAdm(porta);
    const produto = await criarProduto(porta, adm.token, {
      nome: "Disputado",
      descricao: "",
      quantidade: 1,
    });
    const id = lerId(produto);
    const respostas = await Promise.all(
      Array.from(
        { length: 5 },
        () =>
          requisitar(porta, "DELETE", `/products/${id}`, { token: adm.token }),
      ),
    );
    const sucessos = respostas.filter((resposta) => resposta.status === 204);
    const ausentes = respostas.filter((resposta) => resposta.status === 404);
    assertEquals(sucessos.length, 1);
    assertEquals(ausentes.length, 4);
    conferirSemCorpo(sucessos[0], 204);
    for (const resposta of ausentes) {
      conferirErro(resposta, 404);
    }
    conferirErro(
      await requisitar(porta, "GET", `/products/${id}`, { token: adm.token }),
      404,
    );
  });
});

Deno.test("concorrência: 10 PUTs simultâneos terminam em 200 e o estado final é um dos enviados", async () => {
  await comServidor(async ({ porta }) => {
    const adm = await entrarComoAdm(porta);
    const produto = await criarProduto(porta, adm.token, {
      nome: "Original",
      descricao: "Inicial",
      quantidade: 0,
    });
    const id = lerId(produto);
    const corpos = Array.from({ length: 10 }, (_, indice) => ({
      nome: `Versao ${indice}`,
      descricao: `Descricao ${indice}`,
      quantidade: indice * 100 + 1,
    }));
    const respostas = await Promise.all(
      corpos.map((corpo) =>
        requisitar(porta, "PUT", `/products/${id}`, {
          token: adm.token,
          corpo,
        })
      ),
    );
    respostas.forEach((resposta, indice) => {
      conferirStatus(resposta, 200);
      conferirProduto(lerObjeto(resposta), { id, ...corpos[indice] });
    });

    const final = conferirProduto(
      lerObjeto(
        await requisitar(porta, "GET", `/products/${id}`, { token: adm.token }),
      ),
      { id },
    );
    const correspondente = corpos.find((corpo) =>
      corpo.nome === final.nome && corpo.descricao === final.descricao &&
      corpo.quantidade === final.quantidade
    );
    assert(
      correspondente !== undefined,
      `estado final misturou requisições: ${JSON.stringify(final)}`,
    );
  });
});

Deno.test("persistência: usuários, ADM padrão e produtos sobrevivem a reinícios sem duplicar o ADM", async () => {
  await comServidor(async ({ servidor, porta }) => {
    const adm = await entrarComoAdm(porta);
    const usuario = await cadastrar(porta, "persiste", "Persistente");
    const produto = await criarProduto(porta, adm.token, {
      nome: "Duradouro",
      descricao: "Sobrevive ao reinicio",
      quantidade: 42,
    });

    for (let rodada = 0; rodada < 2; rodada++) {
      await servidor.parar();
      await servidor.reiniciar();

      const novoAdm = await entrarComoAdm(porta);
      conferirUsuario(novoAdm.usuario, {
        id: adm.idUsuario,
        nome: NOME_ADM,
        email: EMAIL_ADM,
        admin: true,
      });
      const usuarios = lerLista(
        await requisitar(porta, "GET", "/users", { token: novoAdm.token }),
      );
      assertEquals(
        usuarios.filter((item) =>
          typeof item.email === "string" &&
          item.email.toLowerCase() === EMAIL_ADM
        ).length,
        1,
      );
      assertEquals(
        usuarios.filter((item) => item.admin === true).length,
        1,
      );
      assertEquals(usuarios.length, 2);
      const lidoUsuario = usuarios.find((item) => item.id === usuario.id);
      conferirUsuario(lidoUsuario, { ...usuario, admin: false });
      await entrar(porta, usuario.email, SENHA_PADRAO);

      const produtos = lerLista(
        await requisitar(porta, "GET", "/products", { token: novoAdm.token }),
      );
      assertEquals(produtos, [produto]);
    }
  });
});
