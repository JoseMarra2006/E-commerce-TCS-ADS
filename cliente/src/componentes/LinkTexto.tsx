import { Link } from "react-router";
import estilos from "./LinkTexto.module.css";

interface PropriedadesLinkTexto {
  para: string;
  children: string;
  rotuloAcessivel?: string;
}

export function LinkTexto({ para, children, rotuloAcessivel }: PropriedadesLinkTexto) {
  return (
    <Link to={para} className={estilos.link} aria-label={rotuloAcessivel}>
      {children}
    </Link>
  );
}
