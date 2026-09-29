import { assertEquals } from "@std/assert";
import { paraRespostaSessao } from "../src/modulos/sessoes/respostas-sessoes.ts";
import type { SessaoRegistro } from "../src/modulos/sessoes/tipos-sessoes.ts";
import { paraRespostaUsuario } from "../src/modulos/usuarios/respostas-usuarios.ts";
import type { UsuarioRegistro } from "../src/modulos/usuarios/tipos-usuarios.ts";

const usuario: UsuarioRegistro = {
  id: 3,
  nome: "Maria Silva",
  email: "maria@exemplo.com",
  senhaHash: "hash-secreto",
  senhaSalt: "salt-secreto",
  papel: "administrador",
  criadoEm: "2026-01-01T00:00:00.000Z",
  atualizadoEm: "2026-01-02T00:00:00.000Z",
};

const sessao: SessaoRegistro = {
  id: "0b5f7d3e-6c1a-4a53-9a55-1f3f8d0a1b2c",
  usuarioId: 3,
  criadoEm: "2026-01-03T00:00:00.000Z",
};

Deno.test("paraRespostaUsuario retorna exatamente id, nome e email", () => {
  const resposta = paraRespostaUsuario(usuario);
  assertEquals(resposta, {
    id: 3,
    nome: "Maria Silva",
    email: "maria@exemplo.com",
  });
  assertEquals(Object.keys(resposta), ["id", "nome", "email"]);
});

Deno.test("paraRespostaUsuario não vaza campos internos", () => {
  const json = JSON.stringify(paraRespostaUsuario(usuario)).toLowerCase();
  for (const proibido of ["senha", "salt", "papel", "criado", "atualizado"]) {
    assertEquals(json.includes(proibido), false);
  }
});

Deno.test("paraRespostaSessao retorna exatamente id, token e usuario", () => {
  const resposta = paraRespostaSessao(sessao, "token-jwt", usuario);
  assertEquals(resposta, {
    id: sessao.id,
    token: "token-jwt",
    usuario: { id: 3, nome: "Maria Silva", email: "maria@exemplo.com" },
  });
  assertEquals(Object.keys(resposta), ["id", "token", "usuario"]);
  assertEquals(Object.keys(resposta.usuario), ["id", "nome", "email"]);
  const json = JSON.stringify(resposta).toLowerCase();
  for (const proibido of ["senha", "salt", "papel"]) {
    assertEquals(json.includes(proibido), false);
  }
});
