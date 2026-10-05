import { useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { RegistroMensagem } from "../api/cliente-http.ts";
import { ContextoRegistros } from "./contexto-registros.ts";
import { incluirRegistroComLimite, LIMITE_REGISTROS } from "./registros-limite.ts";

interface PropriedadesProvedorRegistros {
  children: ReactNode;
}

export function ProvedorRegistros({ children }: PropriedadesProvedorRegistros) {
  const [registros, setRegistros] = useState<readonly RegistroMensagem[]>([]);

  const adicionarRegistro = useCallback((registro: RegistroMensagem) => {
    setRegistros((lista) => incluirRegistroComLimite(lista, registro, LIMITE_REGISTROS));
  }, []);

  const limparRegistros = useCallback(() => {
    setRegistros([]);
  }, []);

  const valor = useMemo(
    () => ({ registros, adicionarRegistro, limparRegistros }),
    [registros, adicionarRegistro, limparRegistros],
  );

  return <ContextoRegistros value={valor}>{children}</ContextoRegistros>;
}
