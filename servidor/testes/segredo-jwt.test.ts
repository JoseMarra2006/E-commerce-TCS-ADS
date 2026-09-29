import {
  assert,
  assertEquals,
  assertNotEquals,
  assertThrows,
} from "@std/assert";
import { dirname } from "node:path";
import {
  carregarOuGerarSegredoJwt,
  obterCaminhoSegredoJwt,
} from "../src/utilitarios/segredo-jwt.ts";
import {
  criarCaminhoSegredoTemporario,
  removerSegredoTemporario,
} from "./auxiliares/segredo-temporario.ts";

const PADRAO_SEGREDO = /^[0-9a-f]{128}$/;

function existe(caminho: string): boolean {
  try {
    Deno.statSync(caminho);
    return true;
  } catch (erro) {
    if (erro instanceof Deno.errors.NotFound) {
      return false;
    }
    throw erro;
  }
}

Deno.test("obterCaminhoSegredoJwt aponta para dados/segredo-jwt.txt", () => {
  const caminho = obterCaminhoSegredoJwt();
  assert(caminho.endsWith("segredo-jwt.txt"));
  assert(dirname(caminho).endsWith("dados"));
});

Deno.test("arquivo inexistente gera segredo de 128 hexadecimais minúsculos", () => {
  const caminho = criarCaminhoSegredoTemporario();
  try {
    const resultado = carregarOuGerarSegredoJwt(caminho);
    assertEquals(resultado.situacao, "gerado");
    const conteudo = Deno.readTextFileSync(caminho);
    assert(PADRAO_SEGREDO.test(conteudo));
    assertEquals(resultado.segredo, conteudo);
    assertEquals(existe(`${caminho}.tmp`), false);
  } finally {
    removerSegredoTemporario(caminho);
  }
});

Deno.test("segunda chamada carrega o mesmo segredo", () => {
  const caminho = criarCaminhoSegredoTemporario();
  try {
    const primeiro = carregarOuGerarSegredoJwt(caminho);
    const segundo = carregarOuGerarSegredoJwt(caminho);
    assertEquals(segundo.situacao, "carregado");
    assertEquals(segundo.segredo, primeiro.segredo);
    assertEquals(existe(`${caminho}.tmp`), false);
  } finally {
    removerSegredoTemporario(caminho);
  }
});

Deno.test("segredo seguido de quebra de linha é carregado sem reescrever o arquivo", () => {
  const caminho = criarCaminhoSegredoTemporario();
  try {
    const segredo = "0123456789abcdef".repeat(8);
    Deno.writeTextFileSync(caminho, `${segredo}\n`);
    const resultado = carregarOuGerarSegredoJwt(caminho);
    assertEquals(resultado.situacao, "carregado");
    assertEquals(resultado.segredo, segredo);
    assertEquals(Deno.readTextFileSync(caminho), `${segredo}\n`);
  } finally {
    removerSegredoTemporario(caminho);
  }
});

Deno.test("segredo em maiúsculas é carregado e retornado em minúsculas", () => {
  const caminho = criarCaminhoSegredoTemporario();
  try {
    const segredo = "0123456789abcdef".repeat(8);
    Deno.writeTextFileSync(caminho, segredo.toUpperCase());
    const resultado = carregarOuGerarSegredoJwt(caminho);
    assertEquals(resultado.situacao, "carregado");
    assertEquals(resultado.segredo, segredo);
  } finally {
    removerSegredoTemporario(caminho);
  }
});

const CONTEUDOS_INVALIDOS: [string, string][] = [
  ["vazio", ""],
  ["curto", "abc"],
  ["127 caracteres", "a".repeat(127)],
  ["caractere g", `${"a".repeat(127)}g`],
  ["130 caracteres", "a".repeat(130)],
];

for (const [descricao, conteudo] of CONTEUDOS_INVALIDOS) {
  Deno.test(`conteúdo inválido (${descricao}) é substituído`, () => {
    const caminho = criarCaminhoSegredoTemporario();
    try {
      Deno.writeTextFileSync(caminho, conteudo);
      const resultado = carregarOuGerarSegredoJwt(caminho);
      assertEquals(resultado.situacao, "substituido");
      assert(PADRAO_SEGREDO.test(resultado.segredo));
      assertEquals(Deno.readTextFileSync(caminho), resultado.segredo);
      assertEquals(existe(`${caminho}.tmp`), false);
    } finally {
      removerSegredoTemporario(caminho);
    }
  });
}

Deno.test("pasta inexistente dentro de dados é criada automaticamente", () => {
  const pasta = criarCaminhoSegredoTemporario().replace(/\.txt$/, "-pasta");
  const caminho = `${pasta}/segredo.txt`;
  try {
    const resultado = carregarOuGerarSegredoJwt(caminho);
    assertEquals(resultado.situacao, "gerado");
    assert(existe(caminho));
  } finally {
    Deno.removeSync(pasta, { recursive: true });
  }
});

Deno.test("caminho dentro de um arquivo lança erro sem expor segredo", () => {
  const arquivo = criarCaminhoSegredoTemporario();
  Deno.writeTextFileSync(arquivo, "bloqueio");
  try {
    const erro = assertThrows(() =>
      carregarOuGerarSegredoJwt(`${arquivo}/segredo.txt`)
    );
    assert(erro instanceof Error);
    assertEquals(/[0-9a-fA-F]{128}/.test(erro.message), false);
  } finally {
    removerSegredoTemporario(arquivo);
  }
});

Deno.test("dois segredos gerados em caminhos diferentes são diferentes", () => {
  const caminhoA = criarCaminhoSegredoTemporario();
  const caminhoB = criarCaminhoSegredoTemporario();
  try {
    const a = carregarOuGerarSegredoJwt(caminhoA);
    const b = carregarOuGerarSegredoJwt(caminhoB);
    assertNotEquals(a.segredo, b.segredo);
  } finally {
    removerSegredoTemporario(caminhoA);
    removerSegredoTemporario(caminhoB);
  }
});
