import { describe, expect, it } from "vitest";
import {
  lerListaProdutos,
  lerListaUsuarios,
  lerRespostaProduto,
  lerRespostaSessao,
  lerRespostaUsuario,
} from "../src/api/validar-respostas.ts";

const usuario = { id: 5, nome: "Ana Lima", email: "ana@exemplo.com", admin: false };
const produto = { id: 3, nome: "Ingresso pista", descricao: "Show de sábado", quantidade: 10 };

describe("lerRespostaUsuario: campo admin", () => {
  it("somente o booleano true vira true", () => {
    expect(lerRespostaUsuario({ ...usuario, admin: true })).toEqual({ ...usuario, admin: true });
  });

  it("false, ausente e qualquer valor não booleano viram false sem invalidar", () => {
    expect(lerRespostaUsuario({ id: 5, nome: "Ana Lima", email: "ana@exemplo.com" })).toEqual(usuario);
    for (const admin of [false, null, "true", 1, 0, {}, { valor: true }, [], [true]]) {
      expect(lerRespostaUsuario({ ...usuario, admin })).toEqual(usuario);
    }
  });

  it("continua inválida sem nome, sem e-mail ou com id inválido", () => {
    const invalidos: unknown[] = [
      { id: 5, email: "ana@exemplo.com", admin: true },
      { id: 5, nome: "", email: "ana@exemplo.com" },
      { id: 5, nome: "Ana Lima", admin: true },
      { id: 5, nome: "Ana Lima", email: "" },
      { ...usuario, id: 0 },
      { ...usuario, id: -1 },
      { ...usuario, id: 1.5 },
      { ...usuario, id: "abc" },
      { nome: "Ana Lima", email: "ana@exemplo.com" },
      null,
      [],
      "texto",
    ];
    for (const valor of invalidos) {
      expect(lerRespostaUsuario(valor)).toBeNull();
    }
  });

  it("campos extras não aparecem no resultado", () => {
    const lido = lerRespostaUsuario({ ...usuario, admin: true, papel: "administrador", senha: "x" });
    expect(lido).toEqual({ ...usuario, admin: true });
    expect(Object.keys(lido ?? {}).sort()).toEqual(["admin", "email", "id", "nome"]);
  });

  it("o usuário da sessão carrega admin", () => {
    expect(
      lerRespostaSessao({ id: "s", token: "t", usuario: { ...usuario, admin: true } }),
    ).toEqual({ id: "s", token: "t", usuario: { ...usuario, admin: true } });
    expect(
      lerRespostaSessao({ id: "s", token: "t", usuario: { id: 5, nome: "Ana Lima", email: "ana@exemplo.com" } }),
    ).toEqual({ id: "s", token: "t", usuario });
  });
});

describe("lerRespostaProduto", () => {
  it("aceita descricao vazia e id como texto de dígitos", () => {
    expect(lerRespostaProduto({ ...produto, descricao: "" })).toEqual({ ...produto, descricao: "" });
    expect(lerRespostaProduto({ ...produto, id: "3" })).toEqual(produto);
    expect(lerRespostaProduto({ ...produto, quantidade: 0 })).toEqual({ ...produto, quantidade: 0 });
  });

  it("ignora campos extras", () => {
    const lido = lerRespostaProduto({ ...produto, preco: 10, criado_em: "x" });
    expect(lido).toEqual(produto);
    expect(Object.keys(lido ?? {}).sort()).toEqual(["descricao", "id", "nome", "quantidade"]);
  });

  it("id inválido torna a resposta inválida", () => {
    for (const id of [0, -1, 1.5, "abc", undefined]) {
      expect(lerRespostaProduto({ ...produto, id })).toBeNull();
    }
  });

  it("nome inválido torna a resposta inválida", () => {
    for (const nome of ["", 123, undefined]) {
      expect(lerRespostaProduto({ ...produto, nome })).toBeNull();
    }
  });

  it("descricao inválida torna a resposta inválida", () => {
    for (const descricao of [undefined, null, 10]) {
      expect(lerRespostaProduto({ ...produto, descricao })).toBeNull();
    }
  });

  it("quantidade inválida torna a resposta inválida", () => {
    for (const quantidade of ["10", 1.5, -1, null, undefined, true]) {
      expect(lerRespostaProduto({ ...produto, quantidade })).toBeNull();
    }
  });

  it("valor que não é objeto é inválido", () => {
    for (const valor of [null, [], [produto], "texto"]) {
      expect(lerRespostaProduto(valor)).toBeNull();
    }
  });
});

describe("listas de usuários e de produtos", () => {
  it("lista vazia é válida", () => {
    expect(lerListaUsuarios([])).toEqual([]);
    expect(lerListaProdutos([])).toEqual([]);
  });

  it("preserva a ordem recebida, sem ordenar nem deduplicar", () => {
    const produtos = [
      { ...produto, id: 9 },
      { ...produto, id: 2 },
      { ...produto, id: 2 },
    ];
    expect(lerListaProdutos(produtos)).toEqual(produtos);
    const usuarios = [
      { ...usuario, id: 7 },
      { ...usuario, id: 1, admin: true },
      { ...usuario, id: 4 },
    ];
    expect(lerListaUsuarios(usuarios)).toEqual(usuarios);
  });

  it("um item inválido no meio invalida a lista inteira", () => {
    expect(lerListaProdutos([produto, { ...produto, quantidade: "10" }, produto])).toBeNull();
    expect(lerListaUsuarios([usuario, { ...usuario, email: "" }, usuario])).toBeNull();
  });

  it("resposta que não é array é inválida", () => {
    for (const valor of [{}, produto, null, "texto", undefined]) {
      expect(lerListaProdutos(valor)).toBeNull();
      expect(lerListaUsuarios(valor)).toBeNull();
    }
  });

  it("itens de usuário sem admin viram admin false em todos", () => {
    const semAdmin = [
      { id: 1, nome: "Ana Lima", email: "ana@exemplo.com" },
      { id: 2, nome: "Bruno Dias", email: "bruno@exemplo.com", admin: "true" },
      { id: 3, nome: "Carla Reis", email: "carla@exemplo.com", admin: null },
    ];
    expect(lerListaUsuarios(semAdmin)).toEqual([
      { id: 1, nome: "Ana Lima", email: "ana@exemplo.com", admin: false },
      { id: 2, nome: "Bruno Dias", email: "bruno@exemplo.com", admin: false },
      { id: 3, nome: "Carla Reis", email: "carla@exemplo.com", admin: false },
    ]);
  });
});
