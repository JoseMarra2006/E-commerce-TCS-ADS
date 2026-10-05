import { useMemo } from "react";
import type { ReactNode } from "react";
import { criarClienteHttp } from "../api/cliente-http.ts";
import { criarOperacoes } from "../api/operacoes.ts";
import { ContextoOperacoes } from "./contexto-operacoes.ts";
import { AVISO_SESSAO_ENCERRADA, envolverOperacoesComTratamento401 } from "./tratamento-401.ts";
import { useConexao } from "./use-conexao.ts";
import { useRegistros } from "./use-registros.ts";
import { useSessao } from "./use-sessao.ts";

interface PropriedadesProvedorOperacoes {
  children: ReactNode;
}

export function ProvedorOperacoes({ children }: PropriedadesProvedorOperacoes) {
  const { obterConexaoAtual } = useConexao();
  const { encerrarSessaoLocal } = useSessao();
  const { adicionarRegistro } = useRegistros();

  const operacoes = useMemo(() => {
    const cliente = criarClienteHttp({
      obterConexao: obterConexaoAtual,
      aoRegistrar: adicionarRegistro,
    });
    return envolverOperacoesComTratamento401(criarOperacoes(cliente), () => {
      encerrarSessaoLocal(AVISO_SESSAO_ENCERRADA);
    });
  }, [obterConexaoAtual, adicionarRegistro, encerrarSessaoLocal]);

  return <ContextoOperacoes value={operacoes}>{children}</ContextoOperacoes>;
}
