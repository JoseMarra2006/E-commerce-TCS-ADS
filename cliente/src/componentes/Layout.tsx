import { Link, Outlet } from "react-router";
import { useConexao } from "../contextos/use-conexao.ts";
import estilos from "./Layout.module.css";

export function Layout() {
  const { conexao } = useConexao();

  return (
    <div className={estilos.estrutura}>
      <header className={estilos.cabecalho}>
        <div className={estilos.cabecalhoInterno}>
          <p className={estilos.titulo}>E-commerce</p>
          <div className={estilos.conexao}>
            {conexao === null
              ? <span>Nenhum servidor configurado</span>
              : (
                <>
                  <span>Servidor: {conexao.ip}:{conexao.porta}</span>
                  <Link to="/conexao" className={estilos.link}>
                    Trocar servidor
                  </Link>
                </>
              )}
          </div>
        </div>
      </header>
      <main className="aplicacao">
        <Outlet />
      </main>
    </div>
  );
}
