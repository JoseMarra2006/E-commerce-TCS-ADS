import { useEffect, useReducer, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Alerta } from "../componentes/Alerta.tsx";
import { Botao } from "../componentes/Botao.tsx";
import { CartaoIngresso } from "../componentes/CartaoIngresso.tsx";
import { useOperacoes } from "../contextos/use-operacoes.ts";
import { useSessao } from "../contextos/use-sessao.ts";
import { lerAvisoProduto } from "./aviso-produto.ts";
import { AcoesListaProdutos } from "./AcoesListaProdutos.tsx";
import {
  ESTADO_INICIAL_LISTA_PRODUTOS,
  montarLinhasProdutos,
  podeCadastrarProduto,
  reduzirListaProdutos,
  textoContadorProdutos,
} from "./lista-produtos.ts";
import type { EstadoListaProdutos } from "./lista-produtos.ts";
import { TabelaProdutos } from "./TabelaProdutos.tsx";
import { useTituloPagina } from "./use-titulo-pagina.ts";
import estilos from "./PaginaProdutos.module.css";

function textoSituacao(estado: EstadoListaProdutos): string {
  switch (estado.fase) {
    case "carregando":
      return "Carregando produtos...";
    case "recarregando":
      return "Atualizando a lista de produtos...";
    case "sucesso":
      return textoContadorProdutos(estado.produtos.length);
    case "erro":
      return "";
  }
}

export function PaginaProdutos() {
  useTituloPagina("Produtos");
  const { sessao } = useSessao();
  const operacoes = useOperacoes();
  const navegar = useNavigate();
  const localizacao = useLocation();
  const [aviso] = useState(() => lerAvisoProduto(localizacao.state));
  const temAvisoNoHistorico = lerAvisoProduto(localizacao.state) !== null;
  const [estado, despachar] = useReducer(reduzirListaProdutos, ESTADO_INICIAL_LISTA_PRODUTOS);
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

    void operacoes.listarProdutos(token).then((resultado) => {
      if (!ativa) {
        return;
      }
      despachar(
        resultado.ok
          ? { tipo: "recebido", produtos: resultado.dados }
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
  const linhas = comDados ? montarLinhasProdutos(estado.produtos) : [];
  const recarregando = estado.fase === "recarregando";
  const podeCadastrar = podeCadastrarProduto(sessao.usuario);

  return (
    <CartaoIngresso
      rotulo="Estoque"
      titulo="Produtos"
      descricao="Estoque de ingressos disponível neste servidor."
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
        <p className={estilos.vazio}>Nenhum produto cadastrado.</p>
      )}

      {comDados && linhas.length > 0 && (
        <TabelaProdutos linhas={linhas} recarregando={recarregando} />
      )}

      {comDados && (
        <AcoesListaProdutos
          recarregando={recarregando}
          podeCadastrar={podeCadastrar}
          aoRecarregar={recarregar}
        />
      )}
    </CartaoIngresso>
  );
}
