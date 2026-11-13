import "./auxiliares/vigia-arquivos-reais.ts";
import { assertEquals } from "@std/assert";
import {
  decidirExibicao,
  formatarDesde,
  interpretarEventoLogados,
  montarLinhas,
  rotularTipo,
  TEXTO_CARREGANDO,
  TEXTO_DESATUALIZADO,
  TEXTO_INDISPONIVEL,
  TEXTO_PARADO,
  TEXTO_SEM_DATA,
  TEXTO_VAZIO,
  textoContador,
} from "../src/painel/publico/logados-visao.js";

const ANA = {
  id: 2,
  nome: "Ana Souza",
  email: "ana@exemplo.com",
  tipo: "comum",
  sessoes: 1,
  desde: "2026-01-05T10:00:00.000Z",
};
const ADM = {
  id: 1,
  nome: "Admin",
  email: "adm@teste.com",
  tipo: "administrador",
  sessoes: 2,
  desde: "2026-01-04T10:00:00.000Z",
};

function evento(dados: unknown): string {
  return JSON.stringify(dados);
}

Deno.test("interpretar: evento válido devolve estado, usuários e atualizadoEm", () => {
  assertEquals(
    interpretarEventoLogados(
      evento({
        estado: "disponivel",
        usuarios: [ADM, ANA],
        atualizadoEm: "2026-01-05T10:00:01.000Z",
      }),
    ),
    {
      estado: "disponivel",
      usuarios: [ADM, ANA],
      atualizadoEm: "2026-01-05T10:00:01.000Z",
    },
  );
  assertEquals(
    interpretarEventoLogados(
      evento({ estado: "disponivel", usuarios: [], atualizadoEm: null }),
    ),
    { estado: "disponivel", usuarios: [], atualizadoEm: null },
  );
});

Deno.test("interpretar: eventos totalmente inválidos devolvem null", () => {
  const invalidos: unknown[] = [
    "{",
    "",
    "null",
    "[]",
    "1",
    '"texto"',
    evento({ usuarios: [] }),
    evento({ estado: "disponivel" }),
    evento({ estado: "disponivel", usuarios: {} }),
    evento({ estado: "disponivel", usuarios: "ana" }),
    evento({ estado: "desconhecido", usuarios: [] }),
    evento({ estado: "Disponivel", usuarios: [] }),
    evento({ estado: null, usuarios: [] }),
    null,
    undefined,
    42,
  ];
  for (const texto of invalidos) {
    assertEquals(interpretarEventoLogados(texto), null, String(texto));
  }
});

Deno.test("interpretar: itens inválidos são ignorados e campos extras descartados", () => {
  const resultado = interpretarEventoLogados(evento({
    estado: "disponivel",
    atualizadoEm: 123,
    usuarios: [
      { ...ADM, token: "eyJ.segredo", senha_hash: "h", sessaoId: "x" },
      null,
      "ana",
      [],
      { ...ANA, id: "2" },
      { ...ANA, id: 0 },
      { ...ANA, id: 1.5 },
      { ...ANA, nome: 5 },
      { ...ANA, email: null },
      { ...ANA, tipo: "dono" },
      { ...ANA, sessoes: 0 },
      { ...ANA, sessoes: "1" },
      { ...ANA, desde: 1 },
      { nome: "Sem id" },
      ANA,
    ],
  }));
  assertEquals(resultado, {
    estado: "disponivel",
    usuarios: [ADM, ANA],
    atualizadoEm: null,
  });
  assertEquals(Object.keys(resultado?.usuarios[0] ?? {}), [
    "id",
    "nome",
    "email",
    "tipo",
    "sessoes",
    "desde",
  ]);
});

Deno.test("interpretar: indisponivel sempre devolve lista vazia", () => {
  assertEquals(
    interpretarEventoLogados(
      evento({ estado: "indisponivel", usuarios: [ANA], atualizadoEm: null }),
    ),
    { estado: "indisponivel", usuarios: [], atualizadoEm: null },
  );
});

Deno.test("rótulo do tipo", () => {
  assertEquals(rotularTipo("administrador"), "Administrador");
  assertEquals(rotularTipo("comum"), "Comum");
  assertEquals(rotularTipo("dono"), "Desconhecido");
  assertEquals(rotularTipo(undefined), "Desconhecido");
});

Deno.test("formatação de desde em pt-BR no fuso local", () => {
  const local = new Date(2026, 0, 5, 7, 8, 9);
  assertEquals(formatarDesde(local.toISOString()), "05/01/2026 07:08:09");
  const fimDeAno = new Date(2025, 11, 31, 23, 59, 58);
  assertEquals(formatarDesde(fimDeAno.toISOString()), "31/12/2025 23:59:58");
  for (
    const invalido of [
      "",
      "   ",
      "ontem",
      "2026-13-45T99:99:99Z",
      null,
      undefined,
      5,
    ]
  ) {
    assertEquals(formatarDesde(invalido), TEXTO_SEM_DATA, String(invalido));
  }
  assertEquals(TEXTO_SEM_DATA, "—");
});

Deno.test("texto do contador", () => {
  assertEquals(textoContador(0), "Nenhum usuário logado");
  assertEquals(textoContador(1), "1 usuário logado");
  assertEquals(textoContador(2), "2 usuários logados");
  assertEquals(textoContador(40), "40 usuários logados");
});

Deno.test("linhas da tabela trazem os textos prontos para exibir", () => {
  const local = new Date(2026, 0, 5, 7, 8, 9).toISOString();
  assertEquals(
    montarLinhas([{ ...ADM, desde: local }, { ...ANA, desde: "x" }]),
    [
      {
        nome: "Admin",
        email: "adm@teste.com",
        tipo: "Administrador",
        administrador: true,
        sessoes: "2",
        desde: "05/01/2026 07:08:09",
      },
      {
        nome: "Ana Souza",
        email: "ana@exemplo.com",
        tipo: "Comum",
        administrador: false,
        sessoes: "1",
        desde: "—",
      },
    ],
  );
});

Deno.test("seleção do estado de exibição para cada combinação", () => {
  const lista = {
    estado: "disponivel",
    usuarios: [ADM, ANA],
    atualizadoEm: null,
  };
  const vazia = { estado: "disponivel", usuarios: [], atualizadoEm: null };
  const indisponivel = {
    estado: "indisponivel",
    usuarios: [],
    atualizadoEm: null,
  };
  const casos: [
    unknown,
    boolean,
    string,
    string,
    string,
    boolean,
    number,
  ][] = [
    [lista, true, "lista", "", "2 usuários logados", true, 2],
    [vazia, true, "vazio", TEXTO_VAZIO, "Nenhum usuário logado", false, 0],
    [
      indisponivel,
      true,
      "indisponivel",
      TEXTO_INDISPONIVEL,
      "Lista indisponível",
      false,
      0,
    ],
    [null, true, "carregando", TEXTO_CARREGANDO, "Carregando", false, 0],
    [lista, false, "parado", TEXTO_PARADO, "Nenhum usuário logado", false, 0],
    [vazia, false, "parado", TEXTO_PARADO, "Nenhum usuário logado", false, 0],
    [
      indisponivel,
      false,
      "parado",
      TEXTO_PARADO,
      "Nenhum usuário logado",
      false,
      0,
    ],
    [null, false, "parado", TEXTO_PARADO, "Nenhum usuário logado", false, 0],
  ];
  for (
    const [logados, emExecucao, modo, mensagem, contador, tabela, linhas]
      of casos
  ) {
    for (const conexao of [true, false]) {
      const exibicao = decidirExibicao(logados, emExecucao, conexao);
      const descricao = `${modo} conexão=${conexao}`;
      assertEquals(exibicao.modo, modo, descricao);
      assertEquals(exibicao.mensagem, mensagem, descricao);
      assertEquals(exibicao.contador, contador, descricao);
      assertEquals(exibicao.mostrarTabela, tabela, descricao);
      assertEquals(exibicao.linhas.length, linhas, descricao);
      assertEquals(exibicao.desatualizado, !conexao, descricao);
      assertEquals(
        exibicao.aviso,
        conexao ? null : TEXTO_DESATUALIZADO,
        descricao,
      );
    }
  }
});
