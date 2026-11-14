import { describe, expect, it } from "vitest";
import type { Operacoes, ResultadoOperacao } from "../src/api/operacoes.ts";
import {
  AVISO_PRODUTO_ATUALIZADO,
  AVISO_PRODUTO_CRIADO,
  AVISO_PRODUTO_EXCLUIDO,
  AVISO_PRODUTO_JA_EXCLUIDO,
  AVISOS_DA_LISTA_DE_PRODUTOS,
  AVISOS_DO_DETALHE_DE_PRODUTO,
  lerAvisoProduto,
} from "../src/paginas/aviso-produto.ts";
import { MENSAGEM_DADOS_RECUSADOS } from "../src/paginas/cadastro-produto.ts";
import {
  caminhoDetalheProduto,
  caminhoEdicaoProduto,
  CAMINHO_NOVO_PRODUTO,
} from "../src/paginas/caminhos-produtos.ts";
import {
  EXPLICACAO_PRODUTO_NAO_ENCONTRADO,
  MENSAGEM_FORA_PROTOCOLO_PRODUTO,
} from "../src/paginas/detalhe-produto.ts";
import {
  APOIO_TENTAR_SALVAR,
  criarEstadoEdicaoProduto,
  enviarEdicaoProduto,
  interpretarFalhaEdicao,
  MENSAGEM_SOMENTE_ADM_ALTERA,
  reduzirEdicaoProduto,
  valoresIniciaisEdicao,
} from "../src/paginas/edicao-produto.ts";
import {
  criarEstadoExclusaoProduto,
  destinoAposExclusao,
  dialogoExclusaoProdutoAberto,
  enviarExclusaoProduto,
  MENSAGEM_FALHA_EXCLUSAO_PRODUTO,
  MENSAGEM_SOMENTE_ADM_EXCLUI,
  reduzirExclusaoProduto,
  textoDialogoExclusaoProduto,
  textoErroDialogoExclusao,
} from "../src/paginas/exclusao-produto.ts";
import { podeCadastrarProduto, podeGerenciarProdutos } from "../src/paginas/lista-produtos.ts";
import type { DadosProduto, RespostaProduto } from "../src/tipos/protocolo.ts";
import {
  MENSAGEM_NOME_PRODUTO_VAZIO,
  MENSAGEM_QUANTIDADE_FORMATO,
} from "../src/validacao/validacao-produto.ts";

type Falha = Extract<ResultadoOperacao<RespostaProduto>, { ok: false }>;
type FalhaExclusao = Extract<ResultadoOperacao<true>, { ok: false }>;

const produto: RespostaProduto = { id: 7, nome: "Ingresso pista", descricao: "", quantidade: 0 };
const valores = { nome: "  Ingresso VIP ", descricao: "   ", quantidade: " 0010 " };

function falha(tipo: Falha["tipo"], status: number | null, mensagem: string): Falha {
  return { ok: false, tipo, status, mensagem };
}

function falhaExclusao(tipo: FalhaExclusao["tipo"], status: number | null, mensagem: string) {
  const resultado: FalhaExclusao = { ok: false, tipo, status, mensagem };
  return resultado;
}

function dependenciasEdicao(resposta: () => Promise<ResultadoOperacao<RespostaProduto>>) {
  const chamadas: Array<{ id: number; token: string; dados: DadosProduto }> = [];
  const atualizarProduto: Operacoes["atualizarProduto"] = (id, token, dados) => {
    chamadas.push({ id, token, dados });
    return resposta();
  };
  return {
    chamadas,
    dependencias: { atualizarProduto, token: "jwt-adm", id: 7, trava: { current: false } },
  };
}

function dependenciasExclusao(resposta: () => Promise<ResultadoOperacao<true>>) {
  const chamadas: Array<{ id: number; token: string }> = [];
  const excluirProduto: Operacoes["excluirProduto"] = (id, token) => {
    chamadas.push({ id, token });
    return resposta();
  };
  return {
    chamadas,
    dependencias: { excluirProduto, token: "jwt-adm", id: 7, trava: { current: false } },
  };
}

describe("caminhos e decisão de gerenciar", () => {
  it("caminhoEdicaoProduto usa só o id numérico e não colide com o cadastro", () => {
    expect(caminhoEdicaoProduto(7)).toBe("/produtos/7/editar");
    expect(caminhoEdicaoProduto(9007199254740991)).toBe("/produtos/9007199254740991/editar");
    expect(caminhoEdicaoProduto(7).startsWith(caminhoDetalheProduto(7))).toBe(true);
    expect(CAMINHO_NOVO_PRODUTO).toBe("/produtos/novo");
  });

  it("gerenciar e cadastrar seguem ehAdministrador", () => {
    const base = { id: 1, nome: "A", email: "a@b.com" };
    expect(podeGerenciarProdutos({ ...base, admin: true })).toBe(true);
    for (const usuario of [{ ...base, admin: false }, base, { ...base, admin: "true" }, null]) {
      expect(podeGerenciarProdutos(usuario)).toBe(false);
      expect(podeCadastrarProduto(usuario)).toBe(false);
    }
  });
});

describe("avisos de produto", () => {
  it("cada código gera o texto fixo", () => {
    expect(lerAvisoProduto({ avisoProduto: "criado" })).toBe(AVISO_PRODUTO_CRIADO);
    expect(lerAvisoProduto({ avisoProduto: "atualizado" })).toBe("Produto atualizado com sucesso.");
    expect(lerAvisoProduto({ avisoProduto: "excluido" })).toBe("Produto excluído com sucesso.");
    expect(lerAvisoProduto({ avisoProduto: "ja_excluido" })).toBe("O produto já havia sido excluído.");
    expect([AVISO_PRODUTO_ATUALIZADO, AVISO_PRODUTO_EXCLUIDO, AVISO_PRODUTO_JA_EXCLUIDO]).toHaveLength(3);
  });

  it("a lista e o detalhe só aceitam os códigos que lhes cabem", () => {
    expect(lerAvisoProduto({ avisoProduto: "atualizado" }, AVISOS_DA_LISTA_DE_PRODUTOS)).toBeNull();
    for (const codigo of ["criado", "excluido", "ja_excluido"]) {
      expect(lerAvisoProduto({ avisoProduto: codigo }, AVISOS_DA_LISTA_DE_PRODUTOS)).not.toBeNull();
      expect(lerAvisoProduto({ avisoProduto: codigo }, AVISOS_DO_DETALHE_DE_PRODUTO)).toBeNull();
    }
    expect(lerAvisoProduto({ avisoProduto: "atualizado" }, AVISOS_DO_DETALHE_DE_PRODUTO)).toBe(
      AVISO_PRODUTO_ATUALIZADO,
    );
  });

  it("desconhecidos e tipos errados são ignorados", () => {
    for (
      const estado of [
        { avisoProduto: "removido" },
        { avisoProduto: "Atualizado" },
        { avisoProduto: "<b>x</b>" },
        { avisoProduto: "__proto__" },
        { avisoProduto: 1 },
        null,
        "excluido",
      ]
    ) {
      expect(lerAvisoProduto(estado)).toBeNull();
    }
  });
});

describe("estado inicial e redutor da edição", () => {
  it("valores iniciais usam quantidadeParaTexto", () => {
    for (const [quantidade, texto] of [[0, "0"], [7, "7"], [1000000, "1000000"]] as const) {
      expect(valoresIniciaisEdicao({ ...produto, quantidade })).toEqual({
        nome: "Ingresso pista",
        descricao: "",
        quantidade: texto,
      });
    }
  });

  it("carregando → pronto com o formulário preenchido", () => {
    const pronto = reduzirEdicaoProduto(criarEstadoEdicaoProduto(7), {
      tipo: "carregado",
      id: 7,
      produto,
    });
    expect(pronto).toMatchObject({
      fase: "pronto",
      id: 7,
      formulario: { valores: { nome: "Ingresso pista", descricao: "", quantidade: "0" }, fase: "editando" },
    });
  });

  it("404, erro e resposta com outro id ao carregar", () => {
    const carregando = criarEstadoEdicaoProduto(7);
    expect(
      reduzirEdicaoProduto(carregando, {
        tipo: "falha_carregamento",
        id: 7,
        falha: falha("http", 404, "Recurso não encontrado no servidor."),
      }),
    ).toEqual({ fase: "nao_encontrado", id: 7, explicacao: EXPLICACAO_PRODUTO_NAO_ENCONTRADO });
    expect(
      reduzirEdicaoProduto(carregando, {
        tipo: "falha_carregamento",
        id: 7,
        falha: falha("http", 404, "Produto não encontrado."),
      }),
    ).toEqual({ fase: "nao_encontrado", id: 7, explicacao: "Produto não encontrado." });
    expect(
      reduzirEdicaoProduto(carregando, {
        tipo: "falha_carregamento",
        id: 7,
        falha: falha("rede", null, "Sem rede."),
      }),
    ).toEqual({ fase: "falha_carregamento", id: 7, mensagem: "Sem rede." });
    expect(
      reduzirEdicaoProduto(carregando, { tipo: "carregado", id: 7, produto: { ...produto, id: 8 } }),
    ).toEqual({ fase: "falha_carregamento", id: 7, mensagem: MENSAGEM_FORA_PROTOCOLO_PRODUTO });
  });

  it("ação de outro id é ignorada; enviando, falha e não encontrado ao salvar", () => {
    const pronto = reduzirEdicaoProduto(criarEstadoEdicaoProduto(7), {
      tipo: "carregado",
      id: 7,
      produto,
    });
    expect(reduzirEdicaoProduto(pronto, { tipo: "carregado", id: 8, produto })).toBe(pronto);
    expect(
      reduzirEdicaoProduto(pronto, {
        tipo: "formulario",
        id: 8,
        acao: { tipo: "alterar", campo: "nome", valor: "x" },
      }),
    ).toBe(pronto);
    const enviando = reduzirEdicaoProduto(pronto, {
      tipo: "formulario",
      id: 7,
      acao: { tipo: "iniciar_envio" },
    });
    expect(enviando).toMatchObject({ fase: "pronto", formulario: { fase: "enviando" } });
    const falhou = reduzirEdicaoProduto(enviando, {
      tipo: "formulario",
      id: 7,
      acao: { tipo: "falha_envio", falha: { mensagem: "Erro.", apoio: APOIO_TENTAR_SALVAR } },
    });
    expect(falhou).toMatchObject({
      formulario: { fase: "editando", valores: { nome: "Ingresso pista" }, erroServidor: { mensagem: "Erro." } },
    });
    expect(reduzirEdicaoProduto(falhou, { tipo: "nao_encontrado", id: 7, explicacao: "Sumiu." }))
      .toEqual({ fase: "nao_encontrado", id: 7, explicacao: "Sumiu." });
  });
});

describe("textos de erro da edição e da exclusão", () => {
  it("edição: cada status", () => {
    expect(interpretarFalhaEdicao(falha("http", 400, "O campo nome é obrigatório."))).toEqual({
      mensagem: "O campo nome é obrigatório.",
      apoio: null,
    });
    expect(interpretarFalhaEdicao(falha("entrada_invalida", null, "x"))).toEqual({
      mensagem: MENSAGEM_DADOS_RECUSADOS,
      apoio: null,
    });
    expect(interpretarFalhaEdicao(falha("http", 403, "Você não tem permissão para realizar esta operação.")))
      .toEqual({ mensagem: MENSAGEM_SOMENTE_ADM_ALTERA, apoio: null });
    expect(interpretarFalhaEdicao(falha("http", 403, "Apenas administradores podem alterar produtos.")))
      .toEqual({ mensagem: "Apenas administradores podem alterar produtos.", apoio: null });
    for (
      const f of [
        falha("rede", null, "Sem rede."),
        falha("rede", null, "O servidor não respondeu a tempo."),
        falha("http", 500, "Erro interno no servidor."),
        falha("fora_protocolo", 200, MENSAGEM_FORA_PROTOCOLO_PRODUTO),
      ]
    ) {
      expect(interpretarFalhaEdicao(f)).toEqual({ mensagem: f.mensagem, apoio: APOIO_TENTAR_SALVAR });
    }
    expect(interpretarFalhaEdicao(falha("http", 401, "x"))).toBeNull();
    expect(APOIO_TENTAR_SALVAR).toBe("Verifique a conexão e tente salvar novamente.");
  });

  it("exclusão: texto do diálogo e do erro dentro dele", () => {
    expect(textoDialogoExclusaoProduto("<img src=x onerror=alert(1)>")).toBe(
      "O produto <img src=x onerror=alert(1)> será excluído permanentemente. Esta ação não pode ser desfeita.",
    );
    const comErro = { ...criarEstadoExclusaoProduto(7), fase: "confirmando" as const, erroDialogo: "Sem rede." };
    expect(textoErroDialogoExclusao(comErro)).toBe(`${MENSAGEM_FALHA_EXCLUSAO_PRODUTO} Sem rede.`);
    expect(textoErroDialogoExclusao(criarEstadoExclusaoProduto(7))).toBeUndefined();
  });
});

describe("enviarEdicaoProduto", () => {
  it("válido chama uma vez com id, token e os três campos, mesmo sem alterações", async () => {
    const { chamadas, dependencias } = dependenciasEdicao(() =>
      Promise.resolve({ ok: true, dados: { ...produto, nome: "Ingresso VIP", quantidade: 10 } })
    );
    expect(await enviarEdicaoProduto(dependencias, valores)).toMatchObject({ tipo: "salvo" });
    expect(chamadas).toEqual([
      { id: 7, token: "jwt-adm", dados: { nome: "Ingresso VIP", descricao: "", quantidade: 10 } },
    ]);
    const semMudanca = dependenciasEdicao(() => Promise.resolve({ ok: true, dados: produto }));
    await enviarEdicaoProduto(semMudanca.dependencias, valoresIniciaisEdicao(produto));
    expect(semMudanca.chamadas).toEqual([
      { id: 7, token: "jwt-adm", dados: { nome: "Ingresso pista", descricao: "", quantidade: 0 } },
    ]);
  });

  it("inválido não chama", async () => {
    const { chamadas, dependencias } = dependenciasEdicao(() => Promise.resolve({ ok: true, dados: produto }));
    expect(await enviarEdicaoProduto(dependencias, { nome: "", descricao: "", quantidade: "1.5" })).toEqual({
      tipo: "invalido",
      erros: { nome: MENSAGEM_NOME_PRODUTO_VAZIO, quantidade: MENSAGEM_QUANTIDADE_FORMATO },
    });
    expect(chamadas).toEqual([]);
  });

  it("duplo envio faz uma só chamada", async () => {
    let liberar: (r: ResultadoOperacao<RespostaProduto>) => void = () => {};
    const { chamadas, dependencias } = dependenciasEdicao(() =>
      new Promise((resolver) => {
        liberar = resolver;
      })
    );
    const primeiro = enviarEdicaoProduto(dependencias, valores);
    expect(await enviarEdicaoProduto(dependencias, valores)).toEqual({ tipo: "ignorado" });
    liberar({ ok: true, dados: produto });
    await primeiro;
    expect(chamadas).toHaveLength(1);
    expect(dependencias.trava.current).toBe(false);
  });

  it("erros viram a mensagem certa; 404 vira não encontrado; 401 sem alerta", async () => {
    const casos: Array<[Falha, unknown]> = [
      [falha("http", 400, "Quantidade inválida."), { tipo: "falha", falha: { mensagem: "Quantidade inválida.", apoio: null } }],
      [falha("http", 403, "Você não tem permissão para realizar esta operação."), { tipo: "falha", falha: { mensagem: MENSAGEM_SOMENTE_ADM_ALTERA, apoio: null } }],
      [falha("http", 500, "Erro interno no servidor."), { tipo: "falha", falha: { mensagem: "Erro interno no servidor.", apoio: APOIO_TENTAR_SALVAR } }],
      [falha("rede", null, "Sem rede."), { tipo: "falha", falha: { mensagem: "Sem rede.", apoio: APOIO_TENTAR_SALVAR } }],
      [falha("rede", null, "Tempo esgotado."), { tipo: "falha", falha: { mensagem: "Tempo esgotado.", apoio: APOIO_TENTAR_SALVAR } }],
      [falha("fora_protocolo", 200, MENSAGEM_FORA_PROTOCOLO_PRODUTO), { tipo: "falha", falha: { mensagem: MENSAGEM_FORA_PROTOCOLO_PRODUTO, apoio: APOIO_TENTAR_SALVAR } }],
      [falha("entrada_invalida", null, "x"), { tipo: "falha", falha: { mensagem: MENSAGEM_DADOS_RECUSADOS, apoio: null } }],
      [falha("http", 404, "Recurso não encontrado no servidor."), { tipo: "nao_encontrado", explicacao: EXPLICACAO_PRODUTO_NAO_ENCONTRADO }],
      [falha("http", 401, "Não autorizado."), { tipo: "nao_autorizado" }],
    ];
    for (const [f, esperado] of casos) {
      const { dependencias } = dependenciasEdicao(() => Promise.resolve(f));
      expect(await enviarEdicaoProduto(dependencias, valores)).toEqual(esperado);
      expect(dependencias.trava.current).toBe(false);
    }
  });

  it("resposta com id diferente vira fora do protocolo", async () => {
    const { dependencias } = dependenciasEdicao(() =>
      Promise.resolve({ ok: true, dados: { ...produto, id: 99 } })
    );
    expect(await enviarEdicaoProduto(dependencias, valores)).toEqual({
      tipo: "falha",
      falha: { mensagem: MENSAGEM_FORA_PROTOCOLO_PRODUTO, apoio: APOIO_TENTAR_SALVAR },
    });
  });
});

describe("redutor e envio da exclusão", () => {
  it("abrir, cancelar, enviar e falhas", () => {
    const ociosa = criarEstadoExclusaoProduto(7);
    const aberta = reduzirExclusaoProduto(ociosa, { tipo: "abrir", id: 7 });
    expect(dialogoExclusaoProdutoAberto(aberta)).toBe(true);
    expect(reduzirExclusaoProduto(aberta, { tipo: "cancelar", id: 7 })).toEqual(ociosa);
    const excluindo = reduzirExclusaoProduto(aberta, { tipo: "iniciar_envio", id: 7 });
    expect(excluindo.fase).toBe("excluindo");
    expect(reduzirExclusaoProduto(excluindo, { tipo: "cancelar", id: 7 })).toBe(excluindo);
    expect(reduzirExclusaoProduto(excluindo, { tipo: "iniciar_envio", id: 7 })).toBe(excluindo);
    const erroDialogo = reduzirExclusaoProduto(excluindo, { tipo: "falha_dialogo", id: 7, mensagem: "Sem rede." });
    expect(erroDialogo).toMatchObject({ fase: "confirmando", erroDialogo: "Sem rede." });
    const erroPagina = reduzirExclusaoProduto(excluindo, { tipo: "falha_pagina", id: 7, mensagem: "Proibido." });
    expect(erroPagina).toMatchObject({ fase: "ociosa", erroPagina: "Proibido." });
    expect(dialogoExclusaoProdutoAberto(erroPagina)).toBe(false);
    expect(reduzirExclusaoProduto(excluindo, { tipo: "falha_dialogo", id: 8, mensagem: "x" })).toBe(excluindo);
  });

  it("204 → excluido, 404 → ja_excluido, 403, 401 e falhas", async () => {
    const casos: Array<[ResultadoOperacao<true>, unknown]> = [
      [{ ok: true, dados: true }, { tipo: "excluido" }],
      [falhaExclusao("http", 404, "x"), { tipo: "ja_excluido" }],
      [falhaExclusao("http", 403, "Você não tem permissão para realizar esta operação."), { tipo: "proibido", mensagem: MENSAGEM_SOMENTE_ADM_EXCLUI }],
      [falhaExclusao("http", 403, "Somente ADM."), { tipo: "proibido", mensagem: "Somente ADM." }],
      [falhaExclusao("http", 401, "x"), { tipo: "nao_autorizado" }],
      [falhaExclusao("rede", null, "Sem rede."), { tipo: "falha", mensagem: "Sem rede." }],
      [falhaExclusao("rede", null, "Tempo esgotado."), { tipo: "falha", mensagem: "Tempo esgotado." }],
      [falhaExclusao("http", 500, "Erro interno no servidor."), { tipo: "falha", mensagem: "Erro interno no servidor." }],
      [falhaExclusao("fora_protocolo", 204, "Fora."), { tipo: "falha", mensagem: "Fora." }],
    ];
    for (const [resposta, esperado] of casos) {
      const { chamadas, dependencias } = dependenciasExclusao(() => Promise.resolve(resposta));
      expect(await enviarExclusaoProduto(dependencias)).toEqual(esperado);
      expect(chamadas).toEqual([{ id: 7, token: "jwt-adm" }]);
      expect(dependencias.trava.current).toBe(false);
    }
  });

  it("destino depois da exclusão", () => {
    expect(destinoAposExclusao({ tipo: "excluido" })).toEqual({
      para: "/produtos",
      estado: { avisoProduto: "excluido" },
    });
    expect(destinoAposExclusao({ tipo: "ja_excluido" })).toEqual({
      para: "/produtos",
      estado: { avisoProduto: "ja_excluido" },
    });
    for (const resultado of [{ tipo: "falha", mensagem: "x" }, { tipo: "proibido", mensagem: "x" }, { tipo: "nao_autorizado" }] as const) {
      expect(destinoAposExclusao(resultado)).toBeNull();
    }
  });

  it("duplo clique faz uma só chamada", async () => {
    let liberar: (r: ResultadoOperacao<true>) => void = () => {};
    const { chamadas, dependencias } = dependenciasExclusao(() =>
      new Promise((resolver) => {
        liberar = resolver;
      })
    );
    const primeiro = enviarExclusaoProduto(dependencias);
    expect(await enviarExclusaoProduto(dependencias)).toEqual({ tipo: "ignorado" });
    liberar({ ok: true, dados: true });
    expect(await primeiro).toEqual({ tipo: "excluido" });
    expect(chamadas).toHaveLength(1);
  });
});
