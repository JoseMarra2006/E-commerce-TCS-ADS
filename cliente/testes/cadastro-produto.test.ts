import { describe, expect, it } from "vitest";
import { criarClienteHttp } from "../src/api/cliente-http.ts";
import { criarOperacoes } from "../src/api/operacoes.ts";
import type { Operacoes, ResultadoOperacao } from "../src/api/operacoes.ts";
import {
  AVISO_PRODUTO_CRIADO,
  criarEstadoAvisoProduto,
  lerAvisoProduto,
} from "../src/paginas/aviso-produto.ts";
import {
  APOIO_TENTAR_NOVAMENTE,
  criarEstadoCadastroProduto,
  enviarCadastroProduto,
  errosVisiveis,
  interpretarFalhaCadastro,
  MENSAGEM_DADOS_RECUSADOS,
  MENSAGEM_SOMENTE_ADM_CADASTRA,
  reduzirCadastroProduto,
  resumoVisivel,
} from "../src/paginas/cadastro-produto.ts";
import type { EstadoCadastroProduto } from "../src/paginas/cadastro-produto.ts";
import { CAMINHO_NOVO_PRODUTO } from "../src/paginas/caminhos-produtos.ts";
import { decidirDestinoDetalheProduto } from "../src/paginas/detalhe-produto.ts";
import { interpretarIdRota } from "../src/paginas/id-rota.ts";
import type { DadosProduto, RespostaProduto } from "../src/tipos/protocolo.ts";
import {
  MENSAGEM_NOME_PRODUTO_VAZIO,
  MENSAGEM_QUANTIDADE_FORMATO,
  MENSAGEM_QUANTIDADE_VAZIA,
  validarFormularioProduto,
} from "../src/validacao/validacao-produto.ts";
import { criarIntermediarioFalso, respostaJson } from "./auxiliares-api.ts";

type Falha = Extract<ResultadoOperacao<RespostaProduto>, { ok: false }>;

const produtoCriado: RespostaProduto = {
  id: 10,
  nome: "Ingresso pista",
  descricao: "",
  quantidade: 7,
};
const valoresValidos = { nome: "  Ingresso pista ", descricao: "   ", quantidade: " 007 " };

function falha(tipo: Falha["tipo"], status: number | null, mensagem: string): Falha {
  return { ok: false, tipo, status, mensagem };
}

function criarDependencias(resposta: () => Promise<ResultadoOperacao<RespostaProduto>>) {
  const chamadas: Array<{ token: string; dados: DadosProduto }> = [];
  const criarProduto: Operacoes["criarProduto"] = (token, dados) => {
    chamadas.push({ token, dados });
    return resposta();
  };
  let inicios = 0;
  return {
    chamadas,
    inicios: () => inicios,
    dependencias: {
      criarProduto,
      token: "jwt-adm",
      trava: { current: false },
      aoIniciar: () => {
        inicios += 1;
      },
    },
  };
}

describe("aviso-produto", () => {
  it("o código criado gera o texto fixo", () => {
    expect(criarEstadoAvisoProduto("criado")).toEqual({ avisoProduto: "criado" });
    expect(lerAvisoProduto(criarEstadoAvisoProduto("criado"))).toBe(AVISO_PRODUTO_CRIADO);
    expect(AVISO_PRODUTO_CRIADO).toBe("Produto cadastrado com sucesso.");
  });

  it("código desconhecido, ausente ou de tipo errado não gera nada", () => {
    const invalidos: unknown[] = [
      null,
      undefined,
      "criado",
      [],
      {},
      { avisoProduto: null },
      { avisoProduto: 1 },
      { avisoProduto: "Criado" },
      { avisoProduto: "removido" },
      { avisoProduto: "<img src=x>" },
      { avisoProduto: "__proto__" },
      { avisoProduto: "toString" },
      { avisoUsuario: "atualizado" },
    ];
    for (const estado of invalidos) {
      expect(lerAvisoProduto(estado)).toBeNull();
    }
  });
});

describe("dados do produto vindos da validação", () => {
  it("nome e descrição aparados, descrição vazia presente e quantidade numérica", () => {
    expect(validarFormularioProduto(valoresValidos)).toEqual({
      ok: true,
      dados: { nome: "Ingresso pista", descricao: "", quantidade: 7 },
    });
  });

  it("0 e 1000000 são aceitos como número", () => {
    for (const [texto, numero] of [["0", 0], ["1000000", 1000000]] as const) {
      const resultado = validarFormularioProduto({ ...valoresValidos, quantidade: texto });
      expect(resultado.ok && resultado.dados.quantidade).toBe(numero);
      expect(resultado.ok && typeof resultado.dados.quantidade).toBe("number");
    }
  });
});

describe("caminho de cadastro", () => {
  it("é fixo e o segmento novo nunca é um id", () => {
    expect(CAMINHO_NOVO_PRODUTO).toBe("/produtos/novo");
    expect(interpretarIdRota("novo")).toBeNull();
    expect(decidirDestinoDetalheProduto("novo")).toEqual({ tipo: "invalido" });
  });
});

describe("reduzirCadastroProduto e erros visíveis", () => {
  const inicial = criarEstadoCadastroProduto();

  it("começa vazio, editando e sem erros visíveis", () => {
    expect(inicial.valores).toEqual({ nome: "", descricao: "", quantidade: "" });
    expect(inicial.fase).toBe("editando");
    expect(errosVisiveis(inicial)).toEqual({});
    expect(resumoVisivel(inicial)).toBe(false);
  });

  it("o erro de um campo só aparece depois de sair dele", () => {
    const tocado = reduzirCadastroProduto(inicial, { tipo: "sair_do_campo", campo: "nome" });
    expect(errosVisiveis(tocado)).toEqual({ nome: MENSAGEM_NOME_PRODUTO_VAZIO });
    expect(reduzirCadastroProduto(tocado, { tipo: "sair_do_campo", campo: "nome" })).toBe(tocado);
  });

  it("depois da tentativa de envio, todos os erros aparecem e atualizam ao digitar", () => {
    const tentou = reduzirCadastroProduto(inicial, { tipo: "envio_invalido" });
    expect(errosVisiveis(tentou)).toEqual({
      nome: MENSAGEM_NOME_PRODUTO_VAZIO,
      quantidade: MENSAGEM_QUANTIDADE_VAZIA,
    });
    expect(resumoVisivel(tentou)).toBe(true);
    const digitou = reduzirCadastroProduto(tentou, { tipo: "alterar", campo: "quantidade", valor: "1,5" });
    expect(errosVisiveis(digitou).quantidade).toBe(MENSAGEM_QUANTIDADE_FORMATO);
    let corrigido: EstadoCadastroProduto = digitou;
    corrigido = reduzirCadastroProduto(corrigido, { tipo: "alterar", campo: "nome", valor: "Pista" });
    corrigido = reduzirCadastroProduto(corrigido, { tipo: "alterar", campo: "quantidade", valor: "5" });
    expect(errosVisiveis(corrigido)).toEqual({});
    expect(resumoVisivel(corrigido)).toBe(false);
  });

  it("enviando bloqueia alterações e um segundo início; falha volta a editar com os valores", () => {
    const comValores = reduzirCadastroProduto(inicial, { tipo: "alterar", campo: "nome", valor: "Pista" });
    const enviando = reduzirCadastroProduto(comValores, { tipo: "iniciar_envio" });
    expect(enviando.fase).toBe("enviando");
    expect(reduzirCadastroProduto(enviando, { tipo: "iniciar_envio" })).toBe(enviando);
    expect(reduzirCadastroProduto(enviando, { tipo: "alterar", campo: "nome", valor: "x" })).toBe(
      enviando,
    );
    const falhou = reduzirCadastroProduto(enviando, {
      tipo: "falha_envio",
      falha: { mensagem: "Erro interno no servidor.", apoio: APOIO_TENTAR_NOVAMENTE },
    });
    expect(falhou).toMatchObject({
      fase: "editando",
      valores: { nome: "Pista" },
      erroServidor: { mensagem: "Erro interno no servidor.", apoio: APOIO_TENTAR_NOVAMENTE },
    });
    const reenvio = reduzirCadastroProduto(falhou, { tipo: "iniciar_envio" });
    expect(reenvio).toMatchObject({ fase: "enviando", erroServidor: null });
    expect(reduzirCadastroProduto(enviando, { tipo: "fim_envio" }).fase).toBe("editando");
  });
});

describe("interpretarFalhaCadastro", () => {
  it("400 usa a mensagem do servidor ou o texto fixo", () => {
    expect(interpretarFalhaCadastro(falha("http", 400, "O campo nome deve ter entre 2 e 100 caracteres.")))
      .toEqual({ mensagem: "O campo nome deve ter entre 2 e 100 caracteres.", apoio: null });
    expect(interpretarFalhaCadastro(falha("http", 400, "Os dados enviados foram recusados pelo servidor.")))
      .toEqual({ mensagem: MENSAGEM_DADOS_RECUSADOS, apoio: null });
  });

  it("entrada_invalida usa o texto fixo", () => {
    expect(interpretarFalhaCadastro(falha("entrada_invalida", null, "O identificador informado é inválido.")))
      .toEqual({ mensagem: MENSAGEM_DADOS_RECUSADOS, apoio: null });
  });

  it("403 usa a mensagem do servidor ou o texto fixo", () => {
    expect(interpretarFalhaCadastro(falha("http", 403, "Apenas administradores podem cadastrar produtos.")))
      .toEqual({ mensagem: MENSAGEM_SOMENTE_ADM_CADASTRA, apoio: null });
    expect(interpretarFalhaCadastro(falha("http", 403, "Você não tem permissão para realizar esta operação.")))
      .toEqual({ mensagem: MENSAGEM_SOMENTE_ADM_CADASTRA, apoio: null });
    expect(interpretarFalhaCadastro(falha("http", 403, "Sessão sem privilégio.")))
      .toEqual({ mensagem: "Sessão sem privilégio.", apoio: null });
  });

  it("rede, tempo esgotado, 500 e fora do protocolo levam texto de apoio", () => {
    for (
      const f of [
        falha("rede", null, "Não foi possível conectar ao servidor."),
        falha("rede", null, "O servidor não respondeu a tempo. Verifique a conexão e tente novamente."),
        falha("http", 500, "Erro interno no servidor."),
        falha("fora_protocolo", 201, "Resposta do servidor fora do protocolo."),
        falha("intermediario", null, "O intermediário do cliente não está em execução."),
      ]
    ) {
      expect(interpretarFalhaCadastro(f)).toEqual({ mensagem: f.mensagem, apoio: APOIO_TENTAR_NOVAMENTE });
    }
  });

  it("401 não gera alerta", () => {
    expect(interpretarFalhaCadastro(falha("http", 401, "Não autorizado."))).toBeNull();
  });

  it("409 não tem tratamento especial", () => {
    expect(interpretarFalhaCadastro(falha("http", 409, "Conflito."))).toEqual({
      mensagem: "Conflito.",
      apoio: APOIO_TENTAR_NOVAMENTE,
    });
  });
});

describe("enviarCadastroProduto", () => {
  it("envio válido chama criarProduto uma vez com token e dados corretos", async () => {
    const { chamadas, dependencias, inicios } = criarDependencias(() =>
      Promise.resolve({ ok: true, dados: produtoCriado })
    );
    const resultado = await enviarCadastroProduto(dependencias, valoresValidos);
    expect(resultado).toEqual({ tipo: "criado", produto: produtoCriado });
    expect(chamadas).toEqual([
      { token: "jwt-adm", dados: { nome: "Ingresso pista", descricao: "", quantidade: 7 } },
    ]);
    expect(inicios()).toBe(1);
    expect(dependencias.trava.current).toBe(false);
  });

  it("envio inválido não chama", async () => {
    const { chamadas, dependencias, inicios } = criarDependencias(() =>
      Promise.resolve({ ok: true, dados: produtoCriado })
    );
    const resultado = await enviarCadastroProduto(dependencias, {
      nome: "",
      descricao: "",
      quantidade: "-1",
    });
    expect(resultado).toEqual({
      tipo: "invalido",
      erros: { nome: MENSAGEM_NOME_PRODUTO_VAZIO, quantidade: MENSAGEM_QUANTIDADE_FORMATO },
    });
    expect(chamadas).toEqual([]);
    expect(inicios()).toBe(0);
  });

  it("duplo envio simultâneo chama uma única vez", async () => {
    let liberar: (valor: ResultadoOperacao<RespostaProduto>) => void = () => {};
    const { chamadas, dependencias } = criarDependencias(() =>
      new Promise((resolver) => {
        liberar = resolver;
      })
    );
    const primeiro = enviarCadastroProduto(dependencias, valoresValidos);
    const segundo = enviarCadastroProduto(dependencias, valoresValidos);
    const terceiro = enviarCadastroProduto(dependencias, valoresValidos);
    expect(await segundo).toEqual({ tipo: "ignorado" });
    expect(await terceiro).toEqual({ tipo: "ignorado" });
    liberar({ ok: true, dados: produtoCriado });
    expect(await primeiro).toEqual({ tipo: "criado", produto: produtoCriado });
    expect(chamadas).toHaveLength(1);
    expect(dependencias.trava.current).toBe(false);
  });

  it("cada erro vira a mensagem certa e a trava é liberada para reenviar", async () => {
    const casos: Array<[Falha, string, string | null]> = [
      [falha("http", 400, "O campo quantidade deve ser um número inteiro."), "O campo quantidade deve ser um número inteiro.", null],
      [falha("http", 403, "Apenas administradores podem cadastrar produtos."), MENSAGEM_SOMENTE_ADM_CADASTRA, null],
      [falha("http", 500, "Erro interno no servidor."), "Erro interno no servidor.", APOIO_TENTAR_NOVAMENTE],
      [falha("rede", null, "Sem rede."), "Sem rede.", APOIO_TENTAR_NOVAMENTE],
      [falha("rede", null, "O servidor não respondeu a tempo."), "O servidor não respondeu a tempo.", APOIO_TENTAR_NOVAMENTE],
      [falha("fora_protocolo", 201, "Resposta do servidor fora do protocolo."), "Resposta do servidor fora do protocolo.", APOIO_TENTAR_NOVAMENTE],
      [falha("entrada_invalida", null, "O identificador informado é inválido."), MENSAGEM_DADOS_RECUSADOS, null],
    ];
    for (const [f, mensagem, apoio] of casos) {
      const { chamadas, dependencias } = criarDependencias(() => Promise.resolve(f));
      expect(await enviarCadastroProduto(dependencias, valoresValidos)).toEqual({
        tipo: "falha",
        falha: { mensagem, apoio },
      });
      expect(dependencias.trava.current).toBe(false);
      await enviarCadastroProduto(dependencias, valoresValidos);
      expect(chamadas).toHaveLength(2);
    }
  });

  it("401 vira não autorizado, sem alerta", async () => {
    const { dependencias } = criarDependencias(() =>
      Promise.resolve(falha("http", 401, "Não autorizado. Faça login novamente."))
    );
    expect(await enviarCadastroProduto(dependencias, valoresValidos)).toEqual({
      tipo: "nao_autorizado",
    });
  });

  it("o Location da resposta 201 é ignorado", async () => {
    const corpo = JSON.stringify(produtoCriado);
    const resultadoCom = async (cabecalhos: Record<string, string>) => {
      const falso = criarIntermediarioFalso(() =>
        respostaJson({
          tipo: "resposta",
          url: "http://10.20.50.123:20000/api/v1/products",
          status: 201,
          cabecalhos,
          corpo,
          duracaoMs: 2,
        })
      );
      const operacoes = criarOperacoes(
        criarClienteHttp({
          obterConexao: () => ({ ip: "10.20.50.123", porta: 20000 }),
          buscar: falso.buscar,
        }),
      );
      return enviarCadastroProduto(
        { criarProduto: operacoes.criarProduto, token: "jwt-adm", trava: { current: false } },
        valoresValidos,
      );
    };
    const semLocation = await resultadoCom({ "content-type": "application/json" });
    const comLocation = await resultadoCom({
      "content-type": "application/json",
      location: "/api/v1/products/999",
    });
    expect(comLocation).toEqual(semLocation);
    expect(comLocation).toEqual({ tipo: "criado", produto: produtoCriado });
  });
});
