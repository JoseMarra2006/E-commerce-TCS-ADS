import { useId } from "react";
import type { ReactNode } from "react";
import { juntarClasses } from "./juntar-classes.ts";
import estilos from "./CartaoIngresso.module.css";

interface PropriedadesCartaoIngresso {
  titulo: string;
  rotulo?: string;
  descricao?: string;
  largura?: "estreita" | "media";
  children: ReactNode;
}

export function CartaoIngresso({
  titulo,
  rotulo,
  descricao,
  largura = "estreita",
  children,
}: PropriedadesCartaoIngresso) {
  const idTitulo = useId();

  return (
    <section
      className={juntarClasses(estilos.cartao, estilos[largura])}
      aria-labelledby={idTitulo}
    >
      <header className={estilos.superior}>
        {rotulo !== undefined && <p className={estilos.rotulo}>{rotulo}</p>}
        <h1 id={idTitulo} className={estilos.titulo}>{titulo}</h1>
        {descricao !== undefined && <p className={estilos.descricao}>{descricao}</p>}
      </header>
      <div className={estilos.picote} aria-hidden="true" />
      <div className={estilos.inferior}>{children}</div>
    </section>
  );
}
