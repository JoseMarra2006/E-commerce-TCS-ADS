import { describe, expect, it } from "vitest";
import { deveMostrarLinkUsuarios, montarLinksNavegacao } from "../src/componentes/navegacao.ts";
import { decidirAcesso } from "../src/rotas/destinos.ts";

const usuario = { id: 1, nome: "Admin", email: "adm@teste.com" };

describe("link Usuários no cabeçalho", () => {
  it("aparece somente para admin true", () => {
    expect(deveMostrarLinkUsuarios({ ...usuario, admin: true })).toBe(true);
    expect(montarLinksNavegacao({ ...usuario, admin: true })).toEqual([
      { para: "/usuarios", texto: "Usuários" },
    ]);
  });

  it("não aparece para usuário comum, sem admin, admin não booleano ou sem sessão", () => {
    for (const alvo of [
      { ...usuario, admin: false },
      usuario,
      { ...usuario, admin: "true" },
      { ...usuario, admin: 1 },
      null,
      undefined,
    ]) {
      expect(deveMostrarLinkUsuarios(alvo)).toBe(false);
      expect(montarLinksNavegacao(alvo)).toEqual([]);
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
