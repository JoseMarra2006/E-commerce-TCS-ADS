import { juntarClasses } from "./juntar-classes.ts";
import estilos from "./Botao.module.css";

interface PropriedadesBotao {
  children: string;
  variante?: "primaria" | "secundaria" | "perigo";
  tipo?: "button" | "submit";
  carregando?: boolean;
  textoCarregando?: string;
  desabilitado?: boolean;
  aoClicar?: () => void;
}

export function Botao({
  children,
  variante = "primaria",
  tipo = "button",
  carregando = false,
  textoCarregando = "Aguarde...",
  desabilitado = false,
  aoClicar,
}: PropriedadesBotao) {
  return (
    <button
      type={tipo}
      className={juntarClasses(estilos.botao, estilos[variante])}
      disabled={desabilitado || carregando}
      aria-busy={carregando ? true : undefined}
      onClick={aoClicar}
    >
      {carregando ? textoCarregando : children}
    </button>
  );
}
