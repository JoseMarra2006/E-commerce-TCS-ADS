import { describe, expect, it } from "vitest";
import type { ResultadoOperacao } from "../src/api/operacoes.ts";
import { CAMINHO_LISTA_PRODUTOS, caminhoDetalheProduto } from "../src/paginas/caminhos-produtos.ts";
import {
  criarEstadoDetalheProduto,
  decidirDestinoDetalheProduto,
  EXPLICACAO_PRODUTO_NAO_ENCONTRADO,
  MENSAGEM_FORA_PROTOCOLO_PRODUTO,
  montarItensDetalheProduto,
  reduzirDetalheProduto,
  textoSituacaoDetalheProduto,
} from "../src/paginas/detalhe-produto.ts";
import { interpretarIdRota as interpretarIdRotaUsuario } from "../src/paginas/detalhe-usuario.ts";
import {
  formatarQuantidade,
  resumirDescricao,
  rotuloEstoque,
  TEXTO_SEM_DESCRICAO,
} from "../src/paginas/formatacao-produto.ts";
import { interpretarIdRota } from "../src/paginas/id-rota.ts";
import {
  ESTADO_INICIAL_LISTA_PRODUTOS,
  montarLinhasProdutos,
  reduzirListaProdutos,
  textoContadorProdutos,
} from "../src/paginas/lista-produtos.ts";
import type { EstadoListaProdutos } from "../src/paginas/lista-produtos.ts";
import type { RespostaProduto } from "../src/tipos/protocolo.ts";

const EMOJI = "\u{1F3AB}";
const PADRAO_404 = "Recurso não encontrado no servidor.";
const ingresso: RespostaProduto = {
  id: 3,
  nome: "Ingresso pista",
  descricao: "Show de sábado",
  quantidade: 12345,
};
const esgotado: RespostaProduto = { id: 8, nome: "Camarote", descricao: "", quantidade: 0 };

type Falha = Extract<ResultadoOperacao<RespostaProduto>, { ok: false }>;

function falha(tipo: Falha["tipo"], status: number | null, mensagem: string): Falha {
  return { ok: false, tipo, status, mensagem };
}

describe("formatarQuantidade e rotuloEstoque", () => {
  it("usa ponto como separador de milhar, sem notação científica", () => {
    const casos: Array<[number, string]> = [
      [0, "0"],
      [1, "1"],
      [999, "999"],
      [1000, "1.000"],
      [12345, "12.345"],
      [1000000, "1.000.000"],
    ];
    for (const [numero, texto] of casos) {
      expect(formatarQuantidade(numero)).toBe(texto);
    }
  });

  it("valores fora do protocolo viram texto vazio", () => {
    for (const numero of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(formatarQuantidade(numero)).toBe("");
    }
  });

  it("Esgotado só para zero", () => {
    expect(rotuloEstoque(0)).toBe("Esgotado");
    for (const numero of [1, 10, 1000000]) {
      expect(rotuloEstoque(numero)).toBe("");
    }
  });
});

describe("resumirDescricao", () => {
  it("vazia ou só espaços vira Sem descrição", () => {
    for (const texto of ["", "   ", "\n\n"]) {
      expect(resumirDescricao(texto)).toBe(TEXTO_SEM_DESCRICAO);
    }
  });

  it("abaixo e no limite não corta nem acrescenta reticências", () => {
    expect(resumirDescricao("curta")).toBe("curta");
    expect(resumirDescricao("a".repeat(80))).toBe("a".repeat(80));
  });

  it("acima do limite corta por pontos de código e acrescenta reticências", () => {
    expect(resumirDescricao("a".repeat(81))).toBe(`${"a".repeat(80)}…`);
    expect(resumirDescricao("abcdef", 3)).toBe("abc…");
  });

  it("nunca corta no meio de um emoji", () => {
    const texto = EMOJI.repeat(90);
    const resumo = resumirDescricao(texto);
    expect(Array.from(resumo)).toHaveLength(81);
    expect(resumo).toBe(`${EMOJI.repeat(80)}…`);
    expect(resumirDescricao(`ab${EMOJI}cd`, 3)).toBe(`ab${EMOJI}…`);
    expect(resumirDescricao(EMOJI.repeat(80))).toBe(EMOJI.repeat(80));
  });

  it("troca quebras de linha por espaço", () => {
    expect(resumirDescricao("Linha 1\nLinha 2\r\nLinha 3")).toBe("Linha 1 Linha 2 Linha 3");
  });
});

describe("montarLinhasProdutos", () => {
  it("preserva a ordem e formata a quantidade", () => {
    const linhas = montarLinhasProdutos([esgotado, ingresso]);
    expect(linhas.map((linha) => linha.id)).toEqual([8, 3]);
    expect(linhas.map((linha) => linha.quantidade)).toEqual(["0", "12.345"]);
  });

  it("esgotado só quando a quantidade é zero", () => {
    const linhas = montarLinhasProdutos([esgotado, ingresso, { ...ingresso, id: 4, quantidade: 1 }]);
    expect(linhas.map((linha) => linha.esgotado)).toEqual([true, false, false]);
  });

  it("descrição vazia é marcada e resumida como Sem descrição", () => {
    const [vazia, cheia] = montarLinhasProdutos([esgotado, ingresso]);
    expect(vazia).toMatchObject({ semDescricao: true, resumoDescricao: TEXTO_SEM_DESCRICAO });
    expect(cheia).toMatchObject({ semDescricao: false, resumoDescricao: "Show de sábado" });
  });

  it("caminho do detalhe só com o id numérico e textos hostis permanecem texto", () => {
    const hostil = {
      ...ingresso,
      nome: "<img src=x onerror=alert(1)>",
      descricao: "<script>x</script>\n../../usuarios",
    };
    const [linha] = montarLinhasProdutos([hostil]);
    expect(linha?.caminhoDetalhe).toBe("/produtos/3");
    expect(linha?.nome).toBe("<img src=x onerror=alert(1)>");
    expect(linha?.resumoDescricao).toBe("<script>x</script> ../../usuarios");
  });
});

describe("textoContadorProdutos", () => {
  it("zero, singular e plural", () => {
    expect(textoContadorProdutos(0)).toBe("Nenhum produto cadastrado");
    expect(textoContadorProdutos(1)).toBe("1 produto cadastrado");
    expect(textoContadorProdutos(2)).toBe("2 produtos cadastrados");
    expect(textoContadorProdutos(1500)).toBe("1500 produtos cadastrados");
  });
});

describe("reduzirListaProdutos", () => {
  const sucesso: EstadoListaProdutos = { fase: "sucesso", produtos: [ingresso] };
  const erro: EstadoListaProdutos = { fase: "erro", mensagem: "Falhou." };

  it("começa carregando e recebe dados de qualquer fase", () => {
    expect(ESTADO_INICIAL_LISTA_PRODUTOS).toEqual({ fase: "carregando" });
    for (const estado of [ESTADO_INICIAL_LISTA_PRODUTOS, sucesso, erro]) {
      expect(reduzirListaProdutos(estado, { tipo: "recebido", produtos: [esgotado] })).toEqual({
        fase: "sucesso",
        produtos: [esgotado],
      });
    }
  });

  it("recarregar no sucesso mantém os dados; falha vira erro", () => {
    const recarregando = reduzirListaProdutos(sucesso, { tipo: "recarregar" });
    expect(recarregando).toEqual({ fase: "recarregando", produtos: [ingresso] });
    expect(reduzirListaProdutos(recarregando, { tipo: "recarregar" })).toEqual(recarregando);
    expect(reduzirListaProdutos(recarregando, { tipo: "falhou", mensagem: "Sem rede." })).toEqual({
      fase: "erro",
      mensagem: "Sem rede.",
    });
  });

  it("erro seguido de nova tentativa volta a carregar", () => {
    expect(reduzirListaProdutos(erro, { tipo: "recarregar" })).toEqual({ fase: "carregando" });
    expect(reduzirListaProdutos(ESTADO_INICIAL_LISTA_PRODUTOS, { tipo: "recarregar" })).toEqual({
      fase: "carregando",
    });
  });
});

describe("id da rota de produto", () => {
  it("é a mesma função usada no detalhe de usuário", () => {
    expect(interpretarIdRotaUsuario).toBe(interpretarIdRota);
  });

  it("destino: inválido sem requisição ou carregar", () => {
    for (const parametro of ["abc", "0", "1.5", "-1", "", undefined, "٣"]) {
      expect(decidirDestinoDetalheProduto(parametro), String(parametro)).toEqual({ tipo: "invalido" });
    }
    expect(decidirDestinoDetalheProduto("7")).toEqual({ tipo: "carregar", id: 7 });
    expect(decidirDestinoDetalheProduto("007")).toEqual({ tipo: "carregar", id: 7 });
  });
});

describe("reduzirDetalheProduto", () => {
  const carregando = criarEstadoDetalheProduto(3);

  it("carregando para sucesso", () => {
    expect(carregando).toEqual({ fase: "carregando", id: 3 });
    expect(reduzirDetalheProduto(carregando, { tipo: "recebido", id: 3, produto: ingresso })).toEqual({
      fase: "sucesso",
      id: 3,
      produto: ingresso,
    });
  });

  it("404 com mensagem do servidor ou texto de apoio", () => {
    expect(
      reduzirDetalheProduto(carregando, {
        tipo: "falhou",
        id: 3,
        falha: falha("http", 404, "Produto não encontrado."),
        mensagemPadrao404: PADRAO_404,
      }),
    ).toEqual({ fase: "nao_encontrado", id: 3, explicacao: "Produto não encontrado." });
    expect(
      reduzirDetalheProduto(carregando, {
        tipo: "falhou",
        id: 3,
        falha: falha("http", 404, PADRAO_404),
        mensagemPadrao404: PADRAO_404,
      }),
    ).toEqual({ fase: "nao_encontrado", id: 3, explicacao: EXPLICACAO_PRODUTO_NAO_ENCONTRADO });
  });

  it("outros erros viram erro e permitem tentar de novo", () => {
    const falhas = [
      falha("http", 403, "Sem permissão."),
      falha("http", 500, "Erro interno no servidor."),
      falha("rede", null, "Sem rede."),
      falha("rede", null, "O servidor não respondeu a tempo."),
      falha("fora_protocolo", 200, MENSAGEM_FORA_PROTOCOLO_PRODUTO),
      falha("entrada_invalida", null, "O identificador informado é inválido."),
    ];
    for (const f of falhas) {
      const erro = reduzirDetalheProduto(carregando, {
        tipo: "falhou",
        id: 3,
        falha: f,
        mensagemPadrao404: PADRAO_404,
      });
      expect(erro).toEqual({ fase: "erro", id: 3, mensagem: f.mensagem });
      expect(reduzirDetalheProduto(erro, { tipo: "iniciar", id: 3 })).toEqual(carregando);
    }
  });

  it("ação de outro id é ignorada e resposta com id diferente é fora do protocolo", () => {
    const outro = reduzirDetalheProduto(carregando, { tipo: "iniciar", id: 4 });
    expect(reduzirDetalheProduto(outro, { tipo: "recebido", id: 3, produto: ingresso })).toBe(outro);
    expect(
      reduzirDetalheProduto(outro, {
        tipo: "falhou",
        id: 3,
        falha: falha("http", 404, PADRAO_404),
        mensagemPadrao404: PADRAO_404,
      }),
    ).toBe(outro);
    expect(
      reduzirDetalheProduto(carregando, { tipo: "recebido", id: 3, produto: { ...ingresso, id: 9 } }),
    ).toEqual({ fase: "erro", id: 3, mensagem: MENSAGEM_FORA_PROTOCOLO_PRODUTO });
  });

  it("texto de situação", () => {
    expect(textoSituacaoDetalheProduto(carregando)).toBe("Carregando dados do produto...");
    expect(textoSituacaoDetalheProduto({ fase: "sucesso", id: 3, produto: ingresso })).toBe(
      "Dados do produto carregados.",
    );
    expect(textoSituacaoDetalheProduto({ fase: "erro", id: 3, mensagem: "x" })).toBe("");
  });
});

describe("montarItensDetalheProduto", () => {
  it("rótulos e valores, com descrição completa e quantidade formatada", () => {
    const comQuebra = { ...ingresso, descricao: "Linha 1\nLinha 2", quantidade: 1000000 };
    expect(montarItensDetalheProduto(comQuebra)).toEqual([
      { rotulo: "Identificador", valor: "3", multilinha: false, vazio: false, esgotado: false },
      { rotulo: "Nome", valor: "Ingresso pista", multilinha: false, vazio: false, esgotado: false },
      { rotulo: "Descrição", valor: "Linha 1\nLinha 2", multilinha: true, vazio: false, esgotado: false },
      { rotulo: "Quantidade", valor: "1.000.000", multilinha: false, vazio: false, esgotado: false },
    ]);
  });

  it("descrição vazia e esgotado", () => {
    const itens = montarItensDetalheProduto(esgotado);
    expect(itens[2]).toEqual({
      rotulo: "Descrição",
      valor: TEXTO_SEM_DESCRICAO,
      multilinha: false,
      vazio: true,
      esgotado: false,
    });
    expect(itens[3]).toMatchObject({ valor: "0", esgotado: true });
  });

  it("nenhum campo extra e HTML literal", () => {
    const hostil = { ...ingresso, nome: "<img src=x>", preco: 99, senha: "segredo" };
    const itens = montarItensDetalheProduto(hostil);
    expect(itens.map((item) => item.rotulo)).toEqual(["Identificador", "Nome", "Descrição", "Quantidade"]);
    expect(itens[1]?.valor).toBe("<img src=x>");
    expect(JSON.stringify(itens)).not.toContain("segredo");
    expect(JSON.stringify(itens)).not.toContain("99");
  });
});

describe("caminhos de produtos", () => {
  it("lista e detalhe só com o id numérico", () => {
    expect(CAMINHO_LISTA_PRODUTOS).toBe("/produtos");
    expect(caminhoDetalheProduto(3)).toBe("/produtos/3");
    expect(caminhoDetalheProduto(9007199254740991)).toBe("/produtos/9007199254740991");
  });
});
