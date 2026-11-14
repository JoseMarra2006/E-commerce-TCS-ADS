import { juntarClasses } from "./juntar-classes.ts";
import estilos from "./SeloTipoUsuario.module.css";

interface PropriedadesSeloTipoUsuario {
  administrador: boolean;
  children: string;
}

export function SeloTipoUsuario({ administrador, children }: PropriedadesSeloTipoUsuario) {
  return (
    <span className={juntarClasses(estilos.selo, administrador ? estilos.administrador : undefined)}>
      {children}
    </span>
  );
}
