import { useCallback, useRef, useState } from "react";
import { decidirAvisoSaida } from "../paginas/resultado-saida.ts";
import { useMontado } from "../paginas/use-montado.ts";
import { useOperacoes } from "./use-operacoes.ts";
import { useSessao } from "./use-sessao.ts";

export interface ControleSaida {
  sair: () => Promise<void>;
  saindo: boolean;
}

export function useSair(): ControleSaida {
  const operacoes = useOperacoes();
  const { sessao, encerrarSessaoLocal } = useSessao();
  const [saindo, setSaindo] = useState(false);
  const emSaida = useRef(false);
  const montado = useMontado();

  const idSessao = sessao?.idSessao;
  const token = sessao?.token;

  const sair = useCallback(async () => {
    if (emSaida.current || idSessao === undefined || token === undefined) {
      return;
    }
    emSaida.current = true;
    setSaindo(true);

    const resultado = await operacoes.sair(idSessao, token);

    emSaida.current = false;
    if (montado.current) {
      setSaindo(false);
    }
    encerrarSessaoLocal(decidirAvisoSaida(resultado));
  }, [idSessao, token, operacoes, encerrarSessaoLocal, montado]);

  return { sair, saindo };
}
