import { useTema } from "../contextos/use-tema.ts";
import estilos from "./BotaoTema.module.css";

function IconeSol() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function IconeLua() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}

export function BotaoTema() {
  const { tema, alternar } = useTema();
  const rotulo = tema === "escuro" ? "Ativar tema claro" : "Ativar tema escuro";

  return (
    <button type="button" className={estilos.botao} onClick={alternar} aria-label={rotulo} title={rotulo}>
      {tema === "escuro" ? <IconeSol /> : <IconeLua />}
    </button>
  );
}
