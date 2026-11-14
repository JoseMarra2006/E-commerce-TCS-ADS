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
import { montarLinhasUsuarios } from "../src/paginas/lista-usuarios.ts";
import { TabelaUsuarios } from "../src/paginas/TabelaUsuarios.tsx";
import { ConfiguracaoRotas } from "../src/rotas/ConfiguracaoRotas.tsx";

const conexao = { ip: "10.20.50.123", porta: 20000 };
const administrador = { id: 1, nome: "Admin Teste", email: "adm@teste.com", admin: true };
const comum = { id: 5, nome: "Ana Lima", email: "ana@exemplo.com", admin: false };
const HOSTIL = "<img src=x onerror=alert(1)>";

function sessaoDe(usuario: SessaoAtiva["usuario"]): SessaoAtiva {
  return { token: "jwt-teste", idSessao: "sessao-teste", usuario };
}

function criarOperacoesContadas() {
  let chamadas = 0;
  const pendente = <T>(): Promise<T> => {
    chamadas += 1;
    return new Promise<T>(() => {});
  };
  const operacoes: Operacoes = {
    cadastrar: () => pendente(),
    entrar: () => pendente(),
    lerCadastro: () => pendente(),
    atualizarCadastro: () => pendente(),
    excluirCadastro: () => pendente(),
    sair: () => pendente(),
    listarUsuarios: () => pendente(),
    listarProdutos: () => pendente(),
    lerProduto: () => pendente(),
    criarProduto: () => pendente(),
    atualizarProduto: () => pendente(),
    excluirProduto: () => pendente(),
    verificarServidor: () => pendente(),
  };
  return { operacoes, chamadas: () => chamadas };
}

function semAcao(): void {
  return;
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

const NAV_PRINCIPAL = '<nav aria-label="Navegação principal"';
const ROTAS_ADM = ["/usuarios", "/usuarios/7", "/usuarios/7/editar"];
const TITULOS_ADM = ["Usuários", "Detalhes do usuário", "Editar usuário"];

describe("cabeçalho: link Usuários", () => {
  it("aparece só para o ADM, dentro do nav com rótulo", () => {
    const { html } = renderizar("/perfil", sessaoDe(administrador));
    expect(html).toContain(NAV_PRINCIPAL);
    expect(html).toMatch(/<nav aria-label="Navegação principal"[^>]*>.*href="\/usuarios"[^>]*>Usuários<\/a>.*<\/nav>/s);
  });

  it("não aparece para usuário comum nem sem sessão", () => {
    expect(renderizar("/perfil", sessaoDe(comum)).html).not.toContain(NAV_PRINCIPAL);
    expect(renderizar("/perfil", sessaoDe(comum)).html).not.toContain('href="/usuarios"');
    expect(renderizar("/login", null).html).not.toContain(NAV_PRINCIPAL);
  });

  it("marca a página atual com aria-current", () => {
    const { html } = renderizar("/usuarios", sessaoDe(administrador));
    expect(html).toMatch(/<a aria-current="page"[^>]*href="\/usuarios"/);
    expect(renderizar("/perfil", sessaoDe(administrador)).html).not.toContain('aria-current="page"');
  });
});

describe("páginas do ADM no primeiro quadro", () => {
  it("lista: h1, carregando com role status e sem tabela", () => {
    const { html, chamadas } = renderizar("/usuarios", sessaoDe(administrador));
    expect(html).toMatch(/<h1[^>]*>Usuários<\/h1>/);
    expect(html).toMatch(/<p role="status"[^>]*>Carregando usuários\.\.\.<\/p>/);
    expect(html).not.toContain("<table");
    expect(chamadas()).toBe(0);
  });

  it("detalhe: h1 e carregando", () => {
    const { html } = renderizar("/usuarios/7", sessaoDe(administrador));
    expect(html).toMatch(/<h1[^>]*>Detalhes do usuário<\/h1>/);
    expect(html).toMatch(/<p role="status"[^>]*>Carregando dados do usuário\.\.\.<\/p>/);
    expect(html).not.toContain("<dl");
  });

  it("edição: h1 e carregando, sem formulário", () => {
    const { html } = renderizar("/usuarios/7/editar", sessaoDe(administrador));
    expect(html).toMatch(/<h1[^>]*>Editar usuário<\/h1>/);
    expect(html).toMatch(/<p role="status"[^>]*>Carregando dados do usuário\.\.\.<\/p>/);
    expect(html).not.toContain("<form");
  });

  it("identificador inválido no detalhe e na edição, com link para a lista e sem requisição", () => {
    for (
      const caminho of [
        "/usuarios/abc",
        "/usuarios/0",
        "/usuarios/1.5",
        "/usuarios/abc/editar",
        "/usuarios/0/editar",
      ]
    ) {
      const { html, chamadas } = renderizar(caminho, sessaoDe(administrador));
      expect(html, caminho).toContain("Identificador de usuário inválido.");
      expect(html, caminho).toMatch(/href="\/usuarios"[^>]*>Voltar para a lista<\/a>/);
      expect(html, caminho).not.toContain("Carregando dados do usuário");
      expect(chamadas(), caminho).toBe(0);
    }
  });

  it("o próprio id da sessão não renderiza o detalhe nem a edição", () => {
    for (const caminho of ["/usuarios/1", "/usuarios/001", "/usuarios/1/editar"]) {
      const { html } = renderizar(caminho, sessaoDe(administrador));
      expect(html, caminho).not.toContain("Detalhes do usuário");
      expect(html, caminho).not.toContain("Editar usuário");
    }
  });
});

describe("rotas do ADM exigem o requisito admin", () => {
  it("com ADM, o conteúdo administrativo é renderizado", () => {
    ROTAS_ADM.forEach((caminho, indice) => {
      const { html } = renderizar(caminho, sessaoDe(administrador));
      expect(html, caminho).toContain(`>${TITULOS_ADM[indice] ?? ""}</h1>`);
      expect(html, caminho).toContain("Administração");
    });
  });

  it("com usuário comum ou sem sessão, nada administrativo é renderizado", () => {
    for (const sessao of [sessaoDe(comum), sessaoDe({ ...comum, admin: false }), null]) {
      for (const caminho of [...ROTAS_ADM, "/usuarios/abc"]) {
        const { html, chamadas } = renderizar(caminho, sessao);
        expect(html, caminho).not.toContain("<h1");
        expect(html, caminho).not.toContain("Administração");
        expect(html, caminho).not.toContain("Identificador de usuário inválido.");
        expect(chamadas(), caminho).toBe(0);
      }
    }
  });
});

describe("perfil: diálogo de exclusão da própria conta", () => {
  it("ADM vê o aviso reforçado e o rótulo próprio", () => {
    const { html } = renderizar("/perfil", sessaoDe(administrador));
    expect(html).toContain("Você é administrador.");
    expect(html).toContain("Excluir minha conta de administrador");
  });

  it("usuário comum vê o diálogo de sempre", () => {
    const { html } = renderizar("/perfil", sessaoDe(comum));
    expect(html).not.toContain("Você é administrador.");
    expect(html).not.toContain("Excluir minha conta de administrador");
    expect(html).toContain(
      "Esta ação é permanente. Seus dados serão apagados deste servidor e você será desconectado.",
    );
  });
});

describe("TabelaUsuarios", () => {
  function renderizarTabela(recarregando = false): string {
    const linhas = montarLinhasUsuarios([
      administrador,
      { id: 7, nome: HOSTIL, email: "<b>x</b>@a.com", admin: false },
    ], 1);
    return renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(TabelaUsuarios, { linhas, recarregando })),
    );
  }

  it("tem legenda, região rotulada e cabeçalhos com scope", () => {
    const html = renderizarTabela();
    expect(html).toMatch(/<caption id="([^"]+)"[^>]*>Usuários cadastrados<\/caption>/);
    const idLegenda = /<caption id="([^"]+)"/.exec(html)?.[1] ?? "";
    expect(html).toContain(`role="region" aria-labelledby="${idLegenda}" tabindex="0"`);
    expect(contar(html, '<th scope="col">')).toBe(4);
    for (const titulo of ["Nome", "E-mail", "Tipo", "Ações"]) {
      expect(html).toContain(`<th scope="col">${titulo}</th>`);
    }
    expect(html).not.toContain("aria-busy");
    expect(renderizarTabela(true)).toContain('aria-busy="true"');
  });

  it("texto hostil sai escapado e nenhum elemento é criado a partir dele", () => {
    const html = renderizarTabela();
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;@a.com");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b>");
    expect(html).toContain('aria-label="Ver detalhes de &lt;img src=x onerror=alert(1)&gt;"');
  });

  it("linha própria com Você e Meu perfil; a outra com Ver detalhes pelo id", () => {
    const html = renderizarTabela();
    expect(html).toContain("Você");
    expect(html).toMatch(/href="\/perfil"[^>]*>Meu perfil<\/a>/);
    expect(html).toMatch(/href="\/usuarios\/7"[^>]*>Ver detalhes<\/a>/);
    expect(contar(html, "Ver detalhes</a>")).toBe(1);
    expect(html).toContain(">Administrador</span>");
    expect(html).toContain(">Comum</span>");
  });
});
