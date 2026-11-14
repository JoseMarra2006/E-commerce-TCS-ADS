import { describe, expect, it } from "vitest";
import { matchRoutes } from "react-router";
import { decidirAcesso, decidirDestinoInicial } from "../src/rotas/destinos.ts";
import type { DecisaoAcesso, RequisitoAcesso } from "../src/rotas/destinos.ts";

describe("decidirDestinoInicial", () => {
  it("sem conexão vai para a conexão, com ou sem sessão", () => {
    expect(decidirDestinoInicial(false, false)).toBe("/conexao");
    expect(decidirDestinoInicial(false, true)).toBe("/conexao");
  });

  it("com conexão decide entre login e perfil", () => {
    expect(decidirDestinoInicial(true, false)).toBe("/login");
    expect(decidirDestinoInicial(true, true)).toBe("/perfil");
  });
});

describe("decidirAcesso", () => {
  it("requisito sessao", () => {
    expect(decidirAcesso("sessao", false, false)).toEqual({ permitido: false, destino: "/conexao" });
    expect(decidirAcesso("sessao", false, true)).toEqual({ permitido: false, destino: "/conexao" });
    expect(decidirAcesso("sessao", true, false)).toEqual({ permitido: false, destino: "/login" });
    expect(decidirAcesso("sessao", true, true)).toEqual({ permitido: true });
  });

  it("requisito sem_sessao", () => {
    expect(decidirAcesso("sem_sessao", false, false)).toEqual({
      permitido: false,
      destino: "/conexao",
    });
    expect(decidirAcesso("sem_sessao", false, true)).toEqual({
      permitido: false,
      destino: "/conexao",
    });
    expect(decidirAcesso("sem_sessao", true, false)).toEqual({ permitido: true });
    expect(decidirAcesso("sem_sessao", true, true)).toEqual({ permitido: false, destino: "/perfil" });
  });
});

describe("decidirAcesso com o requisito admin", () => {
  const permitir: DecisaoAcesso = { permitido: true };
  const login: DecisaoAcesso = { permitido: false, destino: "/login" };
  const perfil: DecisaoAcesso = { permitido: false, destino: "/perfil" };
  const tabela: Array<[RequisitoAcesso, DecisaoAcesso, DecisaoAcesso, DecisaoAcesso]> = [
    ["sessao", login, permitir, permitir],
    ["sem_sessao", permitir, perfil, perfil],
    ["admin", login, perfil, permitir],
  ];

  for (const [requisito, semSessao, sessaoComum, sessaoAdm] of tabela) {
    it(`requisito ${requisito}: sem sessão, usuário comum e ADM`, () => {
      expect(decidirAcesso(requisito, true, false, false)).toEqual(semSessao);
      expect(decidirAcesso(requisito, true, true, false)).toEqual(sessaoComum);
      expect(decidirAcesso(requisito, true, true, true)).toEqual(sessaoAdm);
    });
  }

  it("sem conexão, o requisito admin também leva à conexão", () => {
    expect(decidirAcesso("admin", false, false, false)).toEqual({ permitido: false, destino: "/conexao" });
    expect(decidirAcesso("admin", false, true, true)).toEqual({ permitido: false, destino: "/conexao" });
  });

  it("sem a informação de administrador, admin é negado e os outros requisitos não mudam", () => {
    expect(decidirAcesso("admin", true, true)).toEqual(perfil);
    expect(decidirAcesso("sessao", true, true)).toEqual(permitir);
    expect(decidirAcesso("sem_sessao", true, true)).toEqual(perfil);
  });
});

describe("casamento de rotas com segmento fixo e parâmetro", () => {
  const rotas = [
    { path: "/produtos/:id" },
    { path: "/produtos/:id/editar" },
    { path: "/produtos/novo" },
    { path: "/usuarios/:id" },
  ];

  function rotaCasada(caminho: string): string | undefined {
    return matchRoutes(rotas, caminho)?.at(-1)?.route.path;
  }

  it("/produtos/novo não casa com /produtos/:id, em qualquer ordem de declaração", () => {
    expect(rotaCasada("/produtos/novo")).toBe("/produtos/novo");
    expect(matchRoutes([...rotas].reverse(), "/produtos/novo")?.at(-1)?.route.path).toBe("/produtos/novo");
  });

  it("ids continuam casando com o parâmetro", () => {
    expect(rotaCasada("/produtos/7")).toBe("/produtos/:id");
    expect(rotaCasada("/produtos/7/editar")).toBe("/produtos/:id/editar");
    expect(rotaCasada("/usuarios/3")).toBe("/usuarios/:id");
  });
});
