import type { ReactNode } from "react";
import { ProvedorConexao } from "./ProvedorConexao.tsx";
import { ProvedorOperacoes } from "./ProvedorOperacoes.tsx";
import { ProvedorRegistros } from "./ProvedorRegistros.tsx";
import { ProvedorSessao } from "./ProvedorSessao.tsx";
import { ProvedorTema } from "./ProvedorTema.tsx";

interface PropriedadesProvedoresAplicacao {
  children: ReactNode;
}

export function ProvedoresAplicacao({ children }: PropriedadesProvedoresAplicacao) {
  return (
    <ProvedorTema>
      <ProvedorConexao>
        <ProvedorSessao>
          <ProvedorRegistros>
            <ProvedorOperacoes>{children}</ProvedorOperacoes>
          </ProvedorRegistros>
        </ProvedorSessao>
      </ProvedorConexao>
    </ProvedorTema>
  );
}
