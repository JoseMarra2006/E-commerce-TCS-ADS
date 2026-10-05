import { juntarClasses } from "./juntar-classes.ts";
import estilos from "./Alerta.module.css";

interface PropriedadesAlerta {
  tipo: "sucesso" | "erro" | "aviso" | "info";
  mensagem: string;
}

export function Alerta({ tipo, mensagem }: PropriedadesAlerta) {
  const papel = tipo === "erro" || tipo === "aviso" ? "alert" : "status";

  return (
    <div role={papel} className={juntarClasses(estilos.alerta, estilos[tipo])}>
      {mensagem}
    </div>
  );
}
