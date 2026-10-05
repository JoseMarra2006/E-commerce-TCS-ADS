import { Navigate } from "react-router";
import { useConexao } from "../contextos/use-conexao.ts";
import { useSessao } from "../contextos/use-sessao.ts";
import { decidirDestinoInicial } from "./destinos.ts";

export function DestinoInicial() {
  const { conexao } = useConexao();
  const { sessao } = useSessao();

  return <Navigate to={decidirDestinoInicial(conexao !== null, sessao !== null)} replace />;
}
