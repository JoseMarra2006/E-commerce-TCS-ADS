import { useEffect } from "react";

const NOME_APLICACAO = "Bilheteria Relâmpago";

export function useTituloPagina(titulo: string): void {
  useEffect(() => {
    document.title = `${titulo} | ${NOME_APLICACAO}`;
    return () => {
      document.title = NOME_APLICACAO;
    };
  }, [titulo]);
}
