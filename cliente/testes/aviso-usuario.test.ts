import { describe, expect, it } from "vitest";
import {
  AVISO_USUARIO_ATUALIZADO,
  AVISO_USUARIO_EXCLUIDO,
  AVISO_USUARIO_JA_EXCLUIDO,
  criarEstadoAvisoUsuario,
  criarEstadoAvisoUsuarioAtualizado,
  lerAvisoUsuario,
} from "../src/paginas/aviso-usuario.ts";

describe("aviso de sucesso do usuário", () => {
  it("o estado criado pela edição é lido como o texto fixo", () => {
    expect(criarEstadoAvisoUsuarioAtualizado()).toEqual({ avisoUsuario: "atualizado" });
    expect(lerAvisoUsuario(criarEstadoAvisoUsuarioAtualizado())).toBe(AVISO_USUARIO_ATUALIZADO);
    expect(AVISO_USUARIO_ATUALIZADO).toBe("Usuário atualizado com sucesso.");
  });

  it("os códigos de exclusão mapeiam para os textos fixos", () => {
    expect(criarEstadoAvisoUsuario("excluido")).toEqual({ avisoUsuario: "excluido" });
    expect(lerAvisoUsuario(criarEstadoAvisoUsuario("excluido"))).toBe(
      "Usuário excluído com sucesso.",
    );
    expect(lerAvisoUsuario({ avisoUsuario: "ja_excluido" })).toBe(
      "Esse usuário já havia sido excluído.",
    );
    expect(AVISO_USUARIO_EXCLUIDO).toBe("Usuário excluído com sucesso.");
    expect(AVISO_USUARIO_JA_EXCLUIDO).toBe("Esse usuário já havia sido excluído.");
    expect(lerAvisoUsuario({ avisoUsuario: "atualizado" })).toBe(AVISO_USUARIO_ATUALIZADO);
  });

  it("códigos parecidos, com espaços ou outra caixa, são ignorados", () => {
    for (const codigo of ["Excluido", " excluido", "excluido ", "excluído", "ja-excluido", "hasOwnProperty"]) {
      expect(lerAvisoUsuario({ avisoUsuario: codigo })).toBeNull();
    }
  });

  it("estados inválidos são ignorados", () => {
    const invalidos: unknown[] = [
      null,
      undefined,
      "atualizado",
      42,
      [],
      ["atualizado"],
      {},
      { avisoUsuario: null },
      { avisoUsuario: 1 },
      { avisoUsuario: true },
      { avisoUsuario: "outro" },
      { avisoUsuario: "x".repeat(10000) },
      { avisoUsuario: "<img src=x onerror=alert(1)>" },
      { mensagem: "Usuário atualizado com sucesso." },
      { avisoUsuario: "toString" },
      { avisoUsuario: "__proto__" },
      { avisoUsuario: "constructor" },
    ];
    for (const estado of invalidos) {
      expect(lerAvisoUsuario(estado)).toBeNull();
    }
  });

  it("o texto exibido nunca vem do estado recebido", () => {
    const estado = { avisoUsuario: "atualizado", texto: "<b>injetado</b>" };
    expect(lerAvisoUsuario(estado)).toBe(AVISO_USUARIO_ATUALIZADO);
  });
});
