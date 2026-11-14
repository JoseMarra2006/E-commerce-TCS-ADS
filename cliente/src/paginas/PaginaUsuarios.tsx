import { useEffect, useReducer, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Alerta } from "../componentes/Alerta.tsx";
import { Botao } from "../componentes/Botao.tsx";
import { CartaoIngresso } from "../componentes/CartaoIngresso.tsx";
import { useOperacoes } from "../contextos/use-operacoes.ts";
import { useSessao } from "../contextos/use-sessao.ts";
import { lerAvisoUsuario } from "./aviso-usuario.ts";
import {
  ESTADO_INICIAL_LISTA_USUARIOS,
  montarLinhasUsuarios,
  reduzirListaUsuarios,
  textoContadorUsuarios,
} from "./lista-usuarios.ts";
import type { EstadoListaUsuarios } from "./lista-usuarios.ts";
import { TabelaUsuarios } from "./TabelaUsuarios.tsx";
import { useTituloPagina } from "./use-titulo-pagina.ts";
import estilos from "./PaginaUsuarios.module.css";

function textoSituacao(estado: EstadoListaUsuarios): string {
  switch (estado.fase) {
    case "carregando":
      return "Carregando usuários...";
    case "recarregando":
      return "Atualizando a lista de usuários...";
    case "sucesso":
      return textoContadorUsuarios(estado.usuarios.length);
    case "erro":
      return "";
  }
}

export function PaginaUsuarios() {
  useTituloPagina("Usuários");
  const { sessao } = useSessao();
  const operacoes = useOperacoes();
  const navegar = useNavigate();
  const localizacao = useLocation();
  const [aviso] = useState(() => lerAvisoUsuario(localizacao.state));
  const temAvisoNoHistorico = lerAvisoUsuario(localizacao.state) !== null;
  const [estado, despachar] = useReducer(reduzirListaUsuarios, ESTADO_INICIAL_LISTA_USUARIOS);
  const [tentativa, setTentativa] = useState(0);

  const token = sessao?.token;

  useEffect(() => {
    if (temAvisoNoHistorico) {
      navegar(localizacao.pathname, { replace: true });
    }
  }, [temAvisoNoHistorico, navegar, localizacao.pathname]);

  useEffect(() => {
    if (token === undefined) {
      return undefined;
    }
    let ativa = true;

    void operacoes.listarUsuarios(token).then((resultado) => {
      if (!ativa) {
        return;
      }
      despachar(
        resultado.ok
          ? { tipo: "recebido", usuarios: resultado.dados }
          : { tipo: "falhou", mensagem: resultado.mensagem },
      );
    });

    return () => {
      ativa = false;
    };
  }, [token, operacoes, tentativa]);

  if (sessao === null) {
    return null;
  }

  function recarregar() {
    despachar({ tipo: "recarregar" });
    setTentativa((atual) => atual + 1);
  }

  const comDados = estado.fase === "sucesso" || estado.fase === "recarregando";
  const linhas = comDados ? montarLinhasUsuarios(estado.usuarios, sessao.usuario.id) : [];
  const recarregando = estado.fase === "recarregando";

  return (
    <CartaoIngresso
      rotulo="Administração"
      titulo="Usuários"
      descricao="Usuários cadastrados neste servidor."
      largura="larga"
    >
      {aviso !== null && <Alerta tipo="sucesso" mensagem={aviso} />}

      <p role="status" className={estilos.situacao}>{textoSituacao(estado)}</p>

      {estado.fase === "erro" && (
        <>
          <Alerta tipo="erro" mensagem={estado.mensagem} />
          <div className={estilos.acoes}>
            <Botao aoClicar={recarregar}>Tentar novamente</Botao>
          </div>
        </>
      )}

      {comDados && linhas.length === 0 && (
        <p className={estilos.vazio}>Nenhum usuário encontrado.</p>
      )}

      {comDados && linhas.length > 0 && (
        <TabelaUsuarios linhas={linhas} recarregando={recarregando} />
      )}

      {comDados && (
        <div className={estilos.acoes}>
          <Botao
            variante="secundaria"
            carregando={recarregando}
            textoCarregando="Atualizando..."
            aoClicar={recarregar}
          >
            Atualizar lista
          </Botao>
        </div>
      )}
    </CartaoIngresso>
  );
}
