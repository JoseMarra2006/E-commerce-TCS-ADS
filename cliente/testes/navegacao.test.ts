import { describe, expect, it } from "vitest";
import {
  deveMostrarLinkProdutos,
  deveMostrarLinkUsuarios,
  montarLinksNavegacao,
} from "../src/componentes/navegacao.ts";
import { decidirAcesso } from "../src/rotas/destinos.ts";

const usuario = { id: 1, nome: "Admin", email: "adm@teste.com" };

describe("link Usuários no cabeçalho", () => {
  it("aparece somente para admin true, depois de Produtos", () => {
    expect(deveMostrarLinkUsuarios({ ...usuario, admin: true })).toBe(true);
    expect(montarLinksNavegacao({ ...usuario, admin: true })).toEqual([
      { para: "/produtos", texto: "Produtos" },
      { para: "/usuarios", texto: "Usuários" },
    ]);
  });

  it("não aparece para usuário comum, sem admin ou admin não booleano, que veem só Produtos", () => {
    for (const alvo of [
      { ...usuario, admin: false },
      usuario,
      { ...usuario, admin: "true" },
      { ...usuario, admin: 1 },
    ]) {
      expect(deveMostrarLinkUsuarios(alvo)).toBe(false);
      expect(montarLinksNavegacao(alvo)).toEqual([{ para: "/produtos", texto: "Produtos" }]);
    }
  });

  it("sem sessão não há nenhum link", () => {
    for (const alvo of [null, undefined]) {
      expect(deveMostrarLinkUsuarios(alvo)).toBe(false);
      expect(deveMostrarLinkProdutos(alvo)).toBe(false);
      expect(montarLinksNavegacao(alvo)).toEqual([]);
    }
  });
});

describe("link Produtos no cabeçalho", () => {
  it("aparece para qualquer usuário com sessão", () => {
    for (const alvo of [{ ...usuario, admin: true }, { ...usuario, admin: false }, usuario, {}]) {
      expect(deveMostrarLinkProdutos(alvo)).toBe(true);
      expect(montarLinksNavegacao(alvo)[0]).toEqual({ para: "/produtos", texto: "Produtos" });
    }
  });
});

describe("acesso à rota /usuarios com o requisito admin", () => {
  it("ADM entra, comum vai ao perfil e visitante vai ao login", () => {
    expect(decidirAcesso("admin", true, true, true)).toEqual({ permitido: true });
    expect(decidirAcesso("admin", true, true, false)).toEqual({ permitido: false, destino: "/perfil" });
    expect(decidirAcesso("admin", true, false, false)).toEqual({ permitido: false, destino: "/login" });
  });
});
