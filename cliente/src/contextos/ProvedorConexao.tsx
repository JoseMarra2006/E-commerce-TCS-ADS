import { useCallback, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { ConexaoServidor } from "../api/cliente-http.ts";
import { ContextoConexao } from "./contexto-conexao.ts";

interface PropriedadesProvedorConexao {
  children: ReactNode;
}

export function ProvedorConexao({ children }: PropriedadesProvedorConexao) {
  const [conexao, setConexao] = useState<ConexaoServidor | null>(null);
  const referenciaConexao = useRef<ConexaoServidor | null>(null);

  const definirConexao = useCallback((nova: ConexaoServidor) => {
    const copia = { ip: nova.ip, porta: nova.porta };
    referenciaConexao.current = copia;
    setConexao(copia);
  }, []);

  const limparConexao = useCallback(() => {
    referenciaConexao.current = null;
    setConexao(null);
  }, []);

  const obterConexaoAtual = useCallback(() => referenciaConexao.current, []);

  const valor = useMemo(
    () => ({ conexao, definirConexao, limparConexao, obterConexaoAtual }),
    [conexao, definirConexao, limparConexao, obterConexaoAtual],
  );

  return <ContextoConexao value={valor}>{children}</ContextoConexao>;
}
