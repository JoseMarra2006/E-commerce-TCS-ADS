import { Link, Outlet } from "react-router";
import { useConexao } from "../contextos/use-conexao.ts";
import { useSair } from "../contextos/use-sair.ts";
import { useSessao } from "../contextos/use-sessao.ts";
import { obterPrimeiroNome } from "../paginas/formatacao.ts";
import { BotaoTema } from "./BotaoTema.tsx";
import { Marca } from "./Marca.tsx";
import estilos from "./Layout.module.css";

export function Layout() {
  const { conexao } = useConexao();
  const { sessao } = useSessao();
  const { sair, saindo } = useSair();

  return (
    <div className={estilos.estrutura}>
      <header className={estilos.cabecalho}>
        <div className={estilos.cabecalhoInterno}>
          <Link to="/" className={estilos.linkMarca}>
            <Marca />
          </Link>
          <div className={estilos.acoes}>
            <div className={estilos.conexao}>
              {sessao !== null && (
                <span className={estilos.usuario}>
                  <span className={estilos.saudacao}>
                    Olá, {obterPrimeiroNome(sessao.usuario.nome)}
                  </span>
                  <button
                    type="button"
                    className={estilos.sair}
                    disabled={saindo}
                    aria-busy={saindo ? true : undefined}
                    onClick={() => void sair()}
                  >
                    {saindo ? "Saindo..." : "Sair"}
                  </button>
                </span>
              )}
              {conexao === null
                ? <span>Nenhum servidor configurado</span>
                : (
                  <>
                    <span>
                      Servidor:{" "}
                      <strong className={estilos.endereco}>{conexao.ip}:{conexao.porta}</strong>
                    </span>
                    <Link to="/conexao" className={estilos.link}>
                      Trocar servidor
                    </Link>
                  </>
                )}
            </div>
            <BotaoTema />
          </div>
        </div>
      </header>
      <main className={`aplicacao ${estilos.conteudo}`}>
        <Outlet />
      </main>
    </div>
  );
}
