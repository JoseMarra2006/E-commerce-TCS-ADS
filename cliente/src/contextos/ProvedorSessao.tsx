import { useCallback, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { RespostaSessao, RespostaUsuario } from "../tipos/protocolo.ts";
import { ContextoSessao } from "./contexto-sessao.ts";
import type { SessaoAtiva } from "./contexto-sessao.ts";

interface PropriedadesProvedorSessao {
  children: ReactNode;
}

export function ProvedorSessao({ children }: PropriedadesProvedorSessao) {
  const [sessao, setSessao] = useState<SessaoAtiva | null>(null);
  const [avisoSessao, setAvisoSessao] = useState<string | null>(null);
  const referenciaAviso = useRef<string | null>(null);

  const iniciarSessao = useCallback((resposta: RespostaSessao) => {
    setSessao({ token: resposta.token, idSessao: resposta.id, usuario: resposta.usuario });
  }, []);

  const atualizarUsuario = useCallback((usuario: RespostaUsuario) => {
    setSessao((atual) => (atual === null ? null : { ...atual, usuario }));
  }, []);

  const encerrarSessaoLocal = useCallback((aviso?: string) => {
    setSessao(null);
    if (aviso !== undefined) {
      referenciaAviso.current = aviso;
      setAvisoSessao(aviso);
    }
  }, []);

  const consumirAvisoSessao = useCallback(() => {
    const aviso = referenciaAviso.current;
    referenciaAviso.current = null;
    setAvisoSessao(null);
    return aviso;
  }, []);

  const valor = useMemo(
    () => ({
      sessao,
      avisoSessao,
      iniciarSessao,
      atualizarUsuario,
      encerrarSessaoLocal,
      consumirAvisoSessao,
    }),
    [sessao, avisoSessao, iniciarSessao, atualizarUsuario, encerrarSessaoLocal, consumirAvisoSessao],
  );

  return <ContextoSessao value={valor}>{children}</ContextoSessao>;
}
