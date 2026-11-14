import { createElement } from "react";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import type { Operacoes } from "../src/api/operacoes.ts";
import { ContextoConexao } from "../src/contextos/contexto-conexao.ts";
import { ContextoOperacoes } from "../src/contextos/contexto-operacoes.ts";
import { ContextoRegistros } from "../src/contextos/contexto-registros.ts";
import { ContextoSessao } from "../src/contextos/contexto-sessao.ts";
import type { SessaoAtiva } from "../src/contextos/contexto-sessao.ts";
import { ContextoTema } from "../src/contextos/contexto-tema.ts";
import { montarLinhasProdutos } from "../src/paginas/lista-produtos.ts";
import { TabelaProdutos } from "../src/paginas/TabelaProdutos.tsx";
import { ConfiguracaoRotas } from "../src/rotas/ConfiguracaoRotas.tsx";

const conexao = { ip: "10.20.50.123", porta: 20000 };
const administrador = { id: 1, nome: "Admin Teste", email: "adm@teste.com", admin: true };
const comum = { id: 5, nome: "Ana Lima", email: "ana@exemplo.com", admin: false };
const HOSTIL = "<img src=x onerror=alert(1)>";
const NAV_PRINCIPAL = '<nav aria-label="Navegação principal"';

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

function renderizar(caminho: string, sessao: SessaoAtiva | null) {
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

function trechoNavegacao(html: string): string {
  return /<nav aria-label="Navegação principal"[^>]*>.*?<\/nav>/s.exec(html)?.[0] ?? "";
}

describe("cabeçalho com Produtos", () => {
  it("ADM vê Produtos e depois Usuários", () => {
    const nav = trechoNavegacao(renderizar("/perfil", sessaoDe(administrador)).html);
    expect(nav).toMatch(/href="\/produtos"[^>]*>Produtos<\/a>.*href="\/usuarios"[^>]*>Usuários<\/a>/s);
  });

  it("usuário comum vê só Produtos", () => {
    const nav = trechoNavegacao(renderizar("/perfil", sessaoDe(comum)).html);
    expect(nav).toContain(">Produtos</a>");
    expect(nav).not.toContain("Usuários");
  });

  it("visitante não tem região de navegação", () => {
    for (const caminho of ["/login", "/cadastro", "/conexao"]) {
      expect(renderizar(caminho, null).html).not.toContain(NAV_PRINCIPAL);
    }
  });

  it("Produtos fica marcado como seção atual na lista e no detalhe", () => {
    for (const caminho of ["/produtos", "/produtos/7", "/produtos/abc"]) {
      const nav = trechoNavegacao(renderizar(caminho, sessaoDe(comum)).html);
      expect(nav, caminho).toMatch(/<a aria-current="page"[^>]*href="\/produtos"/);
      expect(contar(nav, 'aria-current="page"'), caminho).toBe(1);
    }
    expect(trechoNavegacao(renderizar("/perfil", sessaoDe(comum)).html)).not.toContain(
      "aria-current",
    );
  });
});

describe("páginas de produtos no primeiro quadro", () => {
  it("lista: h1, carregando em role status, sem tabela e sem requisição antes dos efeitos", () => {
    for (const sessao of [sessaoDe(comum), sessaoDe(administrador)]) {
      const { html, chamadas } = renderizar("/produtos", sessao);
      expect(html).toMatch(/<h1[^>]*>Produtos<\/h1>/);
      expect(html).toContain("Estoque de ingressos disponível neste servidor.");
      expect(html).toMatch(/<p role="status"[^>]*>Carregando produtos\.\.\.<\/p>/);
      expect(html).not.toContain("<table");
      expect(chamadas).toEqual([]);
    }
  });

  it("detalhe: h1, carregando e link de voltar", () => {
    const { html, chamadas } = renderizar("/produtos/7", sessaoDe(comum));
    expect(html).toMatch(/<h1[^>]*>Detalhes do produto<\/h1>/);
    expect(html).toMatch(/<p role="status"[^>]*>Carregando dados do produto\.\.\.<\/p>/);
    expect(html).toMatch(/href="\/produtos"[^>]*>Voltar para a lista de produtos<\/a>/);
    expect(html).not.toContain("<dl");
    expect(chamadas).toEqual([]);
  });

  it("identificador inválido mostra a mensagem e o link, sem requisição", () => {
    for (const caminho of ["/produtos/abc", "/produtos/0", "/produtos/1.5"]) {
      const { html, chamadas } = renderizar(caminho, sessaoDe(comum));
      expect(html, caminho).toContain("Identificador de produto inválido.");
      expect(html, caminho).toMatch(/href="\/produtos"[^>]*>Voltar para a lista de produtos<\/a>/);
      expect(html, caminho).not.toContain("Carregando dados do produto");
      expect(chamadas, caminho).toEqual([]);
    }
  });

  it("as páginas de produtos não mostram nada específico de ADM", () => {
    for (const caminho of ["/produtos", "/produtos/7"]) {
      const paraAdm = renderizar(caminho, sessaoDe(administrador)).html;
      const paraComum = renderizar(caminho, sessaoDe(comum)).html;
      const principal = (html: string) => /<main[^>]*>.*<\/main>/s.exec(html)?.[0] ?? "";
      expect(principal(paraAdm), caminho).toBe(principal(paraComum));
    }
  });
});

describe("acesso às rotas de produtos", () => {
  it("usuário comum e ADM acessam; sem sessão nada é renderizado", () => {
    for (const caminho of ["/produtos", "/produtos/7"]) {
      expect(renderizar(caminho, sessaoDe(comum)).html, caminho).toContain("<h1");
      expect(renderizar(caminho, sessaoDe(administrador)).html, caminho).toContain("<h1");
      const { html, chamadas } = renderizar(caminho, null);
      expect(html, caminho).not.toContain("<h1");
      expect(html, caminho).not.toContain("Produtos");
      expect(chamadas, caminho).toEqual([]);
    }
  });
});

describe("TabelaProdutos", () => {
  function renderizarTabela(recarregando = false): string {
    const linhas = montarLinhasProdutos([
      { id: 3, nome: HOSTIL, descricao: "<b>negrito</b>\nsegunda linha", quantidade: 12345 },
      { id: 8, nome: "Camarote", descricao: "", quantidade: 0 },
      { id: 9, nome: "Pista", descricao: "Comum", quantidade: 1000000 },
    ]);
    return renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(TabelaProdutos, { linhas, recarregando })),
    );
  }

  it("tem legenda ligada à região e cabeçalhos com scope", () => {
    const html = renderizarTabela();
    expect(html).toMatch(/<caption id="([^"]+)"[^>]*>Produtos cadastrados<\/caption>/);
    const idLegenda = /<caption id="([^"]+)"/.exec(html)?.[1] ?? "";
    expect(html).toContain(`role="region" aria-labelledby="${idLegenda}" tabindex="0"`);
    expect(contar(html, '<th scope="col"')).toBe(4);
    for (const titulo of ["Nome", "Descrição", "Quantidade", "Ações"]) {
      expect(html).toMatch(new RegExp(`<th scope="col"[^>]*>${titulo}</th>`));
    }
    expect(html).not.toContain("aria-busy");
    expect(renderizarTabela(true)).toContain('aria-busy="true"');
  });

  it("textos hostis saem escapados, sem nenhum elemento criado a partir deles", () => {
    const html = renderizarTabela();
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("&lt;b&gt;negrito&lt;/b&gt; segunda linha");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b>");
  });

  it("quantidade formatada, Esgotado só no produto com zero e Sem descrição", () => {
    const html = renderizarTabela();
    expect(html).toContain("12.345");
    expect(html).toContain("1.000.000");
    expect(contar(html, ">Esgotado</span>")).toBe(1);
    expect(html).toMatch(/0<span[^>]*>Esgotado<\/span>/);
    expect(html).toContain(">Sem descrição</span>");
  });

  it("um link Ver detalhes por linha, com rótulo único e caminho pelo id", () => {
    const html = renderizarTabela();
    expect(contar(html, ">Ver detalhes</a>")).toBe(3);
    expect(html).toContain('aria-label="Ver detalhes de &lt;img src=x onerror=alert(1)&gt;"');
    expect(html).toContain('aria-label="Ver detalhes de Camarote"');
    expect(html).toContain('aria-label="Ver detalhes de Pista"');
    for (const id of [3, 8, 9]) {
      expect(html).toContain(`href="/produtos/${id}"`);
    }
  });
});
