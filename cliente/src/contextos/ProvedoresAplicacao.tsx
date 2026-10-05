import type { ReactNode } from "react";
import { ProvedorConexao } from "./ProvedorConexao.tsx";
import { ProvedorOperacoes } from "./ProvedorOperacoes.tsx";
import { ProvedorRegistros } from "./ProvedorRegistros.tsx";
import { ProvedorSessao } from "./ProvedorSessao.tsx";

interface PropriedadesProvedoresAplicacao {
  children: ReactNode;
}

export function ProvedoresAplicacao({ children }: PropriedadesProvedoresAplicacao) {
  return (
    <ProvedorConexao>
      <ProvedorSessao>
        <ProvedorRegistros>
          <ProvedorOperacoes>{children}</ProvedorOperacoes>
        </ProvedorRegistros>
      </ProvedorSessao>
    </ProvedorConexao>
  );
}
