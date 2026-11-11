import "./auxiliares/vigia-arquivos-reais.ts";
import { assert, assertEquals, assertNotEquals } from "@std/assert";
import { abrirConexao, fecharConexao } from "../src/banco/conexao.ts";
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
  type CorpoUsuario,
  verificarCors,
  verificarRespostaErro,
  verificarRespostaSessao,
  verificarRespostaUsuario,
  verificarRespostaVazia,
  verificarSemDadosSensiveis,
} from "./auxiliares/conformidade.ts";
import {
  criarCaminhoSegredoTemporario,
  removerSegredoTemporario,
} from "./auxiliares/segredo-temporario.ts";
import { requisitar } from "./auxiliares/servidor-teste.ts";
import type { ServidorDeTeste } from "./auxiliares/servidor-teste.ts";

const API = "/api/v1";
const JSON_CT = "application/json; charset=utf-8";
const MSG_TOKEN_INVALIDO =
  "Token de acesso inválido ou sessão encerrada. Faça login novamente.";
const MSG_POSSE =
  "Você não tem permissão para acessar os dados de outro usuário.";
const MSG_LISTAGEM = "Apenas administradores podem listar os usuários.";
const MSG_NAO_ENCONTRADO = "Usuário não encontrado.";
const ID_INEXISTENTE = 999999;
const SENHAS = [SENHA_ADM_PADRAO, "senha123", "senhaNova9"];

interface Sessao {
  idUsuario: number;
  sessaoId: string;
  token: string;
  usuario: CorpoUsuario;
}

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
  textos: string[],
): Promise<Sessao> {
  const resposta = await requisitar(servidor, "POST", `${API}/sessions`, {
    corpo: { email, senha },
  });
  const lida = await verificarRespostaSessao(resposta);
  textos.push(lida.texto);
  return {
    idUsuario: lida.corpo.usuario.id,
    sessaoId: lida.corpo.id,
    token: lida.corpo.token,
    usuario: lida.corpo.usuario,
  };
}

async function cadastrar(
  servidor: ServidorDeTeste,
  nome: string,
  email: string,
  textos: string[],
): Promise<number> {
  const resposta = await requisitar(servidor, "POST", `${API}/users`, {
    corpo: { nome, email, senha: "senha123" },
  });
  const location = resposta.headers.get("Location");
  const lida = await verificarRespostaUsuario(resposta, 201, {
    nome,
    email,
    admin: false,
  });
  textos.push(lida.texto);
  assertEquals(location, `${API}/users/${lida.corpo.id}`);
  return lida.corpo.id;
}

async function listar(
  servidor: ServidorDeTeste,
  token: string,
  textos: string[],
): Promise<CorpoUsuario[]> {
  const resposta = await requisitar(servidor, "GET", `${API}/users`, {
    token,
  });
  assertEquals(resposta.status, 200);
  verificarCors(resposta);
  assertEquals(resposta.headers.get("Content-Type"), JSON_CT);
  const texto = await resposta.text();
  textos.push(texto);
  const corpo: unknown = JSON.parse(texto);
  assert(Array.isArray(corpo), "a lista deve ser um array");
  const itens: CorpoUsuario[] = [];
  for (const item of corpo) {
    assert(typeof item === "object" && item !== null);
    assertEquals(Object.keys(item), ["id", "nome", "email", "admin"]);
    const { id, nome, email, admin } = item as Record<string, unknown>;
    assert(typeof id === "number" && typeof nome === "string");
    assert(typeof email === "string" && typeof admin === "boolean");
    itens.push({ id, nome, email, admin });
  }
  for (let i = 1; i < itens.length; i++) {
    assert(itens[i - 1].id < itens[i].id, "ids devem ser crescentes");
  }
  return itens;
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

Deno.test("fluxo completo do ADM por HTTP real, com recriação do ADM padrão ao reiniciar", async () => {
  const caminhoBanco = criarCaminhoBancoTemporario();
  const caminhoSegredoJwt = criarCaminhoSegredoTemporario();
  const registros: Registro[] = [];
  const textos: string[] = [];
  let servidor = await iniciar(caminhoBanco, caminhoSegredoJwt, registros);
  try {
    const loginAdm = await requisitar(servidor, "POST", `${API}/sessions`, {
      corpo: { email: EMAIL_ADM_PADRAO, senha: SENHA_ADM_PADRAO },
    });
    const sessaoAdm = await verificarRespostaSessao(loginAdm);
    textos.push(sessaoAdm.texto);
    assertEquals(sessaoAdm.corpo.usuario, {
      id: sessaoAdm.corpo.usuario.id,
      nome: NOME_ADM_PADRAO,
      email: EMAIL_ADM_PADRAO,
      admin: true,
    });
    const adm = {
      id: sessaoAdm.corpo.usuario.id,
      token: sessaoAdm.corpo.token,
    };

    const idAna = await cadastrar(
      servidor,
      "Ana Souza",
      "ana@exemplo.com",
      textos,
    );
    const idBruno = await cadastrar(
      servidor,
      "Bruno Lima",
      "bruno@exemplo.com",
      textos,
    );
    const idCarla = await cadastrar(
      servidor,
      "Carla Dias",
      "carla@exemplo.com",
      textos,
    );

    assertEquals(await listar(servidor, adm.token, textos), [
      {
        id: adm.id,
        nome: NOME_ADM_PADRAO,
        email: EMAIL_ADM_PADRAO,
        admin: true,
      },
      { id: idAna, nome: "Ana Souza", email: "ana@exemplo.com", admin: false },
      {
        id: idBruno,
        nome: "Bruno Lima",
        email: "bruno@exemplo.com",
        admin: false,
      },
      {
        id: idCarla,
        nome: "Carla Dias",
        email: "carla@exemplo.com",
        admin: false,
      },
    ]);

    textos.push(
      (await verificarRespostaUsuario(
        await requisitar(servidor, "GET", `${API}/users/${idBruno}`, {
          token: adm.token,
        }),
        200,
        { id: idBruno, nome: "Bruno Lima", admin: false },
      )).texto,
    );

    textos.push(
      (await verificarRespostaUsuario(
        await requisitar(servidor, "PUT", `${API}/users/${idBruno}`, {
          token: adm.token,
          corpo: {
            nome: "Bruno Novo",
            email: "bruno.novo@exemplo.com",
            senha: "senhaNova9",
            admin: true,
          },
        }),
        200,
        {
          id: idBruno,
          nome: "Bruno Novo",
          email: "bruno.novo@exemplo.com",
          admin: false,
        },
      )).texto,
    );
    let lista = await listar(servidor, adm.token, textos);
    assertEquals(lista.find((u) => u.id === idBruno), {
      id: idBruno,
      nome: "Bruno Novo",
      email: "bruno.novo@exemplo.com",
      admin: false,
    });

    textos.push(
      (await verificarRespostaUsuario(
        await requisitar(servidor, "PATCH", `${API}/users/${idCarla}`, {
          token: adm.token,
          corpo: { nome: "Carla Patch" },
        }),
        200,
        { id: idCarla, nome: "Carla Patch", email: "carla@exemplo.com" },
      )).texto,
    );
    lista = await listar(servidor, adm.token, textos);
    assertEquals(lista.find((u) => u.id === idCarla)?.nome, "Carla Patch");

    await verificarRespostaVazia(
      await requisitar(servidor, "DELETE", `${API}/users/${idCarla}`, {
        token: adm.token,
      }),
    );
    lista = await listar(servidor, adm.token, textos);
    assertEquals(lista.map((u) => u.id), [adm.id, idAna, idBruno]);

    const ana = await logar(servidor, "ana@exemplo.com", "senha123", textos);
    assertEquals(ana.usuario.admin, false);
    textos.push(
      (await verificarRespostaErro(
        await requisitar(servidor, "GET", `${API}/users`, { token: ana.token }),
        403,
        MSG_LISTAGEM,
      )).texto,
    );
    for (const id of [idBruno, adm.id, ID_INEXISTENTE]) {
      textos.push(
        (await verificarRespostaErro(
          await requisitar(servidor, "GET", `${API}/users/${id}`, {
            token: ana.token,
          }),
          403,
          MSG_POSSE,
        )).texto,
      );
    }
    textos.push(
      (await verificarRespostaErro(
        await requisitar(servidor, "GET", `${API}/users/${ID_INEXISTENTE}`, {
          token: adm.token,
        }),
        404,
        MSG_NAO_ENCONTRADO,
      )).texto,
    );

    await verificarRespostaVazia(
      await requisitar(servidor, "DELETE", `${API}/sessions/${ana.sessaoId}`, {
        token: ana.token,
      }),
    );
    await verificarRespostaErro(
      await requisitar(servidor, "GET", `${API}/users/${idAna}`, {
        token: ana.token,
      }),
      401,
      MSG_TOKEN_INVALIDO,
    );

    const bruno = await logar(
      servidor,
      "bruno.novo@exemplo.com",
      "senhaNova9",
      textos,
    );
    await verificarRespostaVazia(
      await requisitar(servidor, "DELETE", `${API}/users/${idBruno}`, {
        token: adm.token,
      }),
    );
    await verificarRespostaErro(
      await requisitar(servidor, "GET", `${API}/users/${idBruno}`, {
        token: bruno.token,
      }),
      401,
      MSG_TOKEN_INVALIDO,
    );
    lista = await listar(servidor, adm.token, textos);
    assertEquals(lista.map((u) => u.id), [adm.id, idAna]);

    textos.push(
      (await verificarRespostaUsuario(
        await requisitar(servidor, "PATCH", `${API}/users/${adm.id}`, {
          token: adm.token,
          corpo: { email: "chefe@exemplo.com" },
        }),
        200,
        { id: adm.id, email: "chefe@exemplo.com", admin: true },
      )).texto,
    );
    lista = await listar(servidor, adm.token, textos);
    assertEquals(lista[0], {
      id: adm.id,
      nome: NOME_ADM_PADRAO,
      email: "chefe@exemplo.com",
      admin: true,
    });

    await verificarRespostaVazia(
      await requisitar(servidor, "DELETE", `${API}/users/${adm.id}`, {
        token: adm.token,
      }),
    );
    await verificarRespostaErro(
      await requisitar(servidor, "GET", `${API}/users`, { token: adm.token }),
      401,
      MSG_TOKEN_INVALIDO,
    );

    const conexao = abrirConexao(caminhoBanco);
    try {
      const administradores = conexao
        .prepare("SELECT id FROM usuarios WHERE papel = 'administrador';")
        .all();
      assertEquals(administradores.length, 0);
    } finally {
      fecharConexao(conexao);
    }

    await servidor.encerrar();
    servidor = await iniciar(caminhoBanco, caminhoSegredoJwt, registros);

    const novoAdm = await logar(
      servidor,
      EMAIL_ADM_PADRAO,
      SENHA_ADM_PADRAO,
      textos,
    );
    assertEquals(novoAdm.usuario.admin, true);
    assertEquals(novoAdm.usuario.nome, NOME_ADM_PADRAO);
    assertNotEquals(novoAdm.idUsuario, adm.id);
    assert(novoAdm.idUsuario > idCarla);
    assertEquals(await listar(servidor, novoAdm.token, textos), [
      { id: idAna, nome: "Ana Souza", email: "ana@exemplo.com", admin: false },
      {
        id: novoAdm.idUsuario,
        nome: NOME_ADM_PADRAO,
        email: EMAIL_ADM_PADRAO,
        admin: true,
      },
    ]);

    for (const texto of textos) {
      verificarSemDadosSensiveis(texto, SENHAS);
    }
    conferirSemFalhas(registros);
  } finally {
    await servidor.encerrar();
    removerBancoTemporario(caminhoBanco);
    removerSegredoTemporario(caminhoSegredoJwt);
  }
});
