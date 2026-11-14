import { describe, expect, it } from "vitest";
import { ehAdministrador } from "../src/contextos/eh-administrador.ts";

const usuario = { id: 1, nome: "Admin", email: "adm@teste.com" };

describe("ehAdministrador", () => {
  it("é verdadeiro somente quando admin é o booleano true", () => {
    expect(ehAdministrador({ ...usuario, admin: true })).toBe(true);
  });

  it("é falso sem usuário", () => {
    expect(ehAdministrador(null)).toBe(false);
    expect(ehAdministrador(undefined)).toBe(false);
  });

  it("é falso para admin false, ausente ou de outro tipo", () => {
    expect(ehAdministrador({ ...usuario, admin: false })).toBe(false);
    expect(ehAdministrador(usuario)).toBe(false);
    for (const admin of ["true", 1, {}, { valor: true }, [], [true], null]) {
      expect(ehAdministrador({ ...usuario, admin })).toBe(false);
    }
  });

  it("não decide por e-mail, id ou nome", () => {
    expect(ehAdministrador({ id: 1, nome: "Admin", email: "adm@teste.com", admin: false })).toBe(false);
    expect(ehAdministrador({ id: 999, nome: "Qualquer", email: "x@y.com", admin: true })).toBe(true);
  });
});
