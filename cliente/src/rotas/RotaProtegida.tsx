import { Navigate, Outlet } from "react-router";
import { useConexao } from "../contextos/use-conexao.ts";
import { useSessao } from "../contextos/use-sessao.ts";
import { decidirAcesso } from "./destinos.ts";
import type { RequisitoAcesso } from "./destinos.ts";

interface PropriedadesRotaProtegida {
  requisito: RequisitoAcesso;
}

export function RotaProtegida({ requisito }: PropriedadesRotaProtegida) {
  const { conexao } = useConexao();
  const { sessao } = useSessao();
  const decisao = decidirAcesso(requisito, conexao !== null, sessao !== null);

  if (!decisao.permitido) {
    return <Navigate to={decisao.destino} replace />;
  }
  return <Outlet />;
}
