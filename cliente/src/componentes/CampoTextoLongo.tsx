import { useId } from "react";
import type { Ref } from "react";
import { juntarClasses } from "./juntar-classes.ts";
import estilosCampo from "./CampoTexto.module.css";
import estilos from "./CampoTextoLongo.module.css";

interface PropriedadesCampoTextoLongo {
  rotulo: string;
  valor: string;
  aoAlterar: (valor: string) => void;
  linhas?: number;
  ajuda?: string;
  erro?: string;
  contador?: string;
  somenteLeitura?: boolean;
  aoSair?: () => void;
  referencia?: Ref<HTMLTextAreaElement>;
}

export function CampoTextoLongo({
  rotulo,
  valor,
  aoAlterar,
  linhas = 5,
  ajuda,
  erro,
  contador,
  somenteLeitura,
  aoSair,
  referencia,
}: PropriedadesCampoTextoLongo) {
  const identificador = useId();
  const idAjuda = `${identificador}-ajuda`;
  const idErro = `${identificador}-erro`;
  const descricao = [ajuda !== undefined ? idAjuda : null, erro !== undefined ? idErro : null]
    .filter((id): id is string => id !== null)
    .join(" ");

  return (
    <div className={estilosCampo.campo}>
      <label htmlFor={identificador} className={estilosCampo.rotulo}>
        {rotulo}
      </label>
      <textarea
        id={identificador}
        ref={referencia}
        className={juntarClasses(
          estilosCampo.entrada,
          estilos.areaTexto,
          erro !== undefined && estilosCampo.comErro,
        )}
        value={valor}
        rows={linhas}
        autoComplete="off"
        readOnly={somenteLeitura}
        aria-invalid={erro !== undefined ? true : undefined}
        aria-describedby={descricao === "" ? undefined : descricao}
        onChange={(evento) => aoAlterar(evento.target.value)}
        onBlur={aoSair}
      />
      {ajuda !== undefined && (
        <p id={idAjuda} className={estilosCampo.ajuda}>
          {ajuda}
        </p>
      )}
      {contador !== undefined && <p className={estilosCampo.ajuda}>{contador}</p>}
      {erro !== undefined && (
        <p id={idErro} className={estilosCampo.erro}>
          {erro}
        </p>
      )}
    </div>
  );
}
