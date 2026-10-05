import { describe, expect, it } from "vitest";
import { decidirAcesso, decidirDestinoInicial } from "../src/rotas/destinos.ts";

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
