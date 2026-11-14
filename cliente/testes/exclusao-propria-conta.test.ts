import { describe, expect, it } from "vitest";
import {
  AVISO_EXCLUSAO_PROPRIA_CONTA_ADM,
  DESCRICAO_EXCLUSAO_PROPRIA_CONTA,
  montarDialogoExclusaoPropriaConta,
  ROTULO_EXCLUSAO_PROPRIA_CONTA,
  ROTULO_EXCLUSAO_PROPRIA_CONTA_ADM,
} from "../src/paginas/exclusao-propria-conta.ts";

const usuario = { id: 1, nome: "Admin", email: "adm@teste.com" };

describe("montarDialogoExclusaoPropriaConta", () => {
  it("as constantes do usuário comum são exatamente os textos que o perfil já usava", () => {
    expect(DESCRICAO_EXCLUSAO_PROPRIA_CONTA).toBe(
      "Esta ação é permanente. Seus dados serão apagados deste servidor e você será desconectado.",
    );
    expect(ROTULO_EXCLUSAO_PROPRIA_CONTA).toBe("Excluir cadastro");
  });

  it("ADM recebe o texto atual seguido do aviso reforçado e o rótulo próprio", () => {
    expect(montarDialogoExclusaoPropriaConta({ ...usuario, admin: true })).toEqual({
      descricao: `${DESCRICAO_EXCLUSAO_PROPRIA_CONTA} ${AVISO_EXCLUSAO_PROPRIA_CONTA_ADM}`,
      textoConfirmar: ROTULO_EXCLUSAO_PROPRIA_CONTA_ADM,
    });
    expect(AVISO_EXCLUSAO_PROPRIA_CONTA_ADM).toBe(
      "Você é administrador. Ao excluir sua conta, perderá o acesso às telas de administração e todas as suas sessões serão encerradas. Se este for o único administrador, ninguém poderá gerenciar usuários e produtos até o servidor ser reiniciado.",
    );
    expect(ROTULO_EXCLUSAO_PROPRIA_CONTA_ADM).toBe("Excluir minha conta de administrador");
  });

  it("comum, sem admin, admin de tipo inválido ou sem sessão mantêm exatamente o texto atual", () => {
    for (
      const alvo of [
        { ...usuario, admin: false },
        usuario,
        { ...usuario, admin: "true" },
        { ...usuario, admin: 1 },
        null,
        undefined,
      ]
    ) {
      expect(montarDialogoExclusaoPropriaConta(alvo)).toEqual({
        descricao: DESCRICAO_EXCLUSAO_PROPRIA_CONTA,
        textoConfirmar: ROTULO_EXCLUSAO_PROPRIA_CONTA,
      });
    }
  });
});
