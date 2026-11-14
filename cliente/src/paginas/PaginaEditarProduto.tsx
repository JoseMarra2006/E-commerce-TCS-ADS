import { useEffect, useReducer, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import { Alerta } from "../componentes/Alerta.tsx";
import { Botao } from "../componentes/Botao.tsx";
import { CartaoIngresso } from "../componentes/CartaoIngresso.tsx";
import { LinkTexto } from "../componentes/LinkTexto.tsx";
import { useOperacoes } from "../contextos/use-operacoes.ts";
import { useSessao } from "../contextos/use-sessao.ts";
import type { CampoProduto, ErrosProduto } from "../validacao/validacao-produto.ts";
import type { AcaoCadastroProduto } from "./cadastro-produto.ts";
import { errosVisiveis, RESUMO_ERROS_PRODUTO, resumoVisivel } from "./cadastro-produto.ts";
import { criarEstadoAvisoProduto } from "./aviso-produto.ts";
import { CAMINHO_LISTA_PRODUTOS, caminhoDetalheProduto } from "./caminhos-produtos.ts";
import {
  decidirDestinoDetalheProduto,
  MENSAGEM_ID_PRODUTO_INVALIDO,
  TITULO_PRODUTO_NAO_ENCONTRADO,
} from "./detalhe-produto.ts";
import {
  criarEstadoEdicaoProduto,
  enviarEdicaoProduto,
  reduzirEdicaoProduto,
} from "./edicao-produto.ts";
import { AlertaFalhaProduto, FormularioProduto } from "./FormularioProduto.tsx";
import { useFocoFormularioProduto } from "./use-foco-formulario-produto.ts";
import { useMontado } from "./use-montado.ts";
import { useTituloPagina } from "./use-titulo-pagina.ts";
import estilos from "./PaginaDetalheProduto.module.css";

const ID_SEM_ALVO = 0;
const SEM_ERROS: ErrosProduto = {};

export function PaginaEditarProduto() {
  useTituloPagina("Editar produto");
  const { id: parametro } = useParams();
  const { sessao } = useSessao();
  const operacoes = useOperacoes();
  const navegar = useNavigate();
  const montado = useMontado();
  const [tentativa, setTentativa] = useState(0);

  const destino = decidirDestinoDetalheProduto(parametro);
  const idAlvo = destino.tipo === "carregar" ? destino.id : ID_SEM_ALVO;
  const [estado, despachar] = useReducer(reduzirEdicaoProduto, idAlvo, criarEstadoEdicaoProduto);
  const token = sessao?.token;
  const idAtual = useRef(idAlvo);
  const trava = useRef(false);

  const visivel = estado.id === idAlvo ? estado : criarEstadoEdicaoProduto(idAlvo);
  const erros = visivel.fase === "pronto" ? errosVisiveis(visivel.formulario) : SEM_ERROS;
  const foco = useFocoFormularioProduto(erros);

  if (idAlvo !== ID_SEM_ALVO && estado.id !== idAlvo) {
    despachar({ tipo: "iniciar", id: idAlvo });
  }

  useEffect(() => {
    idAtual.current = idAlvo;
  }, [idAlvo]);

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
          ? { tipo: "carregado", id: idAlvo, produto: resultado.dados }
          : { tipo: "falha_carregamento", id: idAlvo, falha: resultado },
      );
    });

    return () => {
      ativa = false;
    };
  }, [idAlvo, token, operacoes, tentativa]);

  if (sessao === null) {
    return null;
  }

  const tokenSessao = sessao.token;

  function noFormulario(id: number, acao: AcaoCadastroProduto) {
    despachar({ tipo: "formulario", id, acao });
  }

  function tentarCarregarNovamente() {
    despachar({ tipo: "iniciar", id: idAlvo });
    setTentativa((atual) => atual + 1);
  }

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (visivel.fase !== "pronto") {
      return;
    }
    const id = idAlvo;
    const resultado = await enviarEdicaoProduto(
      {
        atualizarProduto: operacoes.atualizarProduto,
        token: tokenSessao,
        id,
        trava,
        aoIniciar: () => noFormulario(id, { tipo: "iniciar_envio" }),
      },
      visivel.formulario.valores,
    );

    if (resultado.tipo === "ignorado") {
      return;
    }
    if (resultado.tipo === "invalido") {
      foco.pedirFoco("campo");
      noFormulario(id, { tipo: "envio_invalido" });
      return;
    }
    if (!montado.current || idAtual.current !== id) {
      return;
    }
    if (resultado.tipo === "salvo") {
      navegar(caminhoDetalheProduto(id), {
        replace: true,
        state: criarEstadoAvisoProduto("atualizado"),
      });
      return;
    }
    if (resultado.tipo === "nao_encontrado") {
      despachar({ tipo: "nao_encontrado", id, explicacao: resultado.explicacao });
      return;
    }
    if (resultado.tipo === "nao_autorizado") {
      noFormulario(id, { tipo: "fim_envio" });
      return;
    }
    foco.pedirFoco("alerta");
    noFormulario(id, { tipo: "falha_envio", falha: resultado.falha });
  }

  const voltar = (
    <LinkTexto para={CAMINHO_LISTA_PRODUTOS}>Voltar para a lista de produtos</LinkTexto>
  );

  function conteudo() {
    if (destino.tipo === "invalido") {
      return (
        <>
          <Alerta tipo="erro" mensagem={MENSAGEM_ID_PRODUTO_INVALIDO} />
          <div className={estilos.acoes}>{voltar}</div>
        </>
      );
    }

    if (visivel.fase === "carregando") {
      return (
        <>
          <p role="status" className={estilos.situacao}>Carregando dados do produto...</p>
          <div className={estilos.acoes}>{voltar}</div>
        </>
      );
    }

    if (visivel.fase === "nao_encontrado") {
      return (
        <>
          <div role="alert" className={estilos.naoEncontrado}>
            <h2 className={estilos.tituloNaoEncontrado}>{TITULO_PRODUTO_NAO_ENCONTRADO}</h2>
            <p>{visivel.explicacao}</p>
          </div>
          <div className={estilos.acoes}>{voltar}</div>
        </>
      );
    }

    if (visivel.fase === "falha_carregamento") {
      return (
        <>
          <Alerta tipo="erro" mensagem={visivel.mensagem} />
          <div className={estilos.acoes}>
            <Botao variante="secundaria" aoClicar={tentarCarregarNovamente}>
              Tentar novamente
            </Botao>
            {voltar}
          </div>
        </>
      );
    }

    const { formulario } = visivel;
    const id = visivel.id;

    return (
      <>
        {resumoVisivel(formulario) && <Alerta tipo="erro" mensagem={RESUMO_ERROS_PRODUTO} />}

        {formulario.erroServidor !== null && (
          <AlertaFalhaProduto falha={formulario.erroServidor} referencia={foco.referenciaAlerta} />
        )}

        <FormularioProduto
          valores={formulario.valores}
          erros={erros}
          enviando={formulario.fase === "enviando"}
          textoEnviar="Salvar alterações"
          textoEnviando="Salvando..."
          cancelarPara={caminhoDetalheProduto(id)}
          identificador={id}
          referencias={foco.referencias}
          aoAlterar={(campo: CampoProduto, valor: string) =>
            noFormulario(id, { tipo: "alterar", campo, valor })}
          aoSair={(campo: CampoProduto) => noFormulario(id, { tipo: "sair_do_campo", campo })}
          aoEnviar={(evento) => void enviar(evento)}
        />
      </>
    );
  }

  return (
    <CartaoIngresso
      rotulo="Administração"
      titulo="Editar produto"
      descricao="Altere os dados do produto e salve."
    >
      {conteudo()}
    </CartaoIngresso>
  );
}
