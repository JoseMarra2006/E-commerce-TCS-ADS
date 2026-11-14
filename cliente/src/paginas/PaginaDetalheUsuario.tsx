import { useEffect, useReducer, useState } from "react";
import { Navigate, useParams } from "react-router";
import { obterMensagemPadraoStatus } from "../api/cliente-http.ts";
import { Alerta } from "../componentes/Alerta.tsx";
import { Botao } from "../componentes/Botao.tsx";
import { CartaoIngresso } from "../componentes/CartaoIngresso.tsx";
import { LinkTexto } from "../componentes/LinkTexto.tsx";
import { SeloTipoUsuario } from "../componentes/SeloTipoUsuario.tsx";
import { useOperacoes } from "../contextos/use-operacoes.ts";
import { useSessao } from "../contextos/use-sessao.ts";
import { CAMINHO_LISTA_USUARIOS } from "./caminhos-usuarios.ts";
import {
  criarEstadoDetalheUsuario,
  decidirDestinoDetalhe,
  MENSAGEM_ID_ROTA_INVALIDO,
  montarItensDetalheUsuario,
  reduzirDetalheUsuario,
  textoSituacaoDetalhe,
  TITULO_NAO_ENCONTRADO,
} from "./detalhe-usuario.ts";
import { useTituloPagina } from "./use-titulo-pagina.ts";
import estilos from "./PaginaDetalheUsuario.module.css";

const ID_SEM_ALVO = 0;

export function PaginaDetalheUsuario() {
  useTituloPagina("Detalhes do usuário");
  const { id: parametro } = useParams();
  const { sessao } = useSessao();
  const operacoes = useOperacoes();
  const [tentativa, setTentativa] = useState(0);

  const destino = decidirDestinoDetalhe(parametro, sessao?.usuario.id ?? ID_SEM_ALVO);
  const idAlvo = destino.tipo === "carregar" ? destino.id : ID_SEM_ALVO;
  const [estado, despachar] = useReducer(
    reduzirDetalheUsuario,
    idAlvo,
    criarEstadoDetalheUsuario,
  );
  const token = sessao?.token;

  if (idAlvo !== ID_SEM_ALVO && estado.id !== idAlvo) {
    despachar({ tipo: "iniciar", id: idAlvo });
  }

  useEffect(() => {
    if (idAlvo === ID_SEM_ALVO || token === undefined) {
      return undefined;
    }
    let ativa = true;

    void operacoes.lerCadastro(idAlvo, token).then((resultado) => {
      if (!ativa) {
        return;
      }
      despachar(
        resultado.ok
          ? { tipo: "recebido", id: idAlvo, usuario: resultado.dados }
          : {
            tipo: "falhou",
            id: idAlvo,
            falha: resultado,
            mensagemPadrao404: obterMensagemPadraoStatus(404),
          },
      );
    });

    return () => {
      ativa = false;
    };
  }, [idAlvo, token, operacoes, tentativa]);

  if (sessao === null) {
    return null;
  }

  if (destino.tipo === "perfil") {
    return <Navigate to="/perfil" replace />;
  }

  function tentarNovamente() {
    despachar({ tipo: "iniciar", id: idAlvo });
    setTentativa((atual) => atual + 1);
  }

  const visivel = estado.id === idAlvo ? estado : criarEstadoDetalheUsuario(idAlvo);
  const voltar = <LinkTexto para={CAMINHO_LISTA_USUARIOS}>Voltar para a lista</LinkTexto>;

  return (
    <CartaoIngresso
      rotulo="Administração"
      titulo="Detalhes do usuário"
      descricao="Dados de cadastro de um usuário deste servidor."
      largura="media"
    >
      {destino.tipo === "invalido"
        ? (
          <>
            <Alerta tipo="erro" mensagem={MENSAGEM_ID_ROTA_INVALIDO} />
            <div className={estilos.acoes}>{voltar}</div>
          </>
        )
        : (
          <>
            <p role="status" className={estilos.situacao}>{textoSituacaoDetalhe(visivel)}</p>

            {visivel.fase === "sucesso" && (
              <dl className={estilos.dados}>
                {montarItensDetalheUsuario(visivel.usuario).map((item) => (
                  <div key={item.rotulo} className={estilos.item}>
                    <dt className={estilos.rotulo}>{item.rotulo}</dt>
                    <dd className={estilos.valor}>
                      {item.selo === "nenhum"
                        ? item.valor
                        : (
                          <SeloTipoUsuario administrador={item.selo === "administrador"}>
                            {item.valor}
                          </SeloTipoUsuario>
                        )}
                    </dd>
                  </div>
                ))}
              </dl>
            )}

            {visivel.fase === "nao_encontrado" && (
              <div role="alert" className={estilos.naoEncontrado}>
                <h2 className={estilos.tituloNaoEncontrado}>{TITULO_NAO_ENCONTRADO}</h2>
                <p>{visivel.explicacao}</p>
              </div>
            )}

            {visivel.fase === "erro" && <Alerta tipo="erro" mensagem={visivel.mensagem} />}

            <div className={estilos.acoes}>
              {visivel.fase === "erro" && (
                <Botao variante="secundaria" aoClicar={tentarNovamente}>Tentar novamente</Botao>
              )}
              {voltar}
            </div>
          </>
        )}
    </CartaoIngresso>
  );
}
