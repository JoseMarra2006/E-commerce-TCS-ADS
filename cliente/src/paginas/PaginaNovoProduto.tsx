import { useReducer, useRef } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router";
import { Alerta } from "../componentes/Alerta.tsx";
import { CartaoIngresso } from "../componentes/CartaoIngresso.tsx";
import { useOperacoes } from "../contextos/use-operacoes.ts";
import { useSessao } from "../contextos/use-sessao.ts";
import type { CampoProduto } from "../validacao/validacao-produto.ts";
import { criarEstadoAvisoProduto } from "./aviso-produto.ts";
import {
  criarEstadoCadastroProduto,
  enviarCadastroProduto,
  errosVisiveis,
  reduzirCadastroProduto,
  RESUMO_ERROS_PRODUTO,
  resumoVisivel,
} from "./cadastro-produto.ts";
import { CAMINHO_LISTA_PRODUTOS } from "./caminhos-produtos.ts";
import { AlertaFalhaProduto, FormularioProduto } from "./FormularioProduto.tsx";
import { useFocoFormularioProduto } from "./use-foco-formulario-produto.ts";
import { useMontado } from "./use-montado.ts";
import { useTituloPagina } from "./use-titulo-pagina.ts";

export function PaginaNovoProduto() {
  useTituloPagina("Novo produto");
  const { sessao } = useSessao();
  const operacoes = useOperacoes();
  const navegar = useNavigate();
  const montado = useMontado();
  const [estado, despachar] = useReducer(
    reduzirCadastroProduto,
    undefined,
    criarEstadoCadastroProduto,
  );
  const erros = errosVisiveis(estado);
  const foco = useFocoFormularioProduto(erros);
  const trava = useRef(false);

  if (sessao === null) {
    return null;
  }

  const { token } = sessao;
  const enviando = estado.fase === "enviando";

  function alterar(campo: CampoProduto, valor: string) {
    despachar({ tipo: "alterar", campo, valor });
  }

  function sair(campo: CampoProduto) {
    despachar({ tipo: "sair_do_campo", campo });
  }

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const resultado = await enviarCadastroProduto(
      {
        criarProduto: operacoes.criarProduto,
        token,
        trava,
        aoIniciar: () => despachar({ tipo: "iniciar_envio" }),
      },
      estado.valores,
    );

    if (resultado.tipo === "ignorado") {
      return;
    }
    if (resultado.tipo === "invalido") {
      foco.pedirFoco("campo");
      despachar({ tipo: "envio_invalido" });
      return;
    }
    if (!montado.current) {
      return;
    }
    if (resultado.tipo === "criado") {
      navegar(CAMINHO_LISTA_PRODUTOS, { state: criarEstadoAvisoProduto("criado") });
      return;
    }
    if (resultado.tipo === "nao_autorizado") {
      despachar({ tipo: "fim_envio" });
      return;
    }
    foco.pedirFoco("alerta");
    despachar({ tipo: "falha_envio", falha: resultado.falha });
  }

  return (
    <CartaoIngresso
      rotulo="Administração"
      titulo="Novo produto"
      descricao="Informe os dados do produto para cadastrá-lo no estoque."
    >
      {resumoVisivel(estado) && <Alerta tipo="erro" mensagem={RESUMO_ERROS_PRODUTO} />}

      {estado.erroServidor !== null && (
        <AlertaFalhaProduto falha={estado.erroServidor} referencia={foco.referenciaAlerta} />
      )}

      <FormularioProduto
        valores={estado.valores}
        erros={erros}
        enviando={enviando}
        textoEnviar="Cadastrar produto"
        textoEnviando="Cadastrando..."
        cancelarPara={CAMINHO_LISTA_PRODUTOS}
        referencias={foco.referencias}
        aoAlterar={alterar}
        aoSair={sair}
        aoEnviar={(evento) => void enviar(evento)}
      />
    </CartaoIngresso>
  );
}
