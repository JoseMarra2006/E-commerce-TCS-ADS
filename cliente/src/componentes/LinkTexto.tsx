import { Link } from "react-router";
import estilos from "./LinkTexto.module.css";

interface PropriedadesLinkTexto {
  para: string;
  children: string;
}

export function LinkTexto({ para, children }: PropriedadesLinkTexto) {
  return (
    <Link to={para} className={estilos.link}>
      {children}
    </Link>
  );
}
