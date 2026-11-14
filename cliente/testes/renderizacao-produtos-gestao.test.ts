import { createElement } from "react";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import type { InitialEntry } from "react-router";
import { describe, expect, it } from "vitest";
import type { Operacoes } from "../src/api/operacoes.ts";
import { DialogoConfirmacao } from "../src/componentes/DialogoConfirmacao.tsx";
import { ContextoConexao } from "../src/contextos/contexto-conexao.ts";
import { ContextoOperacoes } from "../src/contextos/contexto-operacoes.ts";
import { ContextoRegistros } from "../src/contextos/contexto-registros.ts";
import { ContextoSessao } from "../src/contextos/contexto-sessao.ts";
import type { SessaoAtiva } from "../src/contextos/contexto-sessao.ts";
import { ContextoTema } from "../src/contextos/contexto-tema.ts";
import { AcoesDetalheProduto } from "../src/paginas/AcoesDetalheProduto.tsx";
import { textoDialogoExclusaoProduto } from "../src/paginas/exclusao-produto.ts";
import { FormularioProduto } from "../src/paginas/FormularioProduto.tsx";
import { montarLinhasProdutos } from "../src/paginas/lista-produtos.ts";
import { TabelaProdutos } from "../src/paginas/TabelaProdutos.tsx";
import { ConfiguracaoRotas } from "../src/rotas/ConfiguracaoRotas.tsx";

const conexao = { ip: "10.20.50.123", porta: 20000 };
const administrador = { id: 1, nome: "Admin Teste", email: "adm@teste.com", admin: true };
const comum = { id: 5, nome: "Ana Lima", email: "ana@exemplo.com", admin: false };
const HOSTIL = "<img src=x onerror=alert(1)>";

function sessaoDe(usuario: SessaoAtiva["usuario"]): SessaoAtiva {
  return { token: "jwt-teste", idSessao: "sessao-teste", usuario };
}

function semAcao(): void {
  return;
}

function criarOperacoesContadas() {
  const chamadas: string[] = [];
  const pendente = <T>(nome: string): Promise<T> => {
    chamadas.push(nome);
    return new Promise<T>(() => {});
  };
  const operacoes: Operacoes = {
    cadastrar: () => pendente("cadastrar"),
    entrar: () => pendente("entrar"),
    lerCadastro: () => pendente("lerCadastro"),
    atualizarCadastro: () => pendente("atualizarCadastro"),
    excluirCadastro: () => pendente("excluirCadastro"),
    sair: () => pendente("sair"),
    listarUsuarios: () => pendente("listarUsuarios"),
    listarProdutos: () => pendente("listarProdutos"),
    lerProduto: () => pendente("lerProduto"),
    criarProduto: () => pendente("criarProduto"),
    atualizarProduto: () => pendente("atualizarProduto"),
    excluirProduto: () => pendente("excluirProduto"),
    verificarServidor: () => pendente("verificarServidor"),
  };
  return { operacoes, chamadas };
}

function renderizar(caminho: InitialEntry, sessao: SessaoAtiva | null) {
  const { operacoes, chamadas } = criarOperacoesContadas();
  const arvore: ReactNode = createElement(
    ContextoTema,
    { value: { tema: "claro", alternar: semAcao } },
    createElement(
      ContextoConexao,
      {
        value: {
          conexao,
          definirConexao: semAcao,
          limparConexao: semAcao,
          obterConexaoAtual: () => conexao,
        },
      },
      createElement(
        ContextoSessao,
        {
          value: {
            sessao,
            avisoSessao: null,
            iniciarSessao: semAcao,
            atualizarUsuario: semAcao,
            encerrarSessaoLocal: semAcao,
            consumirAvisoSessao: () => null,
          },
        },
        createElement(
          ContextoOperacoes,
          { value: operacoes },
          createElement(
            ContextoRegistros,
            { value: { registros: [], adicionarRegistro: semAcao, limparRegistros: semAcao } },
            createElement(
              MemoryRouter,
              { initialEntries: [caminho] },
              createElement(ConfiguracaoRotas),
            ),
          ),
        ),
      ),
    ),
  );
  return { html: renderToStaticMarkup(arvore), chamadas };
}

function contar(texto: string, trecho: string): number {
  return texto.split(trecho).length - 1;
}

function renderizarFormulario(enviando: boolean, identificador?: number): string {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(FormularioProduto, {
        valores: { nome: HOSTIL, descricao: "Linha 1\nLinha 2", quantidade: "1000000" },
        erros: {},
        enviando,
        textoEnviar: "Salvar alterações",
        textoEnviando: "Salvando...",
        cancelarPara: "/produtos/7",
        identificador,
        aoAlterar: semAcao,
        aoSair: semAcao,
        aoEnviar: semAcao,
      }),
    ),
  );
}

describe("rota de edição de produto", () => {
  it("ADM vê o primeiro quadro carregando, sem requisição antes dos efeitos", () => {
    const { html, chamadas } = renderizar("/produtos/7/editar", sessaoDe(administrador));
    expect(html).toMatch(/<h1[^>]*>Editar produto<\/h1>/);
    expect(html).toContain("Altere os dados do produto e salve.");
    expect(html).toMatch(/<p role="status"[^>]*>Carregando dados do produto\.\.\.<\/p>/);
    expect(html).not.toContain("<form");
    expect(html).not.toContain("Detalhes do produto");
    expect(chamadas).toEqual([]);
  });

  it("comum e visitante não veem a edição", () => {
    for (const sessao of [sessaoDe(comum), null]) {
      const { html, chamadas } = renderizar("/produtos/7/editar", sessao);
      expect(html).not.toContain("Editar produto");
      expect(html).not.toContain("<form");
      expect(chamadas).toEqual([]);
    }
  });

  it("id inválido mostra a mensagem e o link, sem requisição", () => {
    for (const id of ["abc", "0", "1.5", "novo"]) {
      const { html, chamadas } = renderizar(`/produtos/${id}/editar`, sessaoDe(administrador));
      expect(html, id).toMatch(/<h1[^>]*>Editar produto<\/h1>/);
      expect(html, id).toContain("Identificador de produto inválido.");
      expect(html, id).toMatch(/href="\/produtos"[^>]*>Voltar para a lista de produtos<\/a>/);
      expect(chamadas, id).toEqual([]);
    }
  });

  it("/produtos/novo continua sendo o cadastro", () => {
    const { html } = renderizar("/produtos/novo", sessaoDe(administrador));
    expect(html).toMatch(/<h1[^>]*>Novo produto<\/h1>/);
    expect(html).not.toContain("Editar produto");
  });
});

describe("FormularioProduto da edição", () => {
  it("pronto: valores, identificador, rótulos e botões", () => {
    const html = renderizarFormulario(false, 7);
    expect(html).toContain("Identificador: 7");
    expect(html).toContain('value="&lt;img src=x onerror=alert(1)&gt;"');
    expect(html).not.toContain("<img");
    expect(html).toContain("Linha 1\nLinha 2</textarea>");
    expect(html).toContain('value="1000000"');
    for (const rotulo of ["Nome", "Descrição", "Quantidade em estoque"]) {
      expect(html).toMatch(new RegExp(`<label for="[^"]+"[^>]*>${rotulo}</label>`));
    }
    expect(html).toMatch(/<button type="submit"[^>]*>Salvar alterações<\/button>/);
    expect(html).toMatch(/href="\/produtos\/7"[^>]*>Cancelar<\/a>/);
    expect(html.toLowerCase()).not.toContain("readonly");
  });

  it("enviando: campos somente leitura, aria-busy e texto de progresso", () => {
    const html = renderizarFormulario(true);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain(">Salvando...</button>");
    expect(contar(html.toLowerCase(), 'readonly=""')).toBe(3);
    expect(html).not.toContain("Identificador:");
  });
});

describe("ações de gestão no detalhe e na lista", () => {
  it("detalhe: Editar produto e Excluir produto", () => {
    const html = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(AcoesDetalheProduto, {
          caminhoEdicao: "/produtos/7/editar",
          aoExcluir: semAcao,
        }),
      ),
    );
    expect(html).toMatch(/href="\/produtos\/7\/editar"[^>]*>Editar produto<\/a>/);
    expect(html).toMatch(/<button type="button"[^>]*>Excluir produto<\/button>/);
  });

  it("tabela mostra Editar com rótulo único só quando recebe a permissão, e nunca Excluir", () => {
    const linhas = montarLinhasProdutos([
      { id: 3, nome: HOSTIL, descricao: "", quantidade: 1 },
      { id: 8, nome: "Camarote", descricao: "", quantidade: 0 },
    ]);
    const tabela = (mostrarEditar: boolean) =>
      renderToStaticMarkup(
        createElement(
          MemoryRouter,
          null,
          createElement(TabelaProdutos, { linhas, recarregando: false, mostrarEditar }),
        ),
      );
    const comEditar = tabela(true);
    expect(contar(comEditar, ">Editar</a>")).toBe(2);
    expect(comEditar).toContain('aria-label="Editar &lt;img src=x onerror=alert(1)&gt;"');
    expect(comEditar).toContain('aria-label="Editar Camarote"');
    expect(comEditar).toContain('href="/produtos/8/editar"');
    expect(comEditar).not.toContain("Excluir");
    const semEditar = tabela(false);
    expect(semEditar).not.toContain(">Editar</a>");
    expect(contar(semEditar, ">Ver detalhes</a>")).toBe(2);
  });

  it("diálogo de exclusão com nome escapado e Cancelar antes de Excluir", () => {
    const html = renderToStaticMarkup(
      createElement(DialogoConfirmacao, {
        aberto: false,
        titulo: "Excluir produto?",
        descricao: textoDialogoExclusaoProduto(HOSTIL),
        textoConfirmar: "Excluir",
        textoConfirmando: "Excluindo...",
        variante: "perigo",
        carregando: false,
        aoConfirmar: semAcao,
        aoCancelar: semAcao,
      }),
    );
    expect(html).toContain("Excluir produto?");
    expect(html).toContain(
      "O produto &lt;img src=x onerror=alert(1)&gt; será excluído permanentemente.",
    );
    expect(html).not.toContain("<img");
    expect(html.indexOf(">Cancelar</button>")).toBeLessThan(html.indexOf(">Excluir</button>"));
    expect(html).toMatch(/<dialog[^>]*aria-labelledby="[^"]+"[^>]*aria-describedby="[^"]+"/);
  });
});

describe("avisos de produto na renderização", () => {
  const detalhe = (state: unknown) =>
    renderizar({ pathname: "/produtos/7", state }, sessaoDe(administrador)).html;
  const lista = (state: unknown) =>
    renderizar({ pathname: "/produtos", state }, sessaoDe(administrador)).html;

  it("atualizado aparece no detalhe e não na lista", () => {
    expect(detalhe({ avisoProduto: "atualizado" })).toMatch(
      /<div role="status"[^>]*>Produto atualizado com sucesso\.<\/div>/,
    );
    expect(lista({ avisoProduto: "atualizado" })).not.toContain("Produto atualizado com sucesso.");
  });

  it("excluido e ja_excluido aparecem na lista e não no detalhe", () => {
    expect(lista({ avisoProduto: "excluido" })).toMatch(
      /<div role="status"[^>]*>Produto excluído com sucesso\.<\/div>/,
    );
    expect(lista({ avisoProduto: "ja_excluido" })).toContain("O produto já havia sido excluído.");
    expect(detalhe({ avisoProduto: "excluido" })).not.toContain("Produto excluído com sucesso.");
  });

  it("códigos desconhecidos não mostram nada", () => {
    for (const state of [{ avisoProduto: "removido" }, { avisoProduto: "<b>x</b>" }, null]) {
      expect(lista(state)).not.toContain("com sucesso");
      expect(detalhe(state)).not.toContain("com sucesso");
    }
  });
});
