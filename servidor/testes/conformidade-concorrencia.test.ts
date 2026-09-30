import "./auxiliares/vigia-arquivos-reais.ts";
import { assert, assertEquals } from "@std/assert";
import { abrirConexao, fecharConexao } from "../src/banco/conexao.ts";
import type { Registro } from "../src/estado.ts";
import {
  verificarRespostaErro,
  verificarRespostaSessao,
  verificarRespostaUsuario,
  verificarRespostaVazia,
} from "./auxiliares/conformidade.ts";
import {
  iniciarServidorDeTeste,
  requisitar,
} from "./auxiliares/servidor-teste.ts";
import type { ServidorDeTeste } from "./auxiliares/servidor-teste.ts";

const API = "/api/v1";
const MSG_DUPLICADO = "E-mail já cadastrado. Faça login para continuar.";
const MSG_EMAIL_EM_USO = "Este e-mail já está sendo usado por outro usuário.";

const todosRegistros: Registro[] = [];

async function comServidor(
  teste: (servidor: ServidorDeTeste) => Promise<void>,
): Promise<void> {
  const servidor = await iniciarServidorDeTeste();
  try {
    await teste(servidor);
  } finally {
    todosRegistros.push(...servidor.registros);
    await servidor.encerrar();
  }
}

interface ContaCriada {
  id: number;
  email: string;
  token: string;
  sessaoId: string;
}

async function criarConta(
  servidor: ServidorDeTeste,
  email: string,
): Promise<ContaCriada> {
  const cadastro = await requisitar(servidor, "POST", `${API}/users`, {
    corpo: { nome: "Ana Souza", email, senha: "senha123" },
  });
  const usuario = await verificarRespostaUsuario(cadastro, 201);
  const login = await requisitar(servidor, "POST", `${API}/sessions`, {
    corpo: { email, senha: "senha123" },
  });
  const sessao = await verificarRespostaSessao(login);
  return {
    id: usuario.corpo.id,
    email,
    token: sessao.corpo.token,
    sessaoId: sessao.corpo.id,
  };
}

function ordenar(valores: number[]): number[] {
  return [...valores].sort((a, b) => a - b);
}

Deno.test("20 cadastros simultâneos com o mesmo e-mail: um 201 e dezenove 409", async () => {
  await comServidor(async (servidor) => {
    const respostas = await Promise.all(
      Array.from(
        { length: 20 },
        () =>
          requisitar(servidor, "POST", `${API}/users`, {
            corpo: {
              nome: "Ana Souza",
              email: "ana@exemplo.com",
              senha: "senha123",
            },
          }),
      ),
    );
    const status: number[] = [];
    for (const resposta of respostas) {
      status.push(resposta.status);
      if (resposta.status === 201) {
        await verificarRespostaUsuario(resposta, 201);
      } else {
        await verificarRespostaErro(resposta, 409, MSG_DUPLICADO);
      }
    }
    assertEquals(status.filter((s) => s === 201).length, 1);
    assertEquals(status.filter((s) => s === 409).length, 19);

    await servidor.controlador.parar();
    const conexao = abrirConexao(servidor.caminhoBanco);
    try {
      const linha = conexao
        .prepare(
          "SELECT COUNT(*) AS total FROM usuarios WHERE email = ? COLLATE NOCASE;",
        )
        .get("ana@exemplo.com") as { total: number };
      assertEquals(linha.total, 1);
    } finally {
      fecharConexao(conexao);
    }
  });
});

Deno.test("50 cadastros simultâneos com e-mails diferentes: cinquenta 201 com ids distintos", async () => {
  await comServidor(async (servidor) => {
    const respostas = await Promise.all(
      Array.from(
        { length: 50 },
        (_, i) =>
          requisitar(servidor, "POST", `${API}/users`, {
            corpo: {
              nome: `Usuario ${i}`,
              email: `usuario${i}@exemplo.com`,
              senha: "senha123",
            },
          }),
      ),
    );
    const ids = new Set<number>();
    for (const resposta of respostas) {
      const lida = await verificarRespostaUsuario(resposta, 201);
      ids.add(lida.corpo.id);
    }
    assertEquals(ids.size, 50);
  });
});

Deno.test("10 logins simultâneos do mesmo usuário geram 10 sessões que funcionam", async () => {
  await comServidor(async (servidor) => {
    const conta = await criarConta(servidor, "ana@exemplo.com");
    const respostas = await Promise.all(
      Array.from(
        { length: 10 },
        () =>
          requisitar(servidor, "POST", `${API}/sessions`, {
            corpo: { email: "ana@exemplo.com", senha: "senha123" },
          }),
      ),
    );
    const sessoes = [];
    for (const resposta of respostas) {
      sessoes.push((await verificarRespostaSessao(resposta)).corpo);
    }
    assertEquals(new Set(sessoes.map((s) => s.id)).size, 10);
    assertEquals(new Set(sessoes.map((s) => s.token)).size, 10);

    const leituras = await Promise.all(
      sessoes.map((s) =>
        requisitar(servidor, "GET", `${API}/users/${conta.id}`, {
          token: s.token,
        })
      ),
    );
    for (const leitura of leituras) {
      await verificarRespostaUsuario(leitura, 200, { id: conta.id });
    }
  });
});

Deno.test("30 leituras simultâneas com tokens válidos retornam 200", async () => {
  await comServidor(async (servidor) => {
    const contas = await Promise.all(
      Array.from(
        { length: 6 },
        (_, i) => criarConta(servidor, `leitor${i}@exemplo.com`),
      ),
    );
    const respostas = await Promise.all(
      contas.flatMap((conta) =>
        Array.from(
          { length: 5 },
          () =>
            requisitar(servidor, "GET", `${API}/users/${conta.id}`, {
              token: conta.token,
            }),
        )
      ),
    );
    assertEquals(respostas.length, 30);
    for (const resposta of respostas) {
      await verificarRespostaUsuario(resposta, 200);
    }
  });
});

Deno.test("dois logouts simultâneos da mesma sessão: um 204 e nenhum 500", async () => {
  await comServidor(async (servidor) => {
    const conta = await criarConta(servidor, "ana@exemplo.com");
    const respostas = await Promise.all(
      Array.from(
        { length: 2 },
        () =>
          requisitar(servidor, "DELETE", `${API}/sessions/${conta.sessaoId}`, {
            token: conta.token,
          }),
      ),
    );
    const status: number[] = [];
    for (const resposta of respostas) {
      status.push(resposta.status);
      if (resposta.status === 204) {
        await verificarRespostaVazia(resposta);
      } else {
        await verificarRespostaErro(resposta, resposta.status);
      }
    }
    assertEquals(status.filter((s) => s === 204).length, 1);
    const outro = status.find((s) => s !== 204);
    assert(
      outro === 401 || outro === 403 || outro === 404,
      `status inesperado: ${outro}`,
    );
  });
});

Deno.test("duas exclusões simultâneas do mesmo usuário: um 204 e nenhum 500", async () => {
  await comServidor(async (servidor) => {
    const conta = await criarConta(servidor, "ana@exemplo.com");
    const respostas = await Promise.all(
      Array.from(
        { length: 2 },
        () =>
          requisitar(servidor, "DELETE", `${API}/users/${conta.id}`, {
            token: conta.token,
          }),
      ),
    );
    const status: number[] = [];
    for (const resposta of respostas) {
      status.push(resposta.status);
      if (resposta.status === 204) {
        await verificarRespostaVazia(resposta);
      } else {
        await verificarRespostaErro(resposta, resposta.status);
      }
    }
    assertEquals(status.filter((s) => s === 204).length, 1);
    const outro = status.find((s) => s !== 204);
    assert(outro === 401 || outro === 404, `status inesperado: ${outro}`);
  });
});

Deno.test("dois PATCH simultâneos para o mesmo e-mail: um 200 e um 409", async () => {
  await comServidor(async (servidor) => {
    const a = await criarConta(servidor, "ana@exemplo.com");
    const b = await criarConta(servidor, "bruno@exemplo.com");
    const respostas = await Promise.all(
      [a, b].map((conta, i) =>
        requisitar(servidor, "PATCH", `${API}/users/${conta.id}`, {
          token: conta.token,
          corpo: { email: "novo@exemplo.com", senha: `novaSenha${i}` },
        })
      ),
    );
    const status: number[] = [];
    for (const resposta of respostas) {
      status.push(resposta.status);
      if (resposta.status === 200) {
        await verificarRespostaUsuario(resposta, 200, {
          email: "novo@exemplo.com",
        });
      } else {
        await verificarRespostaErro(resposta, 409, MSG_EMAIL_EM_USO);
      }
    }
    assertEquals(ordenar(status), [200, 409]);
  });
});

Deno.test("as requisições foram processadas por pelo menos 2 threads", () => {
  const threads = new Set<number>();
  for (const registro of todosRegistros) {
    if (registro.tipo === "requisicao" && registro.thread !== null) {
      threads.add(registro.thread);
    }
  }
  assert(threads.size >= 2, `threads distintas: ${threads.size}`);
});

Deno.test("nenhuma falha interna: sem status 500 e sem registro de erro", () => {
  assert(todosRegistros.length > 0);
  const respostas500 = todosRegistros.filter(
    (registro) => registro.tipo === "requisicao" && registro.status === 500,
  );
  assertEquals(respostas500.length, 0);
  const erros = todosRegistros.filter(
    (registro) => registro.tipo === "sistema" && registro.nivel === "erro",
  );
  assertEquals(erros, []);
});
