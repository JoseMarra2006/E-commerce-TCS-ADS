import { ROTULO_ESGOTADO } from "../paginas/formatacao-produto.ts";
import estilos from "./SeloEsgotado.module.css";

export function SeloEsgotado() {
  return <span className={estilos.selo}>{ROTULO_ESGOTADO}</span>;
}
