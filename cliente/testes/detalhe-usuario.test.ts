import { describe, expect, it } from "vitest";
import type { ResultadoOperacao } from "../src/api/operacoes.ts";
import { caminhoDetalheUsuario } from "../src/paginas/caminhos-usuarios.ts";
import {
  criarEstadoDetalheUsuario,
  decidirDestinoDetalhe,
  EXPLICACAO_NAO_ENCONTRADO,
  interpretarIdRota,
  MENSAGEM_FORA_PROTOCOLO,
  montarItensDetalheUsuario,
  reduzirDetalheUsuario,
  textoSituacaoDetalhe,
} from "../src/paginas/detalhe-usuario.ts";
import type { RespostaUsuario } from "../src/tipos/protocolo.ts";

const PADRAO_404 = "Recurso não encontrado no servidor.";
const bruno: RespostaUsuario = {
  id: 7,
  nome: "Bruno Dias",
  email: "bruno@exemplo.com",
  admin: false,
};
const admin: RespostaUsuario = { id: 1, nome: "Admin", email: "adm@teste.com", admin: true };

type Falha = Extract<ResultadoOperacao<RespostaUsuario>, { ok: false }>;

function falha(tipo: Falha["tipo"], status: number | null, mensagem: string): Falha {
  return { ok: false, tipo, status, mensagem };
}

describe("interpretarIdRota", () => {
  it("aceita só dígitos ASCII que formam inteiro seguro positivo", () => {
    expect(interpretarIdRota("1")).toBe(1);
    expect(interpretarIdRota("42")).toBe(42);
    expect(interpretarIdRota("9007199254740991")).toBe(9007199254740991);
    expect(interpretarIdRota("007")).toBe(7);
  });

  it("recusa qualquer outra forma", () => {
    const invalidos = [
      "0",
      "000",
      "-1",
      "+1",
      "1.5",
      "1e3",
      " 7",
      "7 ",
      "07x",
      "abc",
      "",
      "9007199254740992",
      "٣",
      "７",
      "0x10",
      undefined,
    ];
    for (const texto of invalidos) {
      expect(interpretarIdRota(texto), String(texto)).toBeNull();
    }
  });
});

describe("decidirDestinoDetalhe", () => {
  it("id inválido não carrega", () => {
    expect(decidirDestinoDetalhe("abc", 1)).toEqual({ tipo: "invalido" });
    expect(decidirDestinoDetalhe(undefined, 1)).toEqual({ tipo: "invalido" });
  });

  it("o próprio id da sessão leva ao perfil, inclusive com zeros à esquerda", () => {
    expect(decidirDestinoDetalhe("1", 1)).toEqual({ tipo: "perfil" });
    expect(decidirDestinoDetalhe("001", 1)).toEqual({ tipo: "perfil" });
  });

  it("id de outro usuário carrega", () => {
    expect(decidirDestinoDetalhe("7", 1)).toEqual({ tipo: "carregar", id: 7 });
  });
});

describe("reduzirDetalheUsuario", () => {
  const carregando = criarEstadoDetalheUsuario(7);

  it("carregando para sucesso", () => {
    expect(carregando).toEqual({ fase: "carregando", id: 7 });
    expect(reduzirDetalheUsuario(carregando, { tipo: "recebido", id: 7, usuario: bruno }))
      .toEqual({ fase: "sucesso", id: 7, usuario: bruno });
  });

  it("404 vira estado próprio, com a mensagem do servidor ou a explicação fixa", () => {
    expect(
      reduzirDetalheUsuario(carregando, {
        tipo: "falhou",
        id: 7,
        falha: falha("http", 404, "Usuário inexistente neste servidor."),
        mensagemPadrao404: PADRAO_404,
      }),
    ).toEqual({
      fase: "nao_encontrado",
      id: 7,
      explicacao: "Usuário inexistente neste servidor.",
    });
    expect(
      reduzirDetalheUsuario(carregando, {
        tipo: "falhou",
        id: 7,
        falha: falha("http", 404, PADRAO_404),
        mensagemPadrao404: PADRAO_404,
      }),
    ).toEqual({ fase: "nao_encontrado", id: 7, explicacao: EXPLICACAO_NAO_ENCONTRADO });
  });

  it("outros erros viram erro com a mensagem", () => {
    const falhas = [
      falha("http", 403, "Você não tem permissão."),
      falha("http", 500, "Erro interno no servidor."),
      falha("rede", null, "Sem rede."),
      falha("fora_protocolo", 200, MENSAGEM_FORA_PROTOCOLO),
      falha("entrada_invalida", null, "O identificador informado é inválido."),
    ];
    for (const f of falhas) {
      expect(
        reduzirDetalheUsuario(carregando, {
          tipo: "falhou",
          id: 7,
          falha: f,
          mensagemPadrao404: PADRAO_404,
        }),
      ).toEqual({ fase: "erro", id: 7, mensagem: f.mensagem });
    }
  });

  it("erro seguido de tentar novamente volta a carregar o mesmo id", () => {
    const erro = reduzirDetalheUsuario(carregando, {
      tipo: "falhou",
      id: 7,
      falha: falha("rede", null, "Sem rede."),
      mensagemPadrao404: PADRAO_404,
    });
    expect(reduzirDetalheUsuario(erro, { tipo: "iniciar", id: 7 })).toEqual(carregando);
  });

  it("ação de outro id é ignorada", () => {
    const carregando8 = reduzirDetalheUsuario(carregando, { tipo: "iniciar", id: 8 });
    expect(carregando8).toEqual({ fase: "carregando", id: 8 });
    expect(reduzirDetalheUsuario(carregando8, { tipo: "recebido", id: 7, usuario: bruno }))
      .toBe(carregando8);
    expect(
      reduzirDetalheUsuario(carregando8, {
        tipo: "falhou",
        id: 7,
        falha: falha("http", 404, PADRAO_404),
        mensagemPadrao404: PADRAO_404,
      }),
    ).toBe(carregando8);
  });

  it("resposta com id diferente do esperado é tratada como fora do protocolo", () => {
    expect(
      reduzirDetalheUsuario(carregando, {
        tipo: "recebido",
        id: 7,
        usuario: { ...bruno, id: 9 },
      }),
    ).toEqual({ fase: "erro", id: 7, mensagem: MENSAGEM_FORA_PROTOCOLO });
  });

  it("texto de situação só anuncia carregamento e sucesso", () => {
    expect(textoSituacaoDetalhe(carregando)).toBe("Carregando dados do usuário...");
    expect(textoSituacaoDetalhe({ fase: "sucesso", id: 7, usuario: bruno }))
      .toBe("Dados do usuário carregados.");
    expect(textoSituacaoDetalhe({ fase: "erro", id: 7, mensagem: "x" })).toBe("");
    expect(textoSituacaoDetalhe({ fase: "nao_encontrado", id: 7, explicacao: "x" })).toBe("");
  });
});

describe("montarItensDetalheUsuario", () => {
  it("usuário comum", () => {
    expect(montarItensDetalheUsuario(bruno)).toEqual([
      { rotulo: "Identificador", valor: "7", selo: "nenhum" },
      { rotulo: "Nome", valor: "Bruno Dias", selo: "nenhum" },
      { rotulo: "E-mail", valor: "bruno@exemplo.com", selo: "nenhum" },
      { rotulo: "Tipo", valor: "Comum", selo: "comum" },
    ]);
  });

  it("administrador", () => {
    expect(montarItensDetalheUsuario(admin).at(-1)).toEqual({
      rotulo: "Tipo",
      valor: "Administrador",
      selo: "administrador",
    });
  });

  it("HTML fica literal e nenhum campo extra aparece", () => {
    const hostil = {
      ...bruno,
      nome: "<img src=x onerror=alert(1)>",
      email: "<b>x</b>@a.com",
      senha: "segredo",
    };
    const itens = montarItensDetalheUsuario(hostil);
    expect(itens.map((item) => item.rotulo)).toEqual(["Identificador", "Nome", "E-mail", "Tipo"]);
    expect(itens[1]?.valor).toBe("<img src=x onerror=alert(1)>");
    expect(itens[2]?.valor).toBe("<b>x</b>@a.com");
    expect(JSON.stringify(itens)).not.toContain("segredo");
  });
});

describe("caminhoDetalheUsuario", () => {
  it("monta o caminho só com o id numérico", () => {
    expect(caminhoDetalheUsuario(7)).toBe("/usuarios/7");
    expect(caminhoDetalheUsuario(9007199254740991)).toBe("/usuarios/9007199254740991");
  });
});
