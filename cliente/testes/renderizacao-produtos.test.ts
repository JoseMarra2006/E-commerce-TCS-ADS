import { createElement } from "react";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import type { InitialEntry } from "react-router";
import { describe, expect, it } from "vitest";
import type { Operacoes } from "../src/api/operacoes.ts";
import { ContextoConexao } from "../src/contextos/contexto-conexao.ts";
import { ContextoOperacoes } from "../src/contextos/contexto-operacoes.ts";
import { ContextoRegistros } from "../src/contextos/contexto-registros.ts";
import { ContextoSessao } from "../src/contextos/contexto-sessao.ts";
import type { SessaoAtiva } from "../src/contextos/contexto-sessao.ts";
import { ContextoTema } from "../src/contextos/contexto-tema.ts";
import { CampoTextoLongo } from "../src/componentes/CampoTextoLongo.tsx";
import { AcoesListaProdutos } from "../src/paginas/AcoesListaProdutos.tsx";
import { montarLinhasProdutos, podeCadastrarProduto } from "../src/paginas/lista-produtos.ts";
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

  it("o detalhe e o primeiro quadro da lista são iguais para ADM e comum; o botão Novo produto depende do ADM", () => {
    const principal = (html: string) => /<main[^>]*>.*<\/main>/s.exec(html)?.[0] ?? "";
    for (const caminho of ["/produtos", "/produtos/7"]) {
      const paraAdm = renderizar(caminho, sessaoDe(administrador)).html;
      const paraComum = renderizar(caminho, sessaoDe(comum)).html;
      expect(principal(paraAdm), caminho).toBe(principal(paraComum));
    }
    expect(podeCadastrarProduto(administrador)).toBe(true);
    expect(podeCadastrarProduto(comum)).toBe(false);
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

describe("cadastro de produto: rota /produtos/novo", () => {
  it("ADM vê o formulário com os três campos, ajudas, contadores e botões", () => {
    const { html, chamadas } = renderizar("/produtos/novo", sessaoDe(administrador));
    expect(html).toMatch(/<h1[^>]*>Novo produto<\/h1>/);
    expect(html).toContain("Informe os dados do produto para cadastrá-lo no estoque.");
    expect(html).toContain("Administração");
    for (const rotulo of ["Nome", "Descrição", "Quantidade em estoque"]) {
      const forDoRotulo = new RegExp(`<label for="([^"]+)"[^>]*>${rotulo}</label>`).exec(html)?.[1];
      expect(forDoRotulo, rotulo).toBeDefined();
      expect(html, rotulo).toContain(`id="${forDoRotulo ?? ""}"`);
    }
    expect(html).toMatch(/<textarea[^>]*autoComplete="off"|<textarea[^>]*autocomplete="off"/);
    expect(html).toMatch(/<input[^>]*inputMode="numeric"|<input[^>]*inputmode="numeric"/);
    expect(html).not.toContain('type="number"');
    for (const ajuda of ["De 2 a 100 caracteres.", "Até 500 caracteres. Pode ficar em branco.", "Número inteiro de 0 a 1.000.000."]) {
      expect(html).toContain(ajuda);
    }
    expect(html).toContain("0 de 100 caracteres");
    expect(html).toContain("0 de 500 caracteres");
    expect(html).not.toContain("aria-live");
    expect(html).toMatch(/<button type="submit"[^>]*>Cadastrar produto<\/button>/);
    expect(html).toMatch(/href="\/produtos"[^>]*>Cancelar<\/a>/);
    expect(html).not.toContain("aria-invalid");
    expect(html).not.toContain("Corrija os campos destacados.");
    expect(chamadas).toEqual([]);
  });

  it("não cai na página de detalhe nem faz requisição de lerProduto", () => {
    const { html, chamadas } = renderizar("/produtos/novo", sessaoDe(administrador));
    expect(html).not.toContain("Detalhes do produto");
    expect(html).not.toContain("Identificador de produto inválido.");
    expect(chamadas).not.toContain("lerProduto");
  });

  it("usuário comum e visitante não veem o formulário", () => {
    for (const sessao of [sessaoDe(comum), null]) {
      const { html, chamadas } = renderizar("/produtos/novo", sessao);
      expect(html).not.toContain("Novo produto");
      expect(html).not.toContain("<form");
      expect(html).not.toContain("Identificador de produto inválido.");
      expect(chamadas).toEqual([]);
    }
  });
});

describe("lista de produtos: botão Novo produto e aviso", () => {
  function renderizarAcoes(podeCadastrar: boolean): string {
    return renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(AcoesListaProdutos, { recarregando: false, podeCadastrar, aoRecarregar: semAcao }),
      ),
    );
  }

  it("Novo produto aparece só quando pode cadastrar, ao lado de Atualizar lista", () => {
    const comBotao = renderizarAcoes(true);
    expect(comBotao).toContain(">Atualizar lista</button>");
    expect(comBotao).toMatch(/href="\/produtos\/novo"[^>]*>Novo produto<\/a>/);
    const semBotao = renderizarAcoes(false);
    expect(semBotao).toContain(">Atualizar lista</button>");
    expect(semBotao).not.toContain("Novo produto");
  });

  it("com o aviso criado no estado, a lista mostra o texto fixo em role status", () => {
    const { html } = renderizar(
      { pathname: "/produtos", state: { avisoProduto: "criado" } },
      sessaoDe(administrador),
    );
    expect(html).toMatch(/<div role="status"[^>]*>Produto cadastrado com sucesso\.<\/div>/);
  });

  it("sem aviso ou com aviso desconhecido, nada é mostrado", () => {
    for (const state of [null, { avisoProduto: "outro" }, { avisoProduto: "<b>x</b>" }]) {
      const { html } = renderizar({ pathname: "/produtos", state }, sessaoDe(comum));
      expect(html).not.toContain("Produto cadastrado com sucesso.");
      expect(html).not.toContain("&lt;b&gt;");
    }
  });
});

describe("CampoTextoLongo", () => {
  it("renderiza textarea com rótulo, ajuda, erro e contador sem aria-live", () => {
    const html = renderToStaticMarkup(
      createElement(CampoTextoLongo, {
        rotulo: "Descrição",
        valor: "<b>texto</b>",
        aoAlterar: semAcao,
        ajuda: "Ajuda.",
        erro: "Erro do campo.",
        contador: "12 de 500 caracteres",
      }),
    );
    const id = /<label for="([^"]+)"/.exec(html)?.[1] ?? "";
    expect(html).toContain(`<textarea id="${id}"`);
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain(`aria-describedby="${id}-ajuda ${id}-erro"`);
    expect(html).toContain(`<p id="${id}-erro"`);
    expect(html).toContain("&lt;b&gt;texto&lt;/b&gt;");
    expect(html).toContain("12 de 500 caracteres");
    expect(html).not.toContain("aria-live");
  });
});
