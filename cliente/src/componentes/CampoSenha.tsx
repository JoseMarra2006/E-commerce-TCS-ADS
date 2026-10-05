import { useState } from "react";
import type { HTMLInputAutoCompleteAttribute, Ref } from "react";
import { CampoTexto } from "./CampoTexto.tsx";
import estilos from "./CampoSenha.module.css";

interface PropriedadesCampoSenha {
  rotulo: string;
  valor: string;
  aoAlterar: (valor: string) => void;
  autoComplete?: HTMLInputAutoCompleteAttribute;
  desabilitado?: boolean;
  ajuda?: string;
  erro?: string;
  referencia?: Ref<HTMLInputElement>;
}

export function CampoSenha({
  rotulo,
  valor,
  aoAlterar,
  autoComplete,
  desabilitado,
  ajuda,
  erro,
  referencia,
}: PropriedadesCampoSenha) {
  const [visivel, setVisivel] = useState(false);

  return (
    <CampoTexto
      rotulo={rotulo}
      valor={valor}
      aoAlterar={aoAlterar}
      tipo={visivel ? "text" : "password"}
      autoComplete={autoComplete}
      desabilitado={desabilitado}
      ajuda={ajuda}
      erro={erro}
      referencia={referencia}
      acao={
        <button
          type="button"
          className={estilos.alternar}
          aria-pressed={visivel}
          aria-label={visivel ? "Ocultar senha" : "Mostrar senha"}
          disabled={desabilitado}
          onClick={() => setVisivel((atual) => !atual)}
        >
          {visivel ? "Ocultar" : "Mostrar"}
        </button>
      }
    />
  );
}
