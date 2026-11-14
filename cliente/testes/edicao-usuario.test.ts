import { describe, expect, it } from "vitest";
import type { ResultadoOperacao } from "../src/api/operacoes.ts";
import { caminhoDetalheUsuario, caminhoEdicaoUsuario } from "../src/paginas/caminhos-usuarios.ts";
import {
  decidirDestinoDetalhe,
  EXPLICACAO_NAO_ENCONTRADO,
  MENSAGEM_FORA_PROTOCOLO,
} from "../src/paginas/detalhe-usuario.ts";
import {
  calcularAlteracoes,
  criarEstadoEdicaoUsuario,
  MENSAGEM_EMAIL_EM_USO,
  MENSAGEM_NADA_ALTERADO,
  podeEnviar,
  primeiroCampoInvalido,
  reduzirEdicaoUsuario,
  validarEdicaoUsuario,
} from "../src/paginas/edicao-usuario.ts";
import type { EstadoEdicaoUsuario, ValoresEdicaoUsuario } from "../src/paginas/edicao-usuario.ts";
import type { RespostaUsuario } from "../src/tipos/protocolo.ts";
import { validarEmail, validarNome, validarSenha } from "../src/validacao/validacao-campos.ts";

const PADRAO_404 = "Recurso não encontrado no servidor.";
const atual: RespostaUsuario = { id: 7, nome: "Bruno Dias", email: "bruno@exemplo.com", admin: false };
const iguais: ValoresEdicaoUsuario = { nome: "Bruno Dias", email: "bruno@exemplo.com", senha: "" };

type Falha = Extract<ResultadoOperacao<RespostaUsuario>, { ok: false }>;

function falha(tipo: Falha["tipo"], status: number | null, mensagem: string): Falha {
  return { ok: false, tipo, status, mensagem };
}

function pronto(): EstadoEdicaoUsuario {
  return reduzirEdicaoUsuario(criarEstadoEdicaoUsuario(7), {
    tipo: "carregado",
    id: 7,
    usuario: atual,
  });
}

function salvando(valores: Partial<ValoresEdicaoUsuario> = {}): EstadoEdicaoUsuario {
  let estado = pronto();
  for (const [campo, valor] of Object.entries(valores) as Array<[keyof ValoresEdicaoUsuario, string]>) {
    estado = reduzirEdicaoUsuario(estado, { tipo: "alterar", id: 7, campo, valor });
  }
  return reduzirEdicaoUsuario(estado, { tipo: "salvar", id: 7 });
}

describe("calcularAlteracoes", () => {
  it("nada mudou, inclusive só com espaços nas pontas", () => {
    expect(calcularAlteracoes(atual, iguais)).toBeNull();
    expect(calcularAlteracoes(atual, { nome: "  Bruno Dias ", email: " bruno@exemplo.com ", senha: "" }))
      .toBeNull();
  });

  it("cada campo isolado e combinações", () => {
    expect(calcularAlteracoes(atual, { ...iguais, nome: "Bruno Novo" })).toEqual({ nome: "Bruno Novo" });
    expect(calcularAlteracoes(atual, { ...iguais, email: "b@novo.com" })).toEqual({ email: "b@novo.com" });
    expect(calcularAlteracoes(atual, { ...iguais, senha: "abc123" })).toEqual({ senha: "abc123" });
    expect(
      calcularAlteracoes(atual, { nome: " Bruno Novo ", email: "b@novo.com", senha: "abc123" }),
    ).toEqual({ nome: "Bruno Novo", email: "b@novo.com", senha: "abc123" });
  });

  it("mudança só de maiúsculas no e-mail conta como alteração", () => {
    expect(calcularAlteracoes(atual, { ...iguais, email: "Bruno@Exemplo.com" })).toEqual({
      email: "Bruno@Exemplo.com",
    });
  });

  it("campos vazios contam como alteração de nome e e-mail, e senha vazia não", () => {
    expect(calcularAlteracoes(atual, { nome: "", email: "", senha: "" })).toEqual({
      nome: "",
      email: "",
    });
  });
});

describe("validarEdicaoUsuario", () => {
  it("nada alterado não gera requisição", () => {
    expect(validarEdicaoUsuario(iguais, atual)).toEqual({ ok: false, nadaAlterado: true });
  });

  it("nome nos limites", () => {
    for (const [tamanho, valido] of [[2, false], [3, true], [50, true], [51, false]] as const) {
      const nome = "a".repeat(tamanho);
      const resultado = validarEdicaoUsuario({ ...iguais, nome }, atual);
      if (valido) {
        expect(resultado).toEqual({ ok: true, dados: { nome } });
      } else {
        const esperado = validarNome(nome);
        expect(esperado.ok).toBe(false);
        expect(resultado).toEqual({
          ok: false,
          erros: { nome: esperado.ok ? "" : esperado.mensagem },
        });
      }
    }
  });

  it("e-mail nos limites e no padrão, aparado antes de validar", () => {
    const valido5 = "a@b.c";
    const valido30 = `${"a".repeat(24)}@b.com`;
    expect(valido30.length).toBe(30);
    expect(validarEdicaoUsuario({ ...iguais, email: valido5 }, atual)).toEqual({
      ok: true,
      dados: { email: valido5 },
    });
    expect(validarEdicaoUsuario({ ...iguais, email: ` ${valido30} ` }, atual)).toEqual({
      ok: true,
      dados: { email: valido30 },
    });
    for (const email of ["a@b.", `${"a".repeat(25)}@b.com`, "semarroba.com", "a@b"]) {
      const esperado = validarEmail(email);
      expect(esperado.ok).toBe(false);
      expect(validarEdicaoUsuario({ ...iguais, email }, atual)).toEqual({
        ok: false,
        erros: { email: esperado.ok ? "" : esperado.mensagem },
      });
    }
  });

  it("senha nos limites, caracteres inválidos e vazia permitida", () => {
    expect(validarEdicaoUsuario({ ...iguais, senha: "abc123" }, atual).ok).toBe(true);
    expect(validarEdicaoUsuario({ ...iguais, senha: "a".repeat(20) }, atual).ok).toBe(true);
    for (const senha of ["abc12", "a".repeat(21), "abc 123", "abç123", "abc-123"]) {
      const esperado = validarSenha(senha);
      expect(esperado.ok).toBe(false);
      expect(validarEdicaoUsuario({ ...iguais, senha }, atual)).toEqual({
        ok: false,
        erros: { senha: esperado.ok ? "" : esperado.mensagem },
      });
    }
    expect(validarEdicaoUsuario({ ...iguais, nome: "Outro Nome", senha: "" }, atual)).toEqual({
      ok: true,
      dados: { nome: "Outro Nome" },
    });
  });

  it("erros em vários campos e ordem do foco", () => {
    const resultado = validarEdicaoUsuario({ nome: "a", email: "x", senha: "1" }, atual);
    expect(resultado.ok).toBe(false);
    const erros = !resultado.ok && "erros" in resultado ? resultado.erros : {};
    expect(Object.keys(erros).sort()).toEqual(["email", "nome", "senha"]);
    expect(primeiroCampoInvalido(erros)).toBe("nome");
    expect(primeiroCampoInvalido({ email: "x", senha: "y" })).toBe("email");
    expect(primeiroCampoInvalido({ senha: "y" })).toBe("senha");
    expect(primeiroCampoInvalido({})).toBeNull();
  });
});

describe("reduzirEdicaoUsuario", () => {
  it("carregando para pronto com os dados atuais e a senha vazia", () => {
    expect(pronto()).toEqual({
      fase: "pronto",
      id: 7,
      atual,
      valores: { nome: "Bruno Dias", email: "bruno@exemplo.com", senha: "" },
      aviso: null,
    });
  });

  it("carregamento com id diferente é fora do protocolo e 404 é não encontrado", () => {
    expect(
      reduzirEdicaoUsuario(criarEstadoEdicaoUsuario(7), {
        tipo: "carregado",
        id: 7,
        usuario: { ...atual, id: 9 },
      }),
    ).toEqual({ fase: "falha_carregamento", id: 7, mensagem: MENSAGEM_FORA_PROTOCOLO });
    expect(
      reduzirEdicaoUsuario(criarEstadoEdicaoUsuario(7), {
        tipo: "falha_carregamento",
        id: 7,
        falha: falha("http", 404, PADRAO_404),
        mensagemPadrao404: PADRAO_404,
      }),
    ).toEqual({ fase: "nao_encontrado", id: 7, explicacao: EXPLICACAO_NAO_ENCONTRADO });
    expect(
      reduzirEdicaoUsuario(criarEstadoEdicaoUsuario(7), {
        tipo: "falha_carregamento",
        id: 7,
        falha: falha("rede", null, "Sem rede."),
      }),
    ).toEqual({ fase: "falha_carregamento", id: 7, mensagem: "Sem rede." });
  });

  it("salvando para concluído", () => {
    const estado = salvando({ nome: "Bruno Novo" });
    expect(estado.fase).toBe("salvando");
    const novo = { ...atual, nome: "Bruno Novo" };
    expect(reduzirEdicaoUsuario(estado, { tipo: "salvo", id: 7, usuario: novo })).toEqual({
      fase: "concluido",
      id: 7,
      usuario: novo,
    });
  });

  it("resposta salva com id diferente vira erro fora do protocolo preservando os valores", () => {
    const estado = reduzirEdicaoUsuario(salvando({ nome: "Bruno Novo" }), {
      tipo: "salvo",
      id: 7,
      usuario: { ...atual, id: 8 },
    });
    expect(estado).toMatchObject({
      fase: "erro_geral",
      mensagem: MENSAGEM_FORA_PROTOCOLO,
      valores: { nome: "Bruno Novo" },
    });
  });

  it("409 vira erro de campo no e-mail sem perder os valores", () => {
    const estado = reduzirEdicaoUsuario(salvando({ email: "ocupado@x.com", senha: "abc123" }), {
      tipo: "falha_salvar",
      id: 7,
      falha: falha("http", 409, "E-mail já cadastrado."),
    });
    expect(estado).toEqual({
      fase: "erro_campo",
      id: 7,
      atual,
      valores: { nome: "Bruno Dias", email: "ocupado@x.com", senha: "abc123" },
      erros: { email: MENSAGEM_EMAIL_EM_USO },
    });
  });

  it("400 e outros erros viram erro geral com os valores preservados", () => {
    const falhas = [
      falha("http", 400, "O campo nome deve ter entre 3 e 50 caracteres."),
      falha("http", 403, "Sem permissão."),
      falha("http", 500, "Erro interno no servidor."),
      falha("rede", null, "Sem rede."),
      falha("fora_protocolo", 200, MENSAGEM_FORA_PROTOCOLO),
      falha("entrada_invalida", null, "O identificador informado é inválido."),
    ];
    for (const f of falhas) {
      expect(
        reduzirEdicaoUsuario(salvando({ nome: "Bruno Novo" }), {
          tipo: "falha_salvar",
          id: 7,
          falha: f,
        }),
      ).toMatchObject({ fase: "erro_geral", mensagem: f.mensagem, valores: { nome: "Bruno Novo" } });
    }
  });

  it("404 ao salvar vira não encontrado", () => {
    expect(
      reduzirEdicaoUsuario(salvando({ nome: "Bruno Novo" }), {
        tipo: "falha_salvar",
        id: 7,
        falha: falha("http", 404, "Usuário não encontrado."),
        mensagemPadrao404: PADRAO_404,
      }),
    ).toEqual({ fase: "nao_encontrado", id: 7, explicacao: "Usuário não encontrado." });
  });

  it("ação de outro id é ignorada", () => {
    const estado = salvando({ nome: "Bruno Novo" });
    for (
      const acao of [
        { tipo: "salvo", id: 8, usuario: atual },
        { tipo: "falha_salvar", id: 8, falha: falha("http", 409, "x") },
        { tipo: "alterar", id: 8, campo: "nome", valor: "y" },
        { tipo: "carregado", id: 8, usuario: atual },
      ] as const
    ) {
      expect(reduzirEdicaoUsuario(estado, acao)).toBe(estado);
    }
  });

  it("erro de campo some ao corrigir o campo e permite reenviar", () => {
    const comErro = reduzirEdicaoUsuario(pronto(), {
      tipo: "invalido",
      id: 7,
      erros: { nome: "Nome inválido.", email: "E-mail inválido." },
    });
    expect(podeEnviar(comErro)).toBe(true);
    const semNome = reduzirEdicaoUsuario(comErro, { tipo: "alterar", id: 7, campo: "nome", valor: "Bruno Novo" });
    expect(semNome).toMatchObject({ fase: "erro_campo", erros: { email: "E-mail inválido." } });
    const corrigido = reduzirEdicaoUsuario(semNome, {
      tipo: "alterar",
      id: 7,
      campo: "email",
      valor: "b@novo.com",
    });
    expect(corrigido).toMatchObject({
      fase: "pronto",
      aviso: null,
      valores: { nome: "Bruno Novo", email: "b@novo.com" },
    });
    expect(reduzirEdicaoUsuario(corrigido, { tipo: "salvar", id: 7 }).fase).toBe("salvando");
  });

  it("reenvio depois de erro geral volta a salvar", () => {
    const erro = reduzirEdicaoUsuario(salvando({ nome: "Bruno Novo" }), {
      tipo: "falha_salvar",
      id: 7,
      falha: falha("rede", null, "Sem rede."),
    });
    expect(podeEnviar(erro)).toBe(true);
    expect(reduzirEdicaoUsuario(erro, { tipo: "salvar", id: 7 })).toMatchObject({
      fase: "salvando",
      valores: { nome: "Bruno Novo" },
    });
  });

  it("enquanto salva, não há novo envio, alteração nem aviso", () => {
    const estado = salvando({ nome: "Bruno Novo" });
    expect(podeEnviar(estado)).toBe(false);
    expect(reduzirEdicaoUsuario(estado, { tipo: "salvar", id: 7 })).toBe(estado);
    expect(reduzirEdicaoUsuario(estado, { tipo: "alterar", id: 7, campo: "nome", valor: "x" }))
      .toBe(estado);
    expect(reduzirEdicaoUsuario(estado, { tipo: "sem_alteracao", id: 7 })).toBe(estado);
    expect(podeEnviar(criarEstadoEdicaoUsuario(7))).toBe(false);
  });

  it("sem alteração mostra o aviso e digitar o apaga", () => {
    const comAviso = reduzirEdicaoUsuario(pronto(), { tipo: "sem_alteracao", id: 7 });
    expect(comAviso).toMatchObject({ fase: "pronto", aviso: MENSAGEM_NADA_ALTERADO });
    expect(reduzirEdicaoUsuario(comAviso, { tipo: "alterar", id: 7, campo: "senha", valor: "a" }))
      .toMatchObject({ fase: "pronto", aviso: null });
  });
});

describe("destino e caminhos da edição", () => {
  it("reaproveita a decisão do detalhe", () => {
    expect(decidirDestinoDetalhe("x7", 1)).toEqual({ tipo: "invalido" });
    expect(decidirDestinoDetalhe("0001", 1)).toEqual({ tipo: "perfil" });
    expect(decidirDestinoDetalhe("7", 1)).toEqual({ tipo: "carregar", id: 7 });
  });

  it("caminhoEdicaoUsuario monta só com o id numérico", () => {
    expect(caminhoEdicaoUsuario(7)).toBe("/usuarios/7/editar");
    expect(caminhoEdicaoUsuario(9007199254740991)).toBe("/usuarios/9007199254740991/editar");
    expect(caminhoEdicaoUsuario(7).startsWith(caminhoDetalheUsuario(7))).toBe(true);
  });
});
