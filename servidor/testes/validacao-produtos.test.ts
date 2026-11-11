import { assert, assertEquals } from "@std/assert";
import {
  validarCorpoAtualizacaoParcialProduto,
  validarCorpoCadastroProduto,
  validarIdProduto,
} from "../src/modulos/produtos/validacao-produtos.ts";
import { validarIdUsuario } from "../src/modulos/usuarios/validacao-usuarios.ts";

const MSG_NOME =
  "O campo nome deve ter entre 2 e 100 caracteres, sem contar espaços no início e no fim.";
const MSG_DESCRICAO =
  "O campo descricao deve ter no máximo 500 caracteres, sem contar espaços no início e no fim.";
const MSG_QUANTIDADE_FAIXA =
  "O campo quantidade deve estar entre 0 e 1.000.000.";
const MSG_QUANTIDADE_TIPO = "O campo quantidade deve ser um número inteiro.";
const MSG_ID = "O id do produto na URL deve ser um número inteiro positivo.";
const MSG_NENHUM_CAMPO =
  "Informe ao menos um dos campos: nome, descricao ou quantidade.";
const MSG_CORPO_OBRIGATORIO = "O corpo da requisição é obrigatório.";
const MSG_JSON_INVALIDO = "O corpo da requisição não é um JSON válido.";
const MSG_NAO_OBJETO = "O corpo da requisição deve ser um objeto JSON.";

const VALIDO = { nome: "Ingresso VIP", descricao: "Setor A", quantidade: 10 };

type Validador = (
  texto: string | null,
) =>
  | { ok: true; dados: unknown }
  | { ok: false; mensagem: string };

const VALIDADORES_COMPLETOS: [string, Validador][] = [
  ["cadastro (POST/PUT)", validarCorpoCadastroProduto],
];
const TODOS_VALIDADORES: [string, Validador][] = [
  ...VALIDADORES_COMPLETOS,
  ["atualização parcial (PATCH)", validarCorpoAtualizacaoParcialProduto],
];

function corpo(sobrescrever: Record<string, unknown>): string {
  return JSON.stringify({ ...VALIDO, ...sobrescrever });
}

function semCampo(campo: keyof typeof VALIDO): string {
  const copia: Record<string, unknown> = { ...VALIDO };
  delete copia[campo];
  return JSON.stringify(copia);
}

function conferirErro(
  resultado: { ok: true; dados: unknown } | { ok: false; mensagem: string },
  mensagem: string,
  caso: string,
): void {
  assertEquals(resultado.ok, false, `${caso}: deveria falhar`);
  if (!resultado.ok) {
    assertEquals(resultado.mensagem, mensagem, caso);
    assertEquals(resultado.mensagem.toLowerCase().includes("papel"), false);
  }
}

function conferirOk(
  resultado: { ok: true; dados: unknown } | { ok: false; mensagem: string },
  esperado: unknown,
  caso: string,
): void {
  assertEquals(
    resultado,
    { ok: true, dados: esperado },
    `${caso}: ${resultado.ok ? "" : resultado.mensagem}`,
  );
}

Deno.test("nome: limites, trim, acentos e emoji", () => {
  const casos: [unknown, string | null][] = [
    ["A", null],
    ["AB", "AB"],
    ["x".repeat(100), "x".repeat(100)],
    ["x".repeat(101), null],
    ["   ", null],
    ["", null],
    ["  Caneca  ", "Caneca"],
    [" A ", null],
    ["Pão de Açúcar", "Pão de Açúcar"],
    ["🎟️", "🎟️"],
    ["A🎟", "A🎟"],
    [`${"x".repeat(99)}😀`, `${"x".repeat(99)}😀`],
    [`${"x".repeat(100)}😀`, null],
  ];
  for (const [nome, esperado] of casos) {
    for (const [rotulo, validar] of TODOS_VALIDADORES) {
      const resultado = validar(corpo({ nome }));
      const caso = `${rotulo} nome=${JSON.stringify(nome)}`;
      if (esperado === null) {
        conferirErro(resultado, MSG_NOME, caso);
      } else {
        assert(resultado.ok, caso);
        assertEquals((resultado.dados as { nome: string }).nome, esperado);
      }
    }
  }
});

Deno.test("nome: tipos inválidos, null e ausência", () => {
  const casos: [unknown, string][] = [
    [null, "O campo nome não pode ser nulo."],
    [123, "O campo nome deve ser um texto."],
    [{}, "O campo nome deve ser um texto."],
    [[], "O campo nome deve ser um texto."],
    [true, "O campo nome deve ser um texto."],
  ];
  for (const [nome, mensagem] of casos) {
    for (const [rotulo, validar] of TODOS_VALIDADORES) {
      conferirErro(
        validar(corpo({ nome })),
        mensagem,
        `${rotulo} nome=${JSON.stringify(nome)}`,
      );
    }
  }
  conferirErro(
    validarCorpoCadastroProduto(semCampo("nome")),
    "O campo nome é obrigatório.",
    "cadastro sem nome",
  );
  conferirOk(
    validarCorpoAtualizacaoParcialProduto(semCampo("nome")),
    { descricao: "Setor A", quantidade: 10 },
    "PATCH sem nome",
  );
});

Deno.test("descricao: vazia, só espaços, limites e trim", () => {
  const casos: [string, string | null][] = [
    ["", ""],
    ["   ", ""],
    ["\t \n", ""],
    ["x".repeat(500), "x".repeat(500)],
    [`  ${"x".repeat(500)}  `, "x".repeat(500)],
    ["x".repeat(501), null],
    [`${"x".repeat(499)}😀`, `${"x".repeat(499)}😀`],
    ["  Setor B, fila 3  ", "Setor B, fila 3"],
  ];
  for (const [descricao, esperado] of casos) {
    for (const [rotulo, validar] of TODOS_VALIDADORES) {
      const resultado = validar(corpo({ descricao }));
      const caso = `${rotulo} descricao de ${descricao.length}`;
      if (esperado === null) {
        conferirErro(resultado, MSG_DESCRICAO, caso);
      } else {
        assert(resultado.ok, caso);
        assertEquals(
          (resultado.dados as { descricao: string }).descricao,
          esperado,
        );
      }
    }
  }
});

Deno.test("descricao: obrigatória no POST/PUT, opcional no PATCH, null e número rejeitados", () => {
  conferirErro(
    validarCorpoCadastroProduto(semCampo("descricao")),
    "O campo descricao é obrigatório.",
    "cadastro sem descricao",
  );
  conferirOk(
    validarCorpoAtualizacaoParcialProduto(semCampo("descricao")),
    { nome: "Ingresso VIP", quantidade: 10 },
    "PATCH sem descricao",
  );
  for (const [rotulo, validar] of TODOS_VALIDADORES) {
    conferirErro(
      validar(corpo({ descricao: null })),
      "O campo descricao não pode ser nulo.",
      `${rotulo} descricao null`,
    );
    for (const descricao of [42, false, {}, ["a"]]) {
      conferirErro(
        validar(corpo({ descricao })),
        "O campo descricao deve ser um texto.",
        `${rotulo} descricao=${JSON.stringify(descricao)}`,
      );
    }
  }
});

Deno.test("quantidade: valores aceitos, inclusive 0, 1.0, 1e3 e -0", () => {
  const casos: [string, number][] = [
    ["0", 0],
    ["1", 1],
    ["1000000", 1000000],
    ["1.0", 1],
    ["1e3", 1000],
    ["1E6", 1000000],
    ["-0", 0],
    ["10.000", 10],
  ];
  for (const [literal, esperado] of casos) {
    const texto =
      `{"nome":"Ingresso VIP","descricao":"Setor A","quantidade":${literal}}`;
    for (const [rotulo, validar] of TODOS_VALIDADORES) {
      const resultado = validar(texto);
      assert(resultado.ok, `${rotulo} quantidade=${literal}`);
      const quantidade = (resultado.dados as { quantidade: number }).quantidade;
      assertEquals(quantidade, esperado);
      assert(
        Object.is(quantidade, esperado),
        `${literal} deve virar +${esperado}`,
      );
    }
  }
});

Deno.test("quantidade: fora da faixa, fracionária, tipos errados e 1e400 rejeitados", () => {
  const casos: [string, string][] = [
    ["-1", MSG_QUANTIDADE_FAIXA],
    ["1000001", MSG_QUANTIDADE_FAIXA],
    ["-1000000", MSG_QUANTIDADE_FAIXA],
    ["9007199254740993", MSG_QUANTIDADE_FAIXA],
    ["1.5", MSG_QUANTIDADE_TIPO],
    ["0.5", MSG_QUANTIDADE_TIPO],
    ["-0.5", MSG_QUANTIDADE_TIPO],
    ['"10"', MSG_QUANTIDADE_TIPO],
    ['""', MSG_QUANTIDADE_TIPO],
    ['"abc"', MSG_QUANTIDADE_TIPO],
    ["true", MSG_QUANTIDADE_TIPO],
    ["false", MSG_QUANTIDADE_TIPO],
    ["{}", MSG_QUANTIDADE_TIPO],
    ["[]", MSG_QUANTIDADE_TIPO],
    ["[5]", MSG_QUANTIDADE_TIPO],
    ["1e400", MSG_QUANTIDADE_TIPO],
    ["-1e400", MSG_QUANTIDADE_TIPO],
    ["null", "O campo quantidade não pode ser nulo."],
  ];
  for (const [literal, mensagem] of casos) {
    const texto =
      `{"nome":"Ingresso VIP","descricao":"Setor A","quantidade":${literal}}`;
    for (const [rotulo, validar] of TODOS_VALIDADORES) {
      conferirErro(validar(texto), mensagem, `${rotulo} quantidade=${literal}`);
    }
  }
});

Deno.test("quantidade: obrigatória no POST/PUT, opcional no PATCH", () => {
  conferirErro(
    validarCorpoCadastroProduto(semCampo("quantidade")),
    "O campo quantidade é obrigatório.",
    "cadastro sem quantidade",
  );
  conferirOk(
    validarCorpoAtualizacaoParcialProduto(semCampo("quantidade")),
    { nome: "Ingresso VIP", descricao: "Setor A" },
    "PATCH sem quantidade",
  );
});

Deno.test("corpo: precisa ser um objeto JSON", () => {
  const casos: [string | null, string][] = [
    [null, MSG_CORPO_OBRIGATORIO],
    ["", MSG_CORPO_OBRIGATORIO],
    ["   ", MSG_CORPO_OBRIGATORIO],
    ["{", MSG_JSON_INVALIDO],
    ["{nome: 'x'}", MSG_JSON_INVALIDO],
    ["[]", MSG_NAO_OBJETO],
    [JSON.stringify([VALIDO]), MSG_NAO_OBJETO],
    ["null", MSG_NAO_OBJETO],
    ['"texto"', MSG_NAO_OBJETO],
    ["42", MSG_NAO_OBJETO],
    ["true", MSG_NAO_OBJETO],
  ];
  for (const [texto, mensagem] of casos) {
    for (const [rotulo, validar] of TODOS_VALIDADORES) {
      conferirErro(validar(texto), mensagem, `${rotulo} corpo=${texto}`);
    }
  }
  conferirErro(
    validarCorpoCadastroProduto("{}"),
    "O campo nome é obrigatório.",
    "cadastro {}",
  );
  conferirErro(
    validarCorpoAtualizacaoParcialProduto("{}"),
    MSG_NENHUM_CAMPO,
    "PATCH {}",
  );
});

Deno.test("corpo: campos desconhecidos são ignorados", () => {
  const extras = {
    id: 999,
    admin: true,
    papel: "administrador",
    criado_em: "2020-01-01",
    atualizado_em: null,
    outro: { a: [1] },
  };
  for (const [rotulo, validar] of TODOS_VALIDADORES) {
    conferirOk(
      validar(corpo(extras)),
      { nome: "Ingresso VIP", descricao: "Setor A", quantidade: 10 },
      rotulo,
    );
  }
  conferirOk(
    validarCorpoCadastroProduto(
      JSON.stringify({
        ...extras,
        nome: " Caneca ",
        descricao: "",
        quantidade: 0,
      }),
    ),
    { nome: "Caneca", descricao: "", quantidade: 0 },
    "cadastro com extras e quantidade 0",
  );
});

Deno.test("cadastro devolve exatamente nome, descricao e quantidade aparados", () => {
  const resultado = validarCorpoCadastroProduto(
    JSON.stringify({
      nome: "  Mochila  ",
      descricao: "  Azul  ",
      quantidade: 3,
    }),
  );
  assert(resultado.ok);
  assertEquals(Object.keys(resultado.dados), [
    "nome",
    "descricao",
    "quantidade",
  ]);
  assertEquals(resultado.dados, {
    nome: "Mochila",
    descricao: "Azul",
    quantidade: 3,
  });
});

Deno.test("PATCH: campos isolados, combinações e quantidade 0 contam como informados", () => {
  const casos: [Record<string, unknown>, Record<string, unknown>][] = [
    [{ quantidade: 0 }, { quantidade: 0 }],
    [{ descricao: "" }, { descricao: "" }],
    [{ descricao: "   " }, { descricao: "" }],
    [{ nome: "  Boné  " }, { nome: "Boné" }],
    [{ nome: "Boné", quantidade: 0 }, { nome: "Boné", quantidade: 0 }],
    [{ descricao: "Nova", quantidade: 5 }, {
      descricao: "Nova",
      quantidade: 5,
    }],
    [
      { nome: "Boné", descricao: "", quantidade: 1000000 },
      { nome: "Boné", descricao: "", quantidade: 1000000 },
    ],
    [{ quantidade: 0, admin: true, papel: "x" }, { quantidade: 0 }],
  ];
  for (const [entrada, esperado] of casos) {
    const resultado = validarCorpoAtualizacaoParcialProduto(
      JSON.stringify(entrada),
    );
    conferirOk(resultado, esperado, JSON.stringify(entrada));
    if (resultado.ok) {
      assertEquals(
        Object.keys(resultado.dados).sort(),
        Object.keys(esperado).sort(),
      );
    }
  }
});

Deno.test("PATCH: sem campo conhecido ou só com admin/papel dá erro", () => {
  for (
    const entrada of [
      {},
      { admin: true },
      { papel: "administrador" },
      { admin: true, papel: "administrador" },
      { id: 3, criado_em: "x" },
      { Nome: "Maiúscula", QUANTIDADE: 1 },
    ]
  ) {
    conferirErro(
      validarCorpoAtualizacaoParcialProduto(JSON.stringify(entrada)),
      MSG_NENHUM_CAMPO,
      JSON.stringify(entrada),
    );
  }
});

Deno.test("PATCH: null em campo conhecido não conta como informado e dá erro", () => {
  for (const campo of ["nome", "descricao", "quantidade"]) {
    conferirErro(
      validarCorpoAtualizacaoParcialProduto(JSON.stringify({ [campo]: null })),
      `O campo ${campo} não pode ser nulo.`,
      `PATCH ${campo} null`,
    );
  }
});

Deno.test("ordem dos erros: nome, depois descricao, depois quantidade", () => {
  const invalido = { nome: "A", descricao: "x".repeat(501), quantidade: -1 };
  for (const [rotulo, validar] of TODOS_VALIDADORES) {
    conferirErro(validar(JSON.stringify(invalido)), MSG_NOME, rotulo);
    conferirErro(
      validar(JSON.stringify({ ...invalido, nome: "Ok" })),
      MSG_DESCRICAO,
      rotulo,
    );
    conferirErro(
      validar(JSON.stringify({ ...invalido, nome: "Ok", descricao: "" })),
      MSG_QUANTIDADE_FAIXA,
      rotulo,
    );
  }
  conferirErro(
    validarCorpoCadastroProduto(JSON.stringify({ quantidade: "x" })),
    "O campo nome é obrigatório.",
    "cadastro sem nome e quantidade inválida",
  );
  conferirErro(
    validarCorpoCadastroProduto(
      JSON.stringify({ nome: "Ok", quantidade: "x" }),
    ),
    "O campo descricao é obrigatório.",
    "cadastro sem descricao e quantidade inválida",
  );
});

Deno.test("id do produto: mesmo comportamento do id de usuário, com mensagem própria", () => {
  const casos: [string, number | null][] = [
    ["1", 1],
    ["999999999", 999999999],
    ["9007199254740991", 9007199254740991],
    ["01", 1],
    ["0", null],
    ["00", null],
    ["-1", null],
    ["+1", null],
    ["1.5", null],
    ["1e3", null],
    ["abc", null],
    ["", null],
    [" 1", null],
    ["1 ", null],
    ["9007199254740992", null],
    ["12345678901234567890", null],
    ["١٢", null],
  ];
  for (const [texto, esperado] of casos) {
    const produto = validarIdProduto(texto);
    const usuario = validarIdUsuario(texto);
    if (esperado === null) {
      conferirErro(produto, MSG_ID, `id ${JSON.stringify(texto)}`);
      assertEquals(usuario.ok, false);
    } else {
      conferirOk(produto, esperado, `id ${JSON.stringify(texto)}`);
      assertEquals(usuario, { ok: true, dados: esperado });
    }
  }
  const erroUsuario = validarIdUsuario("abc");
  assert(!erroUsuario.ok);
  assertEquals(
    erroUsuario.mensagem,
    "O id do usuário na URL deve ser um número inteiro positivo.",
  );
});

Deno.test("todas as mensagens de erro citam o campo e nenhuma contém papel", () => {
  const erros: [string, string][] = [
    [corpo({ nome: "A" }), "nome"],
    [corpo({ nome: 1 }), "nome"],
    [corpo({ descricao: "x".repeat(501) }), "descricao"],
    [corpo({ descricao: null }), "descricao"],
    [corpo({ quantidade: -1 }), "quantidade"],
    [corpo({ quantidade: "10" }), "quantidade"],
    [semCampo("quantidade"), "quantidade"],
  ];
  for (const [texto, campo] of erros) {
    const resultado = validarCorpoCadastroProduto(texto);
    assert(!resultado.ok);
    assert(resultado.mensagem.includes(`campo ${campo}`), resultado.mensagem);
    assertEquals(resultado.mensagem.toLowerCase().includes("papel"), false);
  }
});
