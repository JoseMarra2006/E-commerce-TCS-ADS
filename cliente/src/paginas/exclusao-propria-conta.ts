import { ehAdministrador } from "../contextos/eh-administrador.ts";

export const DESCRICAO_EXCLUSAO_PROPRIA_CONTA =
  "Esta ação é permanente. Seus dados serão apagados deste servidor e você será desconectado.";
export const ROTULO_EXCLUSAO_PROPRIA_CONTA = "Excluir cadastro";
export const AVISO_EXCLUSAO_PROPRIA_CONTA_ADM =
  "Você é administrador. Ao excluir sua conta, perderá o acesso às telas de administração e todas as suas sessões serão encerradas. Se este for o único administrador, ninguém poderá gerenciar usuários e produtos até o servidor ser reiniciado.";
export const ROTULO_EXCLUSAO_PROPRIA_CONTA_ADM = "Excluir minha conta de administrador";

export interface DialogoExclusaoPropriaConta {
  descricao: string;
  textoConfirmar: string;
}

export function montarDialogoExclusaoPropriaConta(
  usuario: object | null | undefined,
): DialogoExclusaoPropriaConta {
  if (ehAdministrador(usuario)) {
    return {
      descricao: `${DESCRICAO_EXCLUSAO_PROPRIA_CONTA} ${AVISO_EXCLUSAO_PROPRIA_CONTA_ADM}`,
      textoConfirmar: ROTULO_EXCLUSAO_PROPRIA_CONTA_ADM,
    };
  }
  return {
    descricao: DESCRICAO_EXCLUSAO_PROPRIA_CONTA,
    textoConfirmar: ROTULO_EXCLUSAO_PROPRIA_CONTA,
  };
}
