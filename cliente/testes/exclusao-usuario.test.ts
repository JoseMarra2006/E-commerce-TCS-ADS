import { describe, expect, it } from "vitest";
import type { ResultadoOperacao } from "../src/api/operacoes.ts";
import {
  criarEstadoExclusaoUsuario,
  decidirDestinoExclusao,
  dialogoExclusaoAberto,
  reduzirExclusaoUsuario,
  textoDialogoExclusaoUsuario,
} from "../src/paginas/exclusao-usuario.ts";
import type { EstadoExclusaoUsuario } from "../src/paginas/exclusao-usuario.ts";
import type { RespostaUsuario } from "../src/tipos/protocolo.ts";

type Falha = Extract<ResultadoOperacao<true>, { ok: false }>;

const sucesso: ResultadoOperacao<true> = { ok: true, dados: true };

function falha(tipo: Falha["tipo"], status: number | null, mensagem: string): Falha {
  return { ok: false, tipo, status, mensagem };
}

const errosComuns: Falha[] = [
  falha("http", 403, "Você não tem permissão para realizar esta operação."),
  falha("http", 500, "Erro interno no servidor."),
  falha("rede", null, "Não foi possível conectar ao servidor."),
  falha("rede", null, "O servidor não respondeu a tempo. Verifique a conexão e tente novamente."),
  falha("fora_protocolo", 200, "Resposta do servidor fora do protocolo."),
  falha("entrada_invalida", null, "O identificador informado é inválido."),
];

function excluindo(): EstadoExclusaoUsuario {
  const aberto = reduzirExclusaoUsuario(criarEstadoExclusaoUsuario(7), { tipo: "abrir", id: 7 });
  return reduzirExclusaoUsuario(aberto, { tipo: "confirmar", id: 7 });
}

describe("reduzirExclusaoUsuario", () => {
  it("abrir e cancelar voltam a ocioso sem passar por excluindo", () => {
    const ocioso = criarEstadoExclusaoUsuario(7);
    expect(ocioso).toEqual({ fase: "ociosa", id: 7 });
    expect(dialogoExclusaoAberto(ocioso)).toBe(false);
    const aberto = reduzirExclusaoUsuario(ocioso, { tipo: "abrir", id: 7 });
    expect(aberto).toEqual({ fase: "confirmando", id: 7 });
    expect(dialogoExclusaoAberto(aberto)).toBe(true);
    expect(reduzirExclusaoUsuario(aberto, { tipo: "cancelar", id: 7 })).toEqual(ocioso);
  });

  it("confirmar leva a excluindo, e enquanto exclui não há novo envio nem cancelamento", () => {
    const estado = excluindo();
    expect(estado).toEqual({ fase: "excluindo", id: 7 });
    expect(dialogoExclusaoAberto(estado)).toBe(true);
    expect(reduzirExclusaoUsuario(estado, { tipo: "confirmar", id: 7 })).toBe(estado);
    expect(reduzirExclusaoUsuario(estado, { tipo: "cancelar", id: 7 })).toBe(estado);
    expect(reduzirExclusaoUsuario(estado, { tipo: "abrir", id: 7 })).toBe(estado);
  });

  it("confirmar sem o diálogo aberto não faz nada", () => {
    const ocioso = criarEstadoExclusaoUsuario(7);
    expect(reduzirExclusaoUsuario(ocioso, { tipo: "confirmar", id: 7 })).toBe(ocioso);
  });

  it("204 leva a concluída e 404 a já excluída", () => {
    expect(reduzirExclusaoUsuario(excluindo(), { tipo: "resultado", id: 7, resultado: sucesso }))
      .toEqual({ fase: "concluida", id: 7 });
    expect(
      reduzirExclusaoUsuario(excluindo(), {
        tipo: "resultado",
        id: 7,
        resultado: falha("http", 404, "Usuário não encontrado."),
      }),
    ).toEqual({ fase: "ja_excluida", id: 7 });
  });

  it("cada erro vira erro com a mensagem, e é possível tentar de novo", () => {
    for (const f of errosComuns) {
      const erro = reduzirExclusaoUsuario(excluindo(), { tipo: "resultado", id: 7, resultado: f });
      expect(erro).toEqual({ fase: "erro", id: 7, mensagem: f.mensagem });
      expect(dialogoExclusaoAberto(erro)).toBe(false);
      expect(reduzirExclusaoUsuario(erro, { tipo: "abrir", id: 7 })).toEqual({
        fase: "confirmando",
        id: 7,
      });
    }
  });

  it("resultado fora da fase excluindo é ignorado", () => {
    const ocioso = criarEstadoExclusaoUsuario(7);
    expect(reduzirExclusaoUsuario(ocioso, { tipo: "resultado", id: 7, resultado: sucesso }))
      .toBe(ocioso);
  });

  it("ação de outro id é ignorada e iniciar troca o id", () => {
    const estado = excluindo();
    for (
      const acao of [
        { tipo: "resultado", id: 8, resultado: sucesso },
        { tipo: "cancelar", id: 8 },
        { tipo: "abrir", id: 8 },
        { tipo: "confirmar", id: 8 },
      ] as const
    ) {
      expect(reduzirExclusaoUsuario(estado, acao)).toBe(estado);
    }
    expect(reduzirExclusaoUsuario(estado, { tipo: "iniciar", id: 8 })).toEqual({
      fase: "ociosa",
      id: 8,
    });
  });
});

describe("decidirDestinoExclusao", () => {
  it("204 vai para a lista com o aviso de excluído", () => {
    expect(decidirDestinoExclusao(sucesso)).toEqual({
      tipo: "navegar",
      para: "/usuarios",
      estado: { avisoUsuario: "excluido" },
    });
  });

  it("404 vai para a lista com o aviso de já excluído", () => {
    expect(decidirDestinoExclusao(falha("http", 404, "x"))).toEqual({
      tipo: "navegar",
      para: "/usuarios",
      estado: { avisoUsuario: "ja_excluido" },
    });
  });

  it("outros erros, inclusive 401, permanecem na página", () => {
    for (const f of [...errosComuns, falha("http", 401, "Não autorizado.")]) {
      expect(decidirDestinoExclusao(f)).toEqual({ tipo: "permanecer" });
    }
  });
});

describe("textoDialogoExclusaoUsuario", () => {
  const alvo: RespostaUsuario = {
    id: 7,
    nome: "Bruno Dias",
    email: "bruno@exemplo.com",
    admin: false,
  };

  it("identifica o alvo pelo nome e pelo e-mail", () => {
    expect(textoDialogoExclusaoUsuario(alvo)).toBe(
      "Você está prestes a excluir Bruno Dias (bruno@exemplo.com). Esta ação não pode ser desfeita. As sessões abertas desse usuário também serão encerradas.",
    );
  });

  it("mantém HTML literal e não inclui campos extras", () => {
    const hostil = {
      ...alvo,
      nome: "<img src=x onerror=alert(1)>",
      senha: "segredo123",
      papel: "comum",
    };
    const texto = textoDialogoExclusaoUsuario(hostil);
    expect(texto).toContain("<img src=x onerror=alert(1)> (bruno@exemplo.com)");
    expect(texto).not.toContain("segredo123");
    expect(texto).not.toContain("comum");
    expect(texto).not.toContain("7");
  });
});
