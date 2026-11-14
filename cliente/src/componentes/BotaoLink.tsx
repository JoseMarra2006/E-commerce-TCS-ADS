import { Link } from "react-router";
import { juntarClasses } from "./juntar-classes.ts";
import estilos from "./Botao.module.css";
import estilosLink from "./BotaoLink.module.css";

interface PropriedadesBotaoLink {
  para: string;
  children: string;
  variante?: "primaria" | "secundaria";
}

export function BotaoLink({ para, children, variante = "primaria" }: PropriedadesBotaoLink) {
  return (
    <Link to={para} className={juntarClasses(estilos.botao, estilos[variante], estilosLink.link)}>
      {children}
    </Link>
  );
}
