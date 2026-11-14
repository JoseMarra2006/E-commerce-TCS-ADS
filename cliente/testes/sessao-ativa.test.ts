import { describe, expect, it } from "vitest";
import { criarSessaoAtiva, substituirUsuarioDaSessao } from "../src/contextos/sessao-ativa.ts";

const administrador = { id: 1, nome: "Admin", email: "adm@teste.com", admin: true };

describe("sessão ativa", () => {
  it("o login guarda o usuário da resposta com admin true", () => {
    expect(criarSessaoAtiva({ id: "s1", token: "jwt", usuario: administrador })).toEqual({
      token: "jwt",
      idSessao: "s1",
      usuario: administrador,
    });
  });

  it("o login de usuário comum guarda admin false", () => {
    const comum = { ...administrador, id: 2, admin: false };
    expect(criarSessaoAtiva({ id: "s2", token: "jwt", usuario: comum }).usuario.admin).toBe(false);
  });

  it("atualizar o próprio cadastro troca o usuário e preserva admin", () => {
    const sessao = criarSessaoAtiva({ id: "s1", token: "jwt", usuario: administrador });
    const atualizado = { ...administrador, nome: "Admin Novo" };
    expect(substituirUsuarioDaSessao(sessao, atualizado)).toEqual({
      token: "jwt",
      idSessao: "s1",
      usuario: { id: 1, nome: "Admin Novo", email: "adm@teste.com", admin: true },
    });
  });

  it("sem sessão, atualizar o usuário não cria sessão", () => {
    expect(substituirUsuarioDaSessao(null, administrador)).toBeNull();
  });
});
