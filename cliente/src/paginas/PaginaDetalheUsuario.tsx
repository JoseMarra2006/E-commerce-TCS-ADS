import { useEffect, useReducer, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router";
import { obterMensagemPadraoStatus } from "../api/cliente-http.ts";
import { Alerta } from "../componentes/Alerta.tsx";
import { Botao } from "../componentes/Botao.tsx";
import { CartaoIngresso } from "../componentes/CartaoIngresso.tsx";
import { DialogoConfirmacao } from "../componentes/DialogoConfirmacao.tsx";
import { LinkTexto } from "../componentes/LinkTexto.tsx";
import { SeloTipoUsuario } from "../componentes/SeloTipoUsuario.tsx";
import { useOperacoes } from "../contextos/use-operacoes.ts";
import { useSessao } from "../contextos/use-sessao.ts";
import { lerAvisoUsuario } from "./aviso-usuario.ts";
import { CAMINHO_LISTA_USUARIOS, caminhoEdicaoUsuario } from "./caminhos-usuarios.ts";
import {
  criarEstadoDetalheUsuario,
  decidirDestinoDetalhe,
  MENSAGEM_ID_ROTA_INVALIDO,
  montarItensDetalheUsuario,
  reduzirDetalheUsuario,
  textoSituacaoDetalhe,
  TITULO_NAO_ENCONTRADO,
} from "./detalhe-usuario.ts";
import {
  criarEstadoExclusaoUsuario,
  decidirDestinoExclusao,
  dialogoExclusaoAberto,
  reduzirExclusaoUsuario,
  ROTULO_CONFIRMAR_EXCLUSAO_USUARIO,
  ROTULO_EXCLUINDO_USUARIO,
  textoDialogoExclusaoUsuario,
  TITULO_DIALOGO_EXCLUSAO_USUARIO,
} from "./exclusao-usuario.ts";
import { useMontado } from "./use-montado.ts";
import { useTituloPagina } from "./use-titulo-pagina.ts";
import estilos from "./PaginaDetalheUsuario.module.css";

const ID_SEM_ALVO = 0;

export function PaginaDetalheUsuario() {
  useTituloPagina("Detalhes do usuário");
  const { id: parametro } = useParams();
  const { sessao } = useSessao();
  const operacoes = useOperacoes();
  const navegar = useNavigate();
  const localizacao = useLocation();
  const montado = useMontado();
  const [tentativa, setTentativa] = useState(0);

  const destino = decidirDestinoDetalhe(parametro, sessao?.usuario.id ?? ID_SEM_ALVO);
  const idAlvo = destino.tipo === "carregar" ? destino.id : ID_SEM_ALVO;
  const [aviso] = useState(() => ({ id: idAlvo, texto: lerAvisoUsuario(localizacao.state) }));
  const temAvisoNoHistorico = lerAvisoUsuario(localizacao.state) !== null;
  const [estado, despachar] = useReducer(
    reduzirDetalheUsuario,
    idAlvo,
    criarEstadoDetalheUsuario,
  );
  const [exclusao, despacharExclusao] = useReducer(
    reduzirExclusaoUsuario,
    idAlvo,
    criarEstadoExclusaoUsuario,
  );
  const token = sessao?.token;
  const idAtual = useRef(idAlvo);
  const emExclusao = useRef(false);

  if (idAlvo !== ID_SEM_ALVO && estado.id !== idAlvo) {
    despachar({ tipo: "iniciar", id: idAlvo });
  }
  if (exclusao.id !== idAlvo) {
    despacharExclusao({ tipo: "iniciar", id: idAlvo });
  }

  useEffect(() => {
    idAtual.current = idAlvo;
  }, [idAlvo]);

  useEffect(() => {
    if (temAvisoNoHistorico) {
      navegar(localizacao.pathname, { replace: true });
    }
  }, [temAvisoNoHistorico, navegar, localizacao.pathname]);

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

  async function confirmarExclusao() {
    if (emExclusao.current || token === undefined || exclusao.fase !== "confirmando") {
      return;
    }
    const id = idAlvo;
    emExclusao.current = true;
    despacharExclusao({ tipo: "confirmar", id });
    const resultado = await operacoes.excluirCadastro(id, token);
    emExclusao.current = false;
    if (!montado.current || idAtual.current !== id) {
      return;
    }
    despacharExclusao({ tipo: "resultado", id, resultado });
    const destinoExclusao = decidirDestinoExclusao(resultado);
    if (destinoExclusao.tipo === "navegar") {
      navegar(destinoExclusao.para, { replace: true, state: destinoExclusao.estado });
    }
  }

  const visivel = estado.id === idAlvo ? estado : criarEstadoDetalheUsuario(idAlvo);
  const exclusaoVisivel = exclusao.id === idAlvo ? exclusao : criarEstadoExclusaoUsuario(idAlvo);
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
            {aviso.texto !== null && aviso.id === idAlvo && (
              <Alerta tipo="sucesso" mensagem={aviso.texto} />
            )}

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

            {visivel.fase === "sucesso" && exclusaoVisivel.fase === "erro" && (
              <Alerta tipo="erro" mensagem={exclusaoVisivel.mensagem} />
            )}

            <div className={estilos.acoes}>
              {visivel.fase === "sucesso" && (
                <Botao aoClicar={() => navegar(caminhoEdicaoUsuario(visivel.id))}>Editar</Botao>
              )}
              {visivel.fase === "sucesso" && (
                <Botao
                  variante="perigo"
                  aoClicar={() => despacharExclusao({ tipo: "abrir", id: idAlvo })}
                >
                  Excluir usuário
                </Botao>
              )}
              {visivel.fase === "erro" && (
                <Botao variante="secundaria" aoClicar={tentarNovamente}>Tentar novamente</Botao>
              )}
              {voltar}
            </div>

            {visivel.fase === "sucesso" && (
              <DialogoConfirmacao
                aberto={dialogoExclusaoAberto(exclusaoVisivel)}
                titulo={TITULO_DIALOGO_EXCLUSAO_USUARIO}
                descricao={textoDialogoExclusaoUsuario(visivel.usuario)}
                textoConfirmar={ROTULO_CONFIRMAR_EXCLUSAO_USUARIO}
                textoConfirmando={ROTULO_EXCLUINDO_USUARIO}
                variante="perigo"
                carregando={exclusaoVisivel.fase === "excluindo"}
                aoConfirmar={() => void confirmarExclusao()}
                aoCancelar={() => despacharExclusao({ tipo: "cancelar", id: idAlvo })}
              />
            )}
          </>
        )}
    </CartaoIngresso>
  );
}
