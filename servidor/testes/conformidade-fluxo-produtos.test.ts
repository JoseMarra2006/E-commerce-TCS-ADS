import "./auxiliares/vigia-arquivos-reais.ts";
import { assert, assertEquals, assertNotEquals } from "@std/assert";
import { ControladorServidor } from "../src/controlador-servidor.ts";
import type { Registro } from "../src/estado.ts";
import {
  EMAIL_ADM_PADRAO,
  NOME_ADM_PADRAO,
  SENHA_ADM_PADRAO,
} from "../src/modulos/usuarios/adm-padrao.ts";
import {
  criarCaminhoBancoTemporario,
  removerBancoTemporario,
} from "./auxiliares/banco-temporario.ts";
import {
  type CorpoProduto,
  type CorpoSessao,
  verificarRespostaErro,
  verificarRespostaListaProdutos,
  verificarRespostaProduto,
  verificarRespostaSessao,
  verificarRespostaUsuario,
  verificarRespostaVazia,
} from "./auxiliares/conformidade.ts";
import {
  criarCaminhoSegredoTemporario,
  removerSegredoTemporario,
} from "./auxiliares/segredo-temporario.ts";
import { requisitar } from "./auxiliares/servidor-teste.ts";
import type { ServidorDeTeste } from "./auxiliares/servidor-teste.ts";

const API = "/api/v1";
const PRODUTOS = `${API}/products`;
const ID_INEXISTENTE = 999999;
const MSG_TOKEN_INVALIDO =
  "Token de acesso inválido ou sessão encerrada. Faça login novamente.";
const MSG_CADASTRO = "Apenas administradores podem cadastrar produtos.";
const MSG_ALTERACAO = "Apenas administradores podem alterar produtos.";
const MSG_EXCLUSAO = "Apenas administradores podem excluir produtos.";
const MSG_NAO_ENCONTRADO = "Produto não encontrado.";

function obterPortaLivre(): number {
  const listener = Deno.listen({ port: 0 });
  const porta = (listener.addr as Deno.NetAddr).port;
  listener.close();
  return porta;
}

async function iniciar(
  caminhoBanco: string,
  caminhoSegredoJwt: string,
  registros: Registro[],
): Promise<ServidorDeTeste> {
  const controlador = new ControladorServidor({
    caminhoBanco,
    caminhoSegredoJwt,
  });
  controlador.addEventListener("registro", (evento) => {
    registros.push((evento as CustomEvent<Registro>).detail);
  });
  const porta = obterPortaLivre();
  const resultado = await controlador.iniciar(porta);
  assertEquals(resultado.ok, true, resultado.mensagem);
  const origem = `http://127.0.0.1:${porta}`;
  return {
    urlBase: `${origem}${API}`,
    origem,
    caminhoBanco,
    controlador,
    registros,
    encerrar: async () => {
      await controlador.parar();
    },
  };
}

async function logar(
  servidor: ServidorDeTeste,
  email: string,
  senha: string,
): Promise<CorpoSessao> {
  return (await verificarRespostaSessao(
    await requisitar(servidor, "POST", `${API}/sessions`, {
      corpo: { email, senha },
    }),
  )).corpo;
}

async function criarProduto(
  servidor: ServidorDeTeste,
  token: string,
  corpo: Omit<CorpoProduto, "id">,
): Promise<CorpoProduto> {
  const resposta = await requisitar(servidor, "POST", PRODUTOS, {
    token,
    corpo,
  });
  const location = resposta.headers.get("Location");
  const lida = await verificarRespostaProduto(resposta, 201, corpo);
  assertEquals(location, `${PRODUTOS}/${lida.corpo.id}`);
  return lida.corpo;
}

async function listar(
  servidor: ServidorDeTeste,
  token: string,
): Promise<CorpoProduto[]> {
  return (await verificarRespostaListaProdutos(
    await requisitar(servidor, "GET", PRODUTOS, { token }),
  )).corpo;
}

async function ler(
  servidor: ServidorDeTeste,
  token: string,
  id: number,
): Promise<CorpoProduto> {
  return (await verificarRespostaProduto(
    await requisitar(servidor, "GET", `${PRODUTOS}/${id}`, { token }),
    200,
  )).corpo;
}

async function conferirComumBloqueado(
  servidor: ServidorDeTeste,
  token: string,
  ids: number[],
): Promise<void> {
  await verificarRespostaErro(
    await requisitar(servidor, "POST", PRODUTOS, {
      token,
      corpo: { nome: "Pirata", descricao: "", quantidade: 1 },
    }),
    403,
    MSG_CADASTRO,
  );
  for (const id of [...ids, ID_INEXISTENTE]) {
    const caminho = `${PRODUTOS}/${id}`;
    await verificarRespostaErro(
      await requisitar(servidor, "PUT", caminho, {
        token,
        corpo: { nome: "Pirata", descricao: "", quantidade: 0 },
      }),
      403,
      MSG_ALTERACAO,
    );
    await verificarRespostaErro(
      await requisitar(servidor, "PATCH", caminho, {
        token,
        corpo: { quantidade: 0 },
      }),
      403,
      MSG_ALTERACAO,
    );
    await verificarRespostaErro(
      await requisitar(servidor, "DELETE", caminho, { token }),
      403,
      MSG_EXCLUSAO,
    );
  }
}

function conferirSemFalhas(registros: Registro[]): void {
  assert(registros.length > 0);
  assertEquals(
    registros.filter((r) => r.tipo === "requisicao" && r.status === 500),
    [],
  );
  assertEquals(
    registros.filter((r) => r.tipo === "sistema" && r.nivel === "erro"),
    [],
  );
}

Deno.test("fluxo completo de produtos por HTTP real, com persistência ao reiniciar", async () => {
  const caminhoBanco = criarCaminhoBancoTemporario();
  const caminhoSegredoJwt = criarCaminhoSegredoTemporario();
  const registros: Registro[] = [];
  let servidor = await iniciar(caminhoBanco, caminhoSegredoJwt, registros);
  try {
    const adm = await logar(servidor, EMAIL_ADM_PADRAO, SENHA_ADM_PADRAO);
    assertEquals(adm.usuario.admin, true);

    const teclado = await criarProduto(servidor, adm.token, {
      nome: "Teclado mecânico",
      descricao: "ABNT2, switch azul",
      quantidade: 15,
    });
    const ingresso = await criarProduto(servidor, adm.token, {
      nome: "Ingresso Show",
      descricao: "",
      quantidade: 1,
    });
    const caneca = await criarProduto(servidor, adm.token, {
      nome: "Caneca",
      descricao: "Cerâmica ☕",
      quantidade: 40,
    });
    assert(teclado.id < ingresso.id && ingresso.id < caneca.id);
    assertEquals(await listar(servidor, adm.token), [
      teclado,
      ingresso,
      caneca,
    ]);

    await verificarRespostaUsuario(
      await requisitar(servidor, "POST", `${API}/users`, {
        corpo: {
          nome: "Ana Souza",
          email: "ana@exemplo.com",
          senha: "senha123",
        },
      }),
      201,
      { admin: false },
    );
    const ana = await logar(servidor, "ana@exemplo.com", "senha123");
    assertEquals(ana.usuario.admin, false);

    assertEquals(await listar(servidor, ana.token), [
      teclado,
      ingresso,
      caneca,
    ]);
    for (const produto of [teclado, ingresso, caneca]) {
      assertEquals(await ler(servidor, ana.token, produto.id), produto);
    }
    await conferirComumBloqueado(servidor, ana.token, [
      teclado.id,
      ingresso.id,
      caneca.id,
    ]);
    assertEquals(await listar(servidor, adm.token), [
      teclado,
      ingresso,
      caneca,
    ]);

    const tecladoNovo = (await verificarRespostaProduto(
      await requisitar(servidor, "PUT", `${PRODUTOS}/${teclado.id}`, {
        token: adm.token,
        corpo: {
          id: 777,
          nome: "  Teclado sem fio  ",
          descricao: "  Bluetooth  ",
          quantidade: 12,
        },
      }),
      200,
      {
        id: teclado.id,
        nome: "Teclado sem fio",
        descricao: "Bluetooth",
        quantidade: 12,
      },
    )).corpo;
    const ingressoNovo = (await verificarRespostaProduto(
      await requisitar(servidor, "PATCH", `${PRODUTOS}/${ingresso.id}`, {
        token: adm.token,
        corpo: { quantidade: 0 },
      }),
      200,
      { ...ingresso, quantidade: 0 },
    )).corpo;
    await verificarRespostaVazia(
      await requisitar(servidor, "DELETE", `${PRODUTOS}/${caneca.id}`, {
        token: adm.token,
      }),
    );

    const esperados = [tecladoNovo, ingressoNovo];
    assertEquals(await listar(servidor, adm.token), esperados);
    for (const token of [adm.token, ana.token]) {
      await verificarRespostaErro(
        await requisitar(servidor, "GET", `${PRODUTOS}/${caneca.id}`, {
          token,
        }),
        404,
        MSG_NAO_ENCONTRADO,
      );
    }
    assertEquals(await listar(servidor, ana.token), esperados);
    assertEquals(await ler(servidor, ana.token, ingresso.id), ingressoNovo);

    await verificarRespostaVazia(
      await requisitar(servidor, "DELETE", `${API}/users/${adm.usuario.id}`, {
        token: adm.token,
      }),
    );
    await verificarRespostaErro(
      await requisitar(servidor, "GET", PRODUTOS, { token: adm.token }),
      401,
      MSG_TOKEN_INVALIDO,
    );
    assertEquals(await listar(servidor, ana.token), esperados);
    assertEquals(await ler(servidor, ana.token, teclado.id), tecladoNovo);

    await servidor.encerrar();
    servidor = await iniciar(caminhoBanco, caminhoSegredoJwt, registros);

    assertEquals(await listar(servidor, ana.token), esperados);
    const novoAdm = await logar(servidor, EMAIL_ADM_PADRAO, SENHA_ADM_PADRAO);
    assertEquals(novoAdm.usuario.admin, true);
    assertEquals(novoAdm.usuario.nome, NOME_ADM_PADRAO);
    assertNotEquals(novoAdm.usuario.id, adm.usuario.id);
    assertEquals(await listar(servidor, novoAdm.token), esperados);
    for (const produto of esperados) {
      assertEquals(await ler(servidor, novoAdm.token, produto.id), produto);
    }
    await conferirComumBloqueado(servidor, ana.token, [teclado.id]);

    const recriado = await criarProduto(servidor, novoAdm.token, {
      nome: "Caneca",
      descricao: "Reposição",
      quantidade: 5,
    });
    assert(recriado.id > caneca.id);

    conferirSemFalhas(registros);
  } finally {
    await servidor.encerrar();
    removerBancoTemporario(caminhoBanco);
    removerSegredoTemporario(caminhoSegredoJwt);
  }
});
