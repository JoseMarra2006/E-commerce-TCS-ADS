import { useId } from "react";
import type { HTMLInputAutoCompleteAttribute, HTMLInputTypeAttribute, Ref } from "react";
import { juntarClasses } from "./juntar-classes.ts";
import estilos from "./CampoTexto.module.css";

interface PropriedadesCampoTexto {
  rotulo: string;
  valor: string;
  aoAlterar: (valor: string) => void;
  tipo?: HTMLInputTypeAttribute;
  placeholder?: string;
  autoComplete?: HTMLInputAutoCompleteAttribute;
  inputMode?: "none" | "text" | "tel" | "url" | "email" | "numeric" | "decimal" | "search";
  desabilitado?: boolean;
  ajuda?: string;
  erro?: string;
  referencia?: Ref<HTMLInputElement>;
}

export function CampoTexto({
  rotulo,
  valor,
  aoAlterar,
  tipo = "text",
  placeholder,
  autoComplete,
  inputMode,
  desabilitado = false,
  ajuda,
  erro,
  referencia,
}: PropriedadesCampoTexto) {
  const identificador = useId();
  const idAjuda = `${identificador}-ajuda`;
  const idErro = `${identificador}-erro`;
  const descricao = [ajuda !== undefined ? idAjuda : null, erro !== undefined ? idErro : null]
    .filter((id): id is string => id !== null)
    .join(" ");

  return (
    <div className={estilos.campo}>
      <label htmlFor={identificador} className={estilos.rotulo}>
        {rotulo}
      </label>
      <input
        id={identificador}
        ref={referencia}
        className={juntarClasses(estilos.entrada, erro !== undefined && estilos.comErro)}
        type={tipo}
        value={valor}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        disabled={desabilitado}
        aria-invalid={erro !== undefined ? true : undefined}
        aria-describedby={descricao === "" ? undefined : descricao}
        onChange={(evento) => aoAlterar(evento.target.value)}
      />
      {ajuda !== undefined && (
        <p id={idAjuda} className={estilos.ajuda}>
          {ajuda}
        </p>
      )}
      {erro !== undefined && (
        <p id={idErro} className={estilos.erro}>
          {erro}
        </p>
      )}
    </div>
  );
}
