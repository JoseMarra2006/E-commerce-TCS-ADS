import { describe, expect, it } from "vitest";
import { lerEstadoLogin, lerEstadoPerfil } from "../src/paginas/estado-navegacao.ts";

describe("lerEstadoLogin", () => {
  it("ignora valores que não são objeto", () => {
    for (const valor of [undefined, null, "texto", 12, [], true]) {
      expect(lerEstadoLogin(valor)).toEqual({});
    }
  });

  it("aceita objeto vazio", () => {
    expect(lerEstadoLogin({})).toEqual({});
  });

  it("lê somente e-mail, somente mensagem ou os dois", () => {
    expect(lerEstadoLogin({ email: "a@b.com" })).toEqual({ email: "a@b.com" });
    expect(lerEstadoLogin({ mensagem: "Olá" })).toEqual({ mensagem: "Olá" });
    expect(lerEstadoLogin({ email: "a@b.com", mensagem: "Olá" })).toEqual({
      email: "a@b.com",
      mensagem: "Olá",
    });
  });

  it("ignora campos com tipo diferente e campos extras", () => {
    expect(lerEstadoLogin({ email: 5, mensagem: "Olá" })).toEqual({ mensagem: "Olá" });
    expect(lerEstadoLogin({ email: "a@b.com", mensagem: null })).toEqual({ email: "a@b.com" });
    expect(lerEstadoLogin({ email: "a@b.com", outro: "x", senha: "y" })).toEqual({
      email: "a@b.com",
    });
  });
});

describe("lerEstadoPerfil", () => {
  it("ignora valores que não são objeto", () => {
    for (const valor of [undefined, null, "texto", 12, [], true]) {
      expect(lerEstadoPerfil(valor)).toEqual({});
    }
  });

  it("lê somente a mensagem textual", () => {
    expect(lerEstadoPerfil({})).toEqual({});
    expect(lerEstadoPerfil({ mensagem: "Cadastro atualizado." })).toEqual({
      mensagem: "Cadastro atualizado.",
    });
    expect(lerEstadoPerfil({ mensagem: 5 })).toEqual({});
    expect(lerEstadoPerfil({ email: "a@b.com", mensagem: "Olá", outro: 1 })).toEqual({
      mensagem: "Olá",
    });
  });
});
