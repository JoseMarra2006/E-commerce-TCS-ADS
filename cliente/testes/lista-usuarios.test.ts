import { describe, expect, it } from "vitest";
import {
  ESTADO_INICIAL_LISTA_USUARIOS,
  montarLinhasUsuarios,
  reduzirListaUsuarios,
  rotularTipoUsuario,
  textoContadorUsuarios,
} from "../src/paginas/lista-usuarios.ts";
import type { EstadoListaUsuarios } from "../src/paginas/lista-usuarios.ts";

const ana = { id: 2, nome: "Ana Lima", email: "ana@exemplo.com", admin: false };
const admin = { id: 1, nome: "Admin", email: "adm@teste.com", admin: true };
const bruno = { id: 7, nome: "Bruno Dias", email: "bruno@exemplo.com", admin: false };

describe("rotularTipoUsuario", () => {
  it("Administrador somente para admin true", () => {
    expect(rotularTipoUsuario(true)).toBe("Administrador");
    expect(rotularTipoUsuario(false)).toBe("Comum");
  });
});

describe("montarLinhasUsuarios", () => {
  it("preserva a ordem recebida e rotula o tipo", () => {
    const linhas = montarLinhasUsuarios([bruno, admin, ana], 1);
    expect(linhas.map((linha) => linha.id)).toEqual([7, 1, 2]);
    expect(linhas.map((linha) => linha.tipo)).toEqual(["Comum", "Administrador", "Comum"]);
    expect(linhas.map((linha) => linha.administrador)).toEqual([false, true, false]);
  });

  it("marca Você somente na linha do id da sessão", () => {
    const linhas = montarLinhasUsuarios([admin, ana, bruno], 2);
    expect(linhas.map((linha) => linha.ehVoce)).toEqual([false, true, false]);
  });

  it("nome e e-mail iguais em outra linha não recebem o marcador", () => {
    const copia = { ...ana, id: 9 };
    const linhas = montarLinhasUsuarios([ana, copia], 2);
    expect(linhas.map((linha) => linha.ehVoce)).toEqual([true, false]);
  });

  it("sem id de sessão ou com id ausente da lista, ninguém é marcado", () => {
    expect(montarLinhasUsuarios([admin, ana], null).some((linha) => linha.ehVoce)).toBe(false);
    expect(montarLinhasUsuarios([admin, ana], 99).some((linha) => linha.ehVoce)).toBe(false);
  });

  it("mantém nome e e-mail como texto, sem interpretar HTML", () => {
    const hostil = { ...bruno, nome: "<img src=x onerror=alert(1)>" };
    expect(montarLinhasUsuarios([hostil], null)[0]?.nome).toBe("<img src=x onerror=alert(1)>");
  });

  it("outras linhas recebem o caminho de detalhes e a própria linha não", () => {
    const linhas = montarLinhasUsuarios([admin, ana, bruno], 1);
    expect(linhas.map((linha) => linha.caminhoDetalhe)).toEqual([
      null,
      "/usuarios/2",
      "/usuarios/7",
    ]);
  });

  it("o caminho de detalhes usa só o id, mesmo com nome ou e-mail hostis", () => {
    const hostil = { ...bruno, nome: "../../perfil", email: "a/b@c.com" };
    expect(montarLinhasUsuarios([hostil], 1)[0]?.caminhoDetalhe).toBe("/usuarios/7");
  });

  it("lista vazia gera nenhuma linha", () => {
    expect(montarLinhasUsuarios([], 1)).toEqual([]);
  });
});

describe("textoContadorUsuarios", () => {
  it("singular e plural", () => {
    expect(textoContadorUsuarios(0)).toBe("0 usuários cadastrados");
    expect(textoContadorUsuarios(1)).toBe("1 usuário cadastrado");
    expect(textoContadorUsuarios(2)).toBe("2 usuários cadastrados");
    expect(textoContadorUsuarios(150)).toBe("150 usuários cadastrados");
  });
});

describe("reduzirListaUsuarios", () => {
  const sucesso: EstadoListaUsuarios = { fase: "sucesso", usuarios: [admin] };
  const erro: EstadoListaUsuarios = { fase: "erro", mensagem: "Falhou." };

  it("começa carregando", () => {
    expect(ESTADO_INICIAL_LISTA_USUARIOS).toEqual({ fase: "carregando" });
  });

  it("recebido leva ao sucesso a partir de qualquer fase", () => {
    for (const estado of [ESTADO_INICIAL_LISTA_USUARIOS, sucesso, erro]) {
      expect(reduzirListaUsuarios(estado, { tipo: "recebido", usuarios: [ana] })).toEqual({
        fase: "sucesso",
        usuarios: [ana],
      });
    }
  });

  it("falhou leva ao erro com a mensagem", () => {
    expect(reduzirListaUsuarios(sucesso, { tipo: "falhou", mensagem: "Sem rede." })).toEqual({
      fase: "erro",
      mensagem: "Sem rede.",
    });
  });

  it("recarregar durante o sucesso mantém os dados e marca recarregando", () => {
    const recarregando = reduzirListaUsuarios(sucesso, { tipo: "recarregar" });
    expect(recarregando).toEqual({ fase: "recarregando", usuarios: [admin] });
    expect(reduzirListaUsuarios(recarregando, { tipo: "recarregar" })).toEqual(recarregando);
    expect(reduzirListaUsuarios(recarregando, { tipo: "recebido", usuarios: [admin, ana] }))
      .toEqual({ fase: "sucesso", usuarios: [admin, ana] });
    expect(reduzirListaUsuarios(recarregando, { tipo: "falhou", mensagem: "Erro." })).toEqual({
      fase: "erro",
      mensagem: "Erro.",
    });
  });

  it("erro seguido de nova tentativa volta a carregar e pode terminar em sucesso", () => {
    const carregando = reduzirListaUsuarios(erro, { tipo: "recarregar" });
    expect(carregando).toEqual({ fase: "carregando" });
    expect(reduzirListaUsuarios(carregando, { tipo: "recebido", usuarios: [] })).toEqual({
      fase: "sucesso",
      usuarios: [],
    });
  });

  it("recarregar enquanto carrega continua carregando", () => {
    expect(reduzirListaUsuarios(ESTADO_INICIAL_LISTA_USUARIOS, { tipo: "recarregar" })).toEqual({
      fase: "carregando",
    });
  });
});
