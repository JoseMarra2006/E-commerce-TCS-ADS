import { useEffect, useReducer, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { obterMensagemPadraoStatus } from "../api/cliente-http.ts";
import { Alerta } from "../componentes/Alerta.tsx";
import { Botao } from "../componentes/Botao.tsx";
import { CartaoIngresso } from "../componentes/CartaoIngresso.tsx";
import { DialogoConfirmacao } from "../componentes/DialogoConfirmacao.tsx";
import { juntarClasses } from "../componentes/juntar-classes.ts";
import { LinkTexto } from "../componentes/LinkTexto.tsx";
import { SeloEsgotado } from "../componentes/SeloEsgotado.tsx";
import { useOperacoes } from "../contextos/use-operacoes.ts";
import { useSessao } from "../contextos/use-sessao.ts";
import { AcoesDetalheProduto } from "./AcoesDetalheProduto.tsx";
import { AVISOS_DO_DETALHE_DE_PRODUTO, lerAvisoProduto } from "./aviso-produto.ts";
import { CAMINHO_LISTA_PRODUTOS, caminhoEdicaoProduto } from "./caminhos-produtos.ts";
import {
  criarEstadoDetalheProduto,
  decidirDestinoDetalheProduto,
  MENSAGEM_ID_PRODUTO_INVALIDO,
  montarItensDetalheProduto,
  reduzirDetalheProduto,
  textoSituacaoDetalheProduto,
  TITULO_PRODUTO_NAO_ENCONTRADO,
} from "./detalhe-produto.ts";
import {
  criarEstadoExclusaoProduto,
  destinoAposExclusao,
  dialogoExclusaoProdutoAberto,
  enviarExclusaoProduto,
  reduzirExclusaoProduto,
  ROTULO_CONFIRMAR_EXCLUSAO_PRODUTO,
  ROTULO_EXCLUINDO_PRODUTO,
  textoDialogoExclusaoProduto,
  textoErroDialogoExclusao,
  TITULO_DIALOGO_EXCLUSAO_PRODUTO,
} from "./exclusao-produto.ts";
import { podeGerenciarProdutos } from "./lista-produtos.ts";
import { useMontado } from "./use-montado.ts";
import { useTituloPagina } from "./use-titulo-pagina.ts";
import estilos from "./PaginaDetalheProduto.module.css";

const ID_SEM_ALVO = 0;

export function PaginaDetalheProduto() {
  useTituloPagina("Detalhes do produto");
  const { id: parametro } = useParams();
  const { sessao } = useSessao();
  const operacoes = useOperacoes();
  const navegar = useNavigate();
  const localizacao = useLocation();
  const montado = useMontado();
  const [tentativa, setTentativa] = useState(0);

  const destino = decidirDestinoDetalheProduto(parametro);
  const idAlvo = destino.tipo === "carregar" ? destino.id : ID_SEM_ALVO;
  const [estado, despachar] = useReducer(
    reduzirDetalheProduto,
    idAlvo,
    criarEstadoDetalheProduto,
  );
  const [aviso] = useState(() => ({
    id: idAlvo,
    texto: lerAvisoProduto(localizacao.state, AVISOS_DO_DETALHE_DE_PRODUTO),
  }));
  const temAvisoNoHistorico = lerAvisoProduto(localizacao.state) !== null;
  const [exclusao, despacharExclusao] = useReducer(
    reduzirExclusaoProduto,
    idAlvo,
    criarEstadoExclusaoProduto,
  );
  const token = sessao?.token;
  const idAtual = useRef(idAlvo);
  const travaExclusao = useRef(false);

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

    void operacoes.lerProduto(idAlvo, token).then((resultado) => {
      if (!ativa) {
        return;
      }
      despachar(
        resultado.ok
          ? { tipo: "recebido", id: idAlvo, produto: resultado.dados }
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

  function tentarNovamente() {
    despachar({ tipo: "iniciar", id: idAlvo });
    setTentativa((atual) => atual + 1);
  }

  async function confirmarExclusao() {
    if (token === undefined || exclusao.fase !== "confirmando") {
      return;
    }
    const id = idAlvo;
    const resultado = await enviarExclusaoProduto({
      excluirProduto: operacoes.excluirProduto,
      token,
      id,
      trava: travaExclusao,
      aoIniciar: () => despacharExclusao({ tipo: "iniciar_envio", id }),
    });
    if (resultado.tipo === "ignorado" || !montado.current || idAtual.current !== id) {
      return;
    }
    const destinoExclusao = destinoAposExclusao(resultado);
    if (destinoExclusao !== null) {
      navegar(destinoExclusao.para, { replace: true, state: destinoExclusao.estado });
      return;
    }
    if (resultado.tipo === "proibido") {
      despacharExclusao({ tipo: "falha_pagina", id, mensagem: resultado.mensagem });
    } else if (resultado.tipo === "falha") {
      despacharExclusao({ tipo: "falha_dialogo", id, mensagem: resultado.mensagem });
    } else {
      despacharExclusao({ tipo: "fim", id });
    }
  }

  const visivel = estado.id === idAlvo ? estado : criarEstadoDetalheProduto(idAlvo);
  const exclusaoVisivel = exclusao.id === idAlvo ? exclusao : criarEstadoExclusaoProduto(idAlvo);
  const podeGerenciar = podeGerenciarProdutos(sessao.usuario);
  const voltar = (
    <LinkTexto para={CAMINHO_LISTA_PRODUTOS}>Voltar para a lista de produtos</LinkTexto>
  );

  return (
    <CartaoIngresso
      rotulo="Estoque"
      titulo="Detalhes do produto"
      descricao="Dados e quantidade em estoque de um produto deste servidor."
      largura="media"
    >
      {destino.tipo === "invalido"
        ? (
          <>
            <Alerta tipo="erro" mensagem={MENSAGEM_ID_PRODUTO_INVALIDO} />
            <div className={estilos.acoes}>{voltar}</div>
          </>
        )
        : (
          <>
            {aviso.texto !== null && aviso.id === idAlvo && (
              <Alerta tipo="sucesso" mensagem={aviso.texto} />
            )}

            <p role="status" className={estilos.situacao}>
              {textoSituacaoDetalheProduto(visivel)}
            </p>

            {visivel.fase === "sucesso" && (
              <dl className={estilos.dados}>
                {montarItensDetalheProduto(visivel.produto).map((item) => (
                  <div
                    key={item.rotulo}
                    className={juntarClasses(
                      estilos.item,
                      item.multilinha || item.vazio ? estilos.itemLargo : undefined,
                    )}
                  >
                    <dt className={estilos.rotulo}>{item.rotulo}</dt>
                    <dd
                      className={juntarClasses(
                        estilos.valor,
                        item.multilinha ? estilos.multilinha : undefined,
                        item.vazio ? estilos.vazio : undefined,
                      )}
                    >
                      {item.esgotado
                        ? (
                          <span className={estilos.quantidade}>
                            {item.valor}
                            <SeloEsgotado />
                          </span>
                        )
                        : item.valor}
                    </dd>
                  </div>
                ))}
              </dl>
            )}

            {visivel.fase === "nao_encontrado" && (
              <div role="alert" className={estilos.naoEncontrado}>
                <h2 className={estilos.tituloNaoEncontrado}>{TITULO_PRODUTO_NAO_ENCONTRADO}</h2>
                <p>{visivel.explicacao}</p>
              </div>
            )}

            {visivel.fase === "erro" && <Alerta tipo="erro" mensagem={visivel.mensagem} />}

            {visivel.fase === "sucesso" && exclusaoVisivel.erroPagina !== null && (
              <Alerta tipo="erro" mensagem={exclusaoVisivel.erroPagina} />
            )}

            <div className={estilos.acoes}>
              {visivel.fase === "sucesso" && podeGerenciar && (
                <AcoesDetalheProduto
                  caminhoEdicao={caminhoEdicaoProduto(visivel.id)}
                  aoExcluir={() => despacharExclusao({ tipo: "abrir", id: idAlvo })}
                />
              )}
              {visivel.fase === "erro" && (
                <Botao variante="secundaria" aoClicar={tentarNovamente}>Tentar novamente</Botao>
              )}
              {voltar}
            </div>

            {visivel.fase === "sucesso" && podeGerenciar && (
              <DialogoConfirmacao
                aberto={dialogoExclusaoProdutoAberto(exclusaoVisivel)}
                titulo={TITULO_DIALOGO_EXCLUSAO_PRODUTO}
                descricao={textoDialogoExclusaoProduto(visivel.produto.nome)}
                textoConfirmar={ROTULO_CONFIRMAR_EXCLUSAO_PRODUTO}
                textoConfirmando={ROTULO_EXCLUINDO_PRODUTO}
                variante="perigo"
                carregando={exclusaoVisivel.fase === "excluindo"}
                erro={textoErroDialogoExclusao(exclusaoVisivel)}
                aoConfirmar={() => void confirmarExclusao()}
                aoCancelar={() => despacharExclusao({ tipo: "cancelar", id: idAlvo })}
              />
            )}
          </>
        )}
    </CartaoIngresso>
  );
}
