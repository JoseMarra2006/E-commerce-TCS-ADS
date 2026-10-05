import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./estilos/global.css";
import Aplicacao from "./Aplicacao.tsx";

const elementoRaiz = document.getElementById("raiz");

if (elementoRaiz === null) {
  throw new Error("Elemento raiz não encontrado.");
}

createRoot(elementoRaiz).render(
  <StrictMode>
    <Aplicacao />
  </StrictMode>,
);
