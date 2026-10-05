import { useEffect, useId, useRef } from "react";
import type { MouseEvent, SyntheticEvent } from "react";
import { Alerta } from "./Alerta.tsx";
import { Botao } from "./Botao.tsx";
import estilos from "./DialogoConfirmacao.module.css";

interface PropriedadesDialogoConfirmacao {
  aberto: boolean;
  titulo: string;
  descricao: string;
  textoConfirmar: string;
  textoConfirmando: string;
  variante: "perigo" | "primaria";
  carregando: boolean;
  erro?: string;
  aoConfirmar: () => void;
  aoCancelar: () => void;
}

export function DialogoConfirmacao({
  aberto,
  titulo,
  descricao,
  textoConfirmar,
  textoConfirmando,
  variante,
  carregando,
  erro,
  aoConfirmar,
  aoCancelar,
}: PropriedadesDialogoConfirmacao) {
  const referenciaDialogo = useRef<HTMLDialogElement>(null);
  const referenciaCancelar = useRef<HTMLDivElement>(null);
  const identificador = useId();
  const idTitulo = `${identificador}-titulo`;
  const idDescricao = `${identificador}-descricao`;

  useEffect(() => {
    const dialogo = referenciaDialogo.current;
    if (dialogo === null) {
      return;
    }
    if (aberto && !dialogo.open) {
      dialogo.showModal();
      referenciaCancelar.current?.querySelector("button")?.focus();
    } else if (!aberto && dialogo.open) {
      dialogo.close();
    }
  }, [aberto]);

  function aoSolicitarCancelamento(evento: SyntheticEvent<HTMLDialogElement>) {
    evento.preventDefault();
    if (!carregando) {
      aoCancelar();
    }
  }

  function aoClicarNoDialogo(evento: MouseEvent<HTMLDialogElement>) {
    if (evento.target === evento.currentTarget && !carregando) {
      aoCancelar();
    }
  }

  return (
    <dialog
      ref={referenciaDialogo}
      className={estilos.dialogo}
      aria-labelledby={idTitulo}
      aria-describedby={idDescricao}
      onCancel={aoSolicitarCancelamento}
      onClick={aoClicarNoDialogo}
    >
      <div className={estilos.conteudo}>
        <h2 id={idTitulo} className={estilos.titulo}>{titulo}</h2>
        <p id={idDescricao} className={estilos.descricao}>{descricao}</p>
        {erro !== undefined && <Alerta tipo="erro" mensagem={erro} />}
        <div className={estilos.acoes}>
          <div ref={referenciaCancelar} className={estilos.acao}>
            <Botao variante="secundaria" desabilitado={carregando} aoClicar={aoCancelar}>
              Cancelar
            </Botao>
          </div>
          <div className={estilos.acao}>
            <Botao
              variante={variante}
              carregando={carregando}
              textoCarregando={textoConfirmando}
              aoClicar={aoConfirmar}
            >
              {textoConfirmar}
            </Botao>
          </div>
        </div>
      </div>
    </dialog>
  );
}
