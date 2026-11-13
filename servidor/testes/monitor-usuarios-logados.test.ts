import "./auxiliares/vigia-arquivos-reais.ts";
import { assert, assertEquals, assertThrows } from "@std/assert";
import {
  abrirConexao,
  type ConexaoBanco,
  fecharConexao,
} from "../src/banco/conexao.ts";
import { executarMigracoes } from "../src/banco/migracoes.ts";
import {
  abrirConexaoSomenteLeitura,
  consultarUsuariosLogados,
  type UsuarioLogado,
} from "../src/logados/consulta-usuarios-logados.ts";
import {
  type InstantaneoLogados,
  MonitorUsuariosLogados,
  type OpcoesMonitorUsuariosLogados,
} from "../src/logados/monitor-usuarios-logados.ts";
import {
  criarCaminhoBancoTemporario,
  removerBancoTemporario,
} from "./auxiliares/banco-temporario.ts";

const MENSAGEM_ERRO_LEITURA =
  "Não foi possível ler a lista de usuários logados. Nova tentativa em 0 segundos.";
const MENSAGEM_RECUPERADA =
  "A lista de usuários logados voltou a ficar disponível.";

interface Contexto {
  caminho: string;
  escritor: ConexaoBanco;
  leituras: number[];
  registros: string[];
  mudancas: InstantaneoLogados[];
  criarMonitor: (
    opcoes?: Partial<OpcoesMonitorUsuariosLogados>,
  ) => MonitorUsuariosLogados;
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function esperarAte(
  condicao: () => boolean,
  limiteMs: number,
): Promise<void> {
  const inicio = Date.now();
  while (!condicao()) {
    if (Date.now() - inicio > limiteMs) {
      throw new Error(`Condição não atingida em ${limiteMs} ms.`);
    }
    await esperar(5);
  }
}

async function comMonitor(
  teste: (contexto: Contexto) => Promise<void>,
): Promise<void> {
  const caminho = criarCaminhoBancoTemporario();
  const escritor = abrirConexao(caminho);
  const monitores: MonitorUsuariosLogados[] = [];
  try {
    executarMigracoes(escritor);
    const leituras: number[] = [];
    const registros: string[] = [];
    const mudancas: InstantaneoLogados[] = [];
    const criarMonitor = (
      opcoes: Partial<OpcoesMonitorUsuariosLogados> = {},
    ) => {
      const monitor = new MonitorUsuariosLogados({
        caminhoBanco: caminho,
        atrasoDebounceMs: 30,
        esperaMaximaMs: 200,
        intervaloReleituraMs: 60000,
        consultar: (conexao) => {
          leituras.push(Date.now());
          return consultarUsuariosLogados(conexao);
        },
        registrar: (nivel, mensagem) => registros.push(`${nivel}: ${mensagem}`),
        aoMudar: (instantaneo) => mudancas.push(instantaneo),
        ...opcoes,
      });
      monitores.push(monitor);
      return monitor;
    };
    await teste({
      caminho,
      escritor,
      leituras,
      registros,
      mudancas,
      criarMonitor,
    });
  } finally {
    for (const monitor of monitores) {
      monitor.parar();
    }
    fecharConexao(escritor);
    removerBancoTemporario(caminho);
  }
}

function logar(conexao: ConexaoBanco, nome: string): number {
  const agora = new Date().toISOString();
  const linha = conexao
    .prepare(
      "INSERT INTO usuarios (nome, email, senha_hash, senha_salt, papel, criado_em, atualizado_em) VALUES (?, ?, 'h', 's', 'comum', ?, ?) RETURNING id;",
    )
    .get(nome, `${nome.toLowerCase()}@teste.com`, agora, agora);
  const id = Number(linha?.id);
  conexao
    .prepare(
      "INSERT INTO sessoes (id, usuario_id, criado_em) VALUES (?, ?, ?);",
    )
    .run(crypto.randomUUID(), id, agora);
  return id;
}

Deno.test("iniciar faz a carga inicial, registra o log e notifica uma vez", async () => {
  await comMonitor(
    async ({ escritor, leituras, registros, mudancas, criarMonitor }) => {
      const ana = logar(escritor, "Ana");
      const monitor = criarMonitor();
      monitor.iniciar();
      monitor.iniciar();
      assertEquals(leituras.length, 1);
      const instantaneo = monitor.obterInstantaneo();
      assertEquals(instantaneo.estado, "disponivel");
      assertEquals(instantaneo.usuarios.map((u) => u.id), [ana]);
      assert(typeof instantaneo.atualizadoEm === "string");
      assertEquals(registros, [
        "info: Monitor de usuários logados iniciado com 1 usuário logado.",
      ]);
      assertEquals(mudancas.length, 1);
      assertEquals(mudancas[0].usuarios.map((u) => u.id), [ana]);
      instantaneo.usuarios.length = 0;
      instantaneo.estado = "indisponivel";
      assertEquals(monitor.obterInstantaneo().usuarios.length, 1);
      assertEquals(monitor.obterInstantaneo().estado, "disponivel");
      await esperar(1);
    },
  );
});

Deno.test("debounce: 20 pedidos em menos de 50 ms resultam em exatamente 1 leitura", async () => {
  await comMonitor(async ({ leituras, criarMonitor }) => {
    const monitor = criarMonitor();
    monitor.iniciar();
    const inicio = Date.now();
    for (let i = 0; i < 20; i++) {
      monitor.solicitarAtualizacao();
      await Promise.resolve();
    }
    assert(Date.now() - inicio < 50);
    await esperar(150);
    assertEquals(leituras.length, 2);
  });
});

Deno.test("espera máxima: pedidos contínuos não adiam a leitura indefinidamente", async () => {
  await comMonitor(async ({ leituras, criarMonitor }) => {
    const monitor = criarMonitor({
      atrasoDebounceMs: 100,
      esperaMaximaMs: 500,
    });
    monitor.iniciar();
    const inicio = Date.now();
    const intervalo = setInterval(() => monitor.solicitarAtualizacao(), 20);
    try {
      await esperar(1500);
    } finally {
      clearInterval(intervalo);
    }
    const fim = Date.now();
    const agendadas = leituras.slice(1);
    assert(agendadas.length >= 2, `leituras: ${agendadas.length}`);
    assert(agendadas.length <= 4, `leituras: ${agendadas.length}`);
    const marcos = [inicio, ...agendadas, fim];
    for (let i = 1; i < marcos.length - 1; i++) {
      const intervaloEntreLeituras = marcos[i] - marcos[i - 1];
      assert(
        intervaloEntreLeituras <= 650,
        `intervalo entre leituras: ${intervaloEntreLeituras} ms`,
      );
    }
    monitor.parar();
    const total = leituras.length;
    await esperar(300);
    assertEquals(leituras.length, total);
  });
});

Deno.test("releitura periódica percebe mudança feita no banco sem sinal", async () => {
  await comMonitor(async ({ escritor, mudancas, criarMonitor }) => {
    const monitor = criarMonitor({ intervaloReleituraMs: 50 });
    monitor.iniciar();
    assertEquals(monitor.obterInstantaneo().usuarios, []);
    const ana = logar(escritor, "Ana");
    await esperarAte(
      () => monitor.obterInstantaneo().usuarios.length === 1,
      400,
    );
    assertEquals(monitor.obterInstantaneo().usuarios[0].id, ana);
    assertEquals(mudancas.length, 2);
  });
});

Deno.test("o callback só é chamado quando o instantâneo muda", async () => {
  await comMonitor(async ({ escritor, leituras, mudancas, criarMonitor }) => {
    const monitor = criarMonitor({ atrasoDebounceMs: 5, esperaMaximaMs: 20 });
    monitor.iniciar();
    assertEquals(mudancas.length, 1);
    for (let i = 0; i < 3; i++) {
      monitor.solicitarAtualizacao();
      await esperar(40);
    }
    assertEquals(leituras.length, 4);
    assertEquals(mudancas.length, 1);
    const ana = logar(escritor, "Ana");
    monitor.solicitarAtualizacao();
    await esperarAte(() => mudancas.length === 2, 300);
    assertEquals(mudancas[1].usuarios.map((u) => u.id), [ana]);
    escritor.prepare("UPDATE usuarios SET nome = 'Ana Nova' WHERE id = ?;")
      .run(ana);
    monitor.solicitarAtualizacao();
    await esperarAte(() => mudancas.length === 3, 300);
    assertEquals(mudancas[2].usuarios[0].nome, "Ana Nova");
    monitor.solicitarAtualizacao();
    await esperar(60);
    assertEquals(mudancas.length, 3);
  });
});

Deno.test("falha ao abrir: não lança, fica indisponível, registra 1 erro e se recupera com 1 info", async () => {
  await comMonitor(
    async ({ caminho, escritor, registros, mudancas, criarMonitor }) => {
      let falhar = true;
      let tentativas = 0;
      const monitor = criarMonitor({
        intervaloReleituraMs: 20,
        abrirConexao: (caminhoBanco) => {
          tentativas++;
          if (falhar) {
            throw new Error(`falha simulada em ${caminhoBanco}`);
          }
          return abrirConexaoSomenteLeitura(caminhoBanco);
        },
      });
      monitor.iniciar();
      assertEquals(monitor.obterInstantaneo(), {
        estado: "indisponivel",
        usuarios: [],
        atualizadoEm: null,
      });
      assertEquals(registros, [`erro: ${MENSAGEM_ERRO_LEITURA}`]);
      assertEquals(mudancas.length, 0);
      await esperarAte(() => tentativas >= 5, 1000);
      monitor.solicitarAtualizacao();
      await esperar(50);
      assertEquals(registros, [`erro: ${MENSAGEM_ERRO_LEITURA}`]);
      assertEquals(registros.join().includes(caminho), false);
      const ana = logar(escritor, "Ana");
      falhar = false;
      await esperarAte(
        () => monitor.obterInstantaneo().estado === "disponivel",
        1000,
      );
      await esperar(60);
      assertEquals(registros, [
        `erro: ${MENSAGEM_ERRO_LEITURA}`,
        `info: ${MENSAGEM_RECUPERADA}`,
      ]);
      assertEquals(monitor.obterInstantaneo().usuarios.map((u) => u.id), [ana]);
      assertEquals(mudancas.length, 1);
    },
  );
});

Deno.test("falha na consulta durante a execução vira indisponível e se recupera", async () => {
  await comMonitor(async ({ escritor, registros, mudancas, criarMonitor }) => {
    const ana = logar(escritor, "Ana");
    const monitor = criarMonitor({
      atrasoDebounceMs: 5,
      esperaMaximaMs: 20,
      intervaloReleituraMs: 30,
    });
    monitor.iniciar();
    assertEquals(monitor.obterInstantaneo().estado, "disponivel");
    escritor.exec("PRAGMA foreign_keys = OFF; DROP TABLE sessoes;");
    monitor.solicitarAtualizacao();
    await esperarAte(
      () => monitor.obterInstantaneo().estado === "indisponivel",
      500,
    );
    assertEquals(monitor.obterInstantaneo().usuarios, []);
    await esperar(100);
    assertEquals(
      registros.filter((r) => r.startsWith("erro")).length,
      1,
    );
    executarMigracoes(escritor);
    escritor
      .prepare(
        "INSERT INTO sessoes (id, usuario_id, criado_em) VALUES (?, ?, ?);",
      )
      .run(crypto.randomUUID(), ana, new Date().toISOString());
    await esperarAte(
      () => monitor.obterInstantaneo().estado === "disponivel",
      500,
    );
    assertEquals(monitor.obterInstantaneo().usuarios.map((u) => u.id), [ana]);
    await esperar(100);
    assertEquals(registros.filter((r) => r.startsWith("erro")).length, 1);
    assertEquals(
      registros.filter((r) => r === `info: ${MENSAGEM_RECUPERADA}`).length,
      1,
    );
    assertEquals(mudancas.map((m) => m.estado), [
      "disponivel",
      "indisponivel",
      "disponivel",
    ]);
  });
});

Deno.test("solicitarAtualizacao nunca lança: antes de iniciar, depois de parar e com callback que lança", async () => {
  await comMonitor(async ({ escritor, leituras, registros, criarMonitor }) => {
    const monitor = criarMonitor({
      atrasoDebounceMs: 5,
      esperaMaximaMs: 20,
      aoMudar: () => {
        throw new Error("callback quebrado");
      },
      registrar: (nivel, mensagem) => {
        registros.push(`${nivel}: ${mensagem}`);
        if (nivel === "info") {
          throw new Error("registro quebrado");
        }
      },
    });
    monitor.solicitarAtualizacao();
    await esperar(30);
    assertEquals(leituras.length, 0);
    monitor.iniciar();
    assertEquals(
      registros.filter((r) =>
        r === "erro: Falha ao notificar a mudança da lista de usuários logados."
      ).length,
      1,
    );
    logar(escritor, "Ana");
    monitor.solicitarAtualizacao();
    await esperarAte(
      () => monitor.obterInstantaneo().usuarios.length === 1,
      300,
    );
    assertEquals(
      registros.filter((r) => r.startsWith("erro: Falha ao notificar")).length,
      2,
    );
    monitor.parar();
    const total = leituras.length;
    monitor.solicitarAtualizacao();
    monitor.iniciar();
    await esperar(40);
    assertEquals(leituras.length, total);
  });
});

Deno.test("parar é idempotente, fecha a conexão e impede callbacks posteriores", async () => {
  await comMonitor(async ({ escritor, mudancas, criarMonitor }) => {
    const conexoes: ConexaoBanco[] = [];
    const monitor = criarMonitor({
      atrasoDebounceMs: 20,
      intervaloReleituraMs: 25,
      abrirConexao: (caminhoBanco) => {
        const conexao = abrirConexaoSomenteLeitura(caminhoBanco);
        conexoes.push(conexao);
        return conexao;
      },
    });
    monitor.iniciar();
    assertEquals(conexoes.length, 1);
    logar(escritor, "Ana");
    monitor.solicitarAtualizacao();
    monitor.parar();
    monitor.parar();
    assertThrows(() => conexoes[0].prepare("SELECT 1;"));
    await esperar(80);
    assertEquals(mudancas.length, 1);
    assertEquals(monitor.obterInstantaneo().usuarios, []);
  });
});

Deno.test("a lista do instantâneo tem só os campos de UsuarioLogado", async () => {
  await comMonitor(async ({ escritor, criarMonitor }) => {
    logar(escritor, "Ana");
    const monitor = criarMonitor();
    monitor.iniciar();
    const [item] = monitor.obterInstantaneo().usuarios;
    const chaves: (keyof UsuarioLogado)[] = [
      "id",
      "nome",
      "email",
      "tipo",
      "sessoes",
      "desde",
    ];
    assertEquals(Object.keys(item), chaves);
    await esperar(1);
  });
});
