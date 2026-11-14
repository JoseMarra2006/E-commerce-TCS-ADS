import { describe, expect, it } from "vitest";
import {
  contarCaracteres,
  DESCRICAO_PRODUTO_MAXIMA,
  MENSAGEM_DESCRICAO_PRODUTO_TAMANHO,
  MENSAGEM_NOME_PRODUTO_TAMANHO,
  MENSAGEM_NOME_PRODUTO_VAZIO,
  MENSAGEM_QUANTIDADE_FAIXA,
  MENSAGEM_QUANTIDADE_FORMATO,
  MENSAGEM_QUANTIDADE_VAZIA,
  NOME_PRODUTO_MAXIMO,
  NOME_PRODUTO_MINIMO,
  primeiroCampoInvalido,
  QUANTIDADE_PRODUTO_MAXIMA,
  quantidadeParaTexto,
  validarDescricaoProduto,
  validarFormularioProduto,
  validarNomeProduto,
  validarQuantidadeProduto,
} from "../src/validacao/validacao-produto.ts";
import type { CampoProduto, ErrosProduto } from "../src/validacao/validacao-produto.ts";

const EMOJI = "\u{1F3AB}";

describe("constantes", () => {
  it("espelham os limites do protocolo", () => {
    expect(NOME_PRODUTO_MINIMO).toBe(2);
    expect(NOME_PRODUTO_MAXIMO).toBe(100);
    expect(DESCRICAO_PRODUTO_MAXIMA).toBe(500);
    expect(QUANTIDADE_PRODUTO_MAXIMA).toBe(1000000);
  });
});

describe("contarCaracteres", () => {
  it("conta pontos de código", () => {
    expect(contarCaracteres("")).toBe(0);
    expect(contarCaracteres("abc")).toBe(3);
    expect(contarCaracteres("ação")).toBe(4);
    expect(contarCaracteres(EMOJI)).toBe(1);
    expect(EMOJI.length).toBe(2);
    expect(contarCaracteres(`a${EMOJI}b`)).toBe(3);
    expect(contarCaracteres("𝄞")).toBe(1);
  });
});

describe("validarNomeProduto", () => {
  const casos: Array<[string, string, { ok: true; valor: string } | { ok: false; mensagem: string }]> = [
    ["vazio", "", { ok: false, mensagem: MENSAGEM_NOME_PRODUTO_VAZIO }],
    ["só espaços", "   ", { ok: false, mensagem: MENSAGEM_NOME_PRODUTO_VAZIO }],
    ["espaços e tabulação", " \t\n ", { ok: false, mensagem: MENSAGEM_NOME_PRODUTO_VAZIO }],
    ["1 caractere", "a", { ok: false, mensagem: MENSAGEM_NOME_PRODUTO_TAMANHO }],
    ["1 caractere com espaços", "  a  ", { ok: false, mensagem: MENSAGEM_NOME_PRODUTO_TAMANHO }],
    ["2 caracteres", "ab", { ok: true, valor: "ab" }],
    ["100 caracteres", "a".repeat(100), { ok: true, valor: "a".repeat(100) }],
    ["101 caracteres", "a".repeat(101), { ok: false, mensagem: MENSAGEM_NOME_PRODUTO_TAMANHO }],
    ["aparado", "  Ingresso pista  ", { ok: true, valor: "Ingresso pista" }],
    ["espaços internos preservados", "Ingresso   VIP", { ok: true, valor: "Ingresso   VIP" }],
    ["acentos", "Pão de açúcar", { ok: true, valor: "Pão de açúcar" }],
    ["100 emojis", EMOJI.repeat(100), { ok: true, valor: EMOJI.repeat(100) }],
    ["101 emojis", EMOJI.repeat(101), { ok: false, mensagem: MENSAGEM_NOME_PRODUTO_TAMANHO }],
    ["quebra de linha interna", "Linha\num", { ok: true, valor: "Linha\num" }],
    ["espaço não separável conta como espaço", "  ", {
      ok: false,
      mensagem: MENSAGEM_NOME_PRODUTO_VAZIO,
    }],
    ["caractere de largura zero não é removido", "​​", {
      ok: true,
      valor: "​​",
    }],
    ["HTML fica literal", "<b>x</b>", { ok: true, valor: "<b>x</b>" }],
  ];

  for (const [descricao, entrada, esperado] of casos) {
    it(descricao, () => {
      expect(validarNomeProduto(entrada)).toEqual(esperado);
    });
  }
});

describe("validarDescricaoProduto", () => {
  const casos: Array<[string, string, { ok: true; valor: string } | { ok: false; mensagem: string }]> = [
    ["vazia é válida", "", { ok: true, valor: "" }],
    ["só espaços vira vazia", "   ", { ok: true, valor: "" }],
    ["1 caractere", "a", { ok: true, valor: "a" }],
    ["500 caracteres", "d".repeat(500), { ok: true, valor: "d".repeat(500) }],
    ["501 caracteres", "d".repeat(501), { ok: false, mensagem: MENSAGEM_DESCRICAO_PRODUTO_TAMANHO }],
    ["500 caracteres com espaços nas pontas", `  ${"d".repeat(500)}  `, {
      ok: true,
      valor: "d".repeat(500),
    }],
    ["aparada", "  Show de sábado  ", { ok: true, valor: "Show de sábado" }],
    ["500 emojis", EMOJI.repeat(500), { ok: true, valor: EMOJI.repeat(500) }],
    ["501 emojis", EMOJI.repeat(501), { ok: false, mensagem: MENSAGEM_DESCRICAO_PRODUTO_TAMANHO }],
    ["quebra de linha interna preservada", "Linha 1\nLinha 2", {
      ok: true,
      valor: "Linha 1\nLinha 2",
    }],
  ];

  for (const [descricao, entrada, esperado] of casos) {
    it(descricao, () => {
      expect(validarDescricaoProduto(entrada)).toEqual(esperado);
    });
  }
});

describe("validarQuantidadeProduto", () => {
  const validos: Array<[string, number]> = [
    ["0", 0],
    ["1", 1],
    ["1000000", 1000000],
    ["007", 7],
    ["000", 0],
    [" 12 ", 12],
    ["00000000000000000000001", 1],
    ["0".repeat(5000), 0],
    ["0001000000", 1000000],
  ];

  for (const [entrada, esperado] of validos) {
    it(`aceita ${JSON.stringify(entrada.length > 30 ? `${entrada.slice(0, 10)}...` : entrada)}`, () => {
      const resultado = validarQuantidadeProduto(entrada);
      expect(resultado).toEqual({ ok: true, valor: esperado });
      if (resultado.ok) {
        expect(Number.isSafeInteger(resultado.valor)).toBe(true);
        expect(resultado.valor).toBeGreaterThanOrEqual(0);
        expect(resultado.valor).toBeLessThanOrEqual(1000000);
        expect(Object.is(resultado.valor, -0)).toBe(false);
      }
    });
  }

  it("vazio ou só espaços pede a quantidade", () => {
    for (const entrada of ["", "   ", "\t"]) {
      expect(validarQuantidadeProduto(entrada)).toEqual({ ok: false, mensagem: MENSAGEM_QUANTIDADE_VAZIA });
    }
  });

  it("qualquer coisa que não seja só dígitos ASCII é formato inválido", () => {
    const invalidos = [
      "-1",
      "-0",
      "+5",
      "1.5",
      "1,5",
      "1.000",
      "1e3",
      "0x10",
      "12a",
      "a12",
      "1 2",
      "１２３",
      "٣",
      "١٢",
      "Infinity",
      "NaN",
      "1_000",
      "٫5",
    ];
    for (const entrada of invalidos) {
      expect(validarQuantidadeProduto(entrada), entrada).toEqual({
        ok: false,
        mensagem: MENSAGEM_QUANTIDADE_FORMATO,
      });
    }
  });

  it("acima do máximo, inclusive textos longos e acima do inteiro seguro", () => {
    for (const entrada of ["1000001", "9999999", "10000000", "99999999999999999999", "9007199254740993", "9".repeat(5000)]) {
      expect(validarQuantidadeProduto(entrada), entrada).toEqual({
        ok: false,
        mensagem: MENSAGEM_QUANTIDADE_FAIXA,
      });
    }
  });
});

describe("validarFormularioProduto", () => {
  const valido = { nome: "  Ingresso pista ", descricao: " Show ", quantidade: " 010 " };

  it("tudo válido devolve os dados aparados e a quantidade como número", () => {
    const resultado = validarFormularioProduto(valido);
    expect(resultado).toEqual({
      ok: true,
      dados: { nome: "Ingresso pista", descricao: "Show", quantidade: 10 },
    });
    expect(resultado.ok && typeof resultado.dados.quantidade).toBe("number");
  });

  it("descrição vazia continua válida e vai como texto vazio", () => {
    expect(validarFormularioProduto({ ...valido, descricao: "  " })).toEqual({
      ok: true,
      dados: { nome: "Ingresso pista", descricao: "", quantidade: 10 },
    });
  });

  it("um campo inválido de cada vez", () => {
    expect(validarFormularioProduto({ ...valido, nome: "a" })).toEqual({
      ok: false,
      erros: { nome: MENSAGEM_NOME_PRODUTO_TAMANHO },
    });
    expect(validarFormularioProduto({ ...valido, descricao: "d".repeat(501) })).toEqual({
      ok: false,
      erros: { descricao: MENSAGEM_DESCRICAO_PRODUTO_TAMANHO },
    });
    expect(validarFormularioProduto({ ...valido, quantidade: "1.5" })).toEqual({
      ok: false,
      erros: { quantidade: MENSAGEM_QUANTIDADE_FORMATO },
    });
  });

  it("todos inválidos geram um erro por campo e nenhum dado", () => {
    const resultado = validarFormularioProduto({ nome: "", descricao: "d".repeat(501), quantidade: "" });
    expect(resultado).toEqual({
      ok: false,
      erros: {
        nome: MENSAGEM_NOME_PRODUTO_VAZIO,
        descricao: MENSAGEM_DESCRICAO_PRODUTO_TAMANHO,
        quantidade: MENSAGEM_QUANTIDADE_VAZIA,
      },
    });
    expect("dados" in resultado).toBe(false);
  });

  it("nunca devolve sucesso com algum campo inválido", () => {
    const nomes = ["", "a", "Ingresso"];
    const descricoes = ["", "d".repeat(501)];
    const quantidades = ["", "-1", "5", "1000001"];
    for (const nome of nomes) {
      for (const descricao of descricoes) {
        for (const quantidade of quantidades) {
          const resultado = validarFormularioProduto({ nome, descricao, quantidade });
          const deveriaSerValido = nome === "Ingresso" && descricao === "" && quantidade === "5";
          expect(resultado.ok).toBe(deveriaSerValido);
          if (!resultado.ok) {
            expect(Object.keys(resultado.erros).length).toBeGreaterThan(0);
          }
        }
      }
    }
  });
});

describe("primeiroCampoInvalido", () => {
  it("segue a ordem nome, descrição, quantidade em todas as combinações", () => {
    const campos: CampoProduto[] = ["nome", "descricao", "quantidade"];
    for (let mascara = 0; mascara < 8; mascara++) {
      const erros: ErrosProduto = {};
      campos.forEach((campo, indice) => {
        if ((mascara & (1 << indice)) !== 0) {
          erros[campo] = "erro";
        }
      });
      const esperado = campos.find((campo) => erros[campo] !== undefined) ?? null;
      expect(primeiroCampoInvalido(erros), String(mascara)).toBe(esperado);
    }
  });
});

describe("quantidadeParaTexto", () => {
  it("converte sem separadores nem notação científica", () => {
    expect(quantidadeParaTexto(0)).toBe("0");
    expect(quantidadeParaTexto(1)).toBe("1");
    expect(quantidadeParaTexto(12345)).toBe("12345");
    expect(quantidadeParaTexto(1000000)).toBe("1000000");
    expect(quantidadeParaTexto(Number.MAX_SAFE_INTEGER)).toBe("9007199254740991");
  });

  it("o texto gerado volta ao mesmo número pela validação", () => {
    for (const quantidade of [0, 1, 999999, 1000000]) {
      expect(validarQuantidadeProduto(quantidadeParaTexto(quantidade))).toEqual({
        ok: true,
        valor: quantidade,
      });
    }
  });

  it("valores que não são inteiros seguros não negativos viram texto vazio", () => {
    for (const quantidade of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 1e21]) {
      expect(quantidadeParaTexto(quantidade), String(quantidade)).toBe("");
    }
  });
});
