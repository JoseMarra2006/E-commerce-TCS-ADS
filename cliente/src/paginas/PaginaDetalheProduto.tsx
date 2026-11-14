import { useEffect, useReducer, useState } from "react";
import { useParams } from "react-router";
import { obterMensagemPadraoStatus } from "../api/cliente-http.ts";
import { Alerta } from "../componentes/Alerta.tsx";
import { Botao } from "../componentes/Botao.tsx";
import { CartaoIngresso } from "../componentes/CartaoIngresso.tsx";
import { juntarClasses } from "../componentes/juntar-classes.ts";
import { LinkTexto } from "../componentes/LinkTexto.tsx";
import { SeloEsgotado } from "../componentes/SeloEsgotado.tsx";
import { useOperacoes } from "../contextos/use-operacoes.ts";
import { useSessao } from "../contextos/use-sessao.ts";
import { CAMINHO_LISTA_PRODUTOS } from "./caminhos-produtos.ts";
import {
  criarEstadoDetalheProduto,
  decidirDestinoDetalheProduto,
  MENSAGEM_ID_PRODUTO_INVALIDO,
  montarItensDetalheProduto,
  reduzirDetalheProduto,
  textoSituacaoDetalheProduto,
  TITULO_PRODUTO_NAO_ENCONTRADO,
} from "./detalhe-produto.ts";
import { useTituloPagina } from "./use-titulo-pagina.ts";
import estilos from "./PaginaDetalheProduto.module.css";

const ID_SEM_ALVO = 0;

export function PaginaDetalheProduto() {
  useTituloPagina("Detalhes do produto");
  const { id: parametro } = useParams();
  const { sessao } = useSessao();
  const operacoes = useOperacoes();
  const [tentativa, setTentativa] = useState(0);

  const destino = decidirDestinoDetalheProduto(parametro);
  const idAlvo = destino.tipo === "carregar" ? destino.id : ID_SEM_ALVO;
  const [estado, despachar] = useReducer(
    reduzirDetalheProduto,
    idAlvo,
    criarEstadoDetalheProduto,
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

  const visivel = estado.id === idAlvo ? estado : criarEstadoDetalheProduto(idAlvo);
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
