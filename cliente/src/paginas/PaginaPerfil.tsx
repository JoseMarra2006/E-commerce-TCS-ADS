import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Alerta } from "../componentes/Alerta.tsx";
import { Botao } from "../componentes/Botao.tsx";
import { CartaoIngresso } from "../componentes/CartaoIngresso.tsx";
import { DialogoConfirmacao } from "../componentes/DialogoConfirmacao.tsx";
import { useConexao } from "../contextos/use-conexao.ts";
import { useOperacoes } from "../contextos/use-operacoes.ts";
import { useSair } from "../contextos/use-sair.ts";
import { useSessao } from "../contextos/use-sessao.ts";
import { lerEstadoPerfil } from "./estado-navegacao.ts";
import { formatarHorario, formatarNumeroCadastro } from "./formatacao.ts";
import { useMontado } from "./use-montado.ts";
import { useTituloPagina } from "./use-titulo-pagina.ts";
import estilos from "./PaginaPerfil.module.css";

export function PaginaPerfil() {
  useTituloPagina("Meu perfil");
  const { conexao } = useConexao();
  const { sessao, atualizarUsuario, encerrarSessaoLocal } = useSessao();
  const operacoes = useOperacoes();
  const { sair, saindo } = useSair();
  const navegar = useNavigate();
  const localizacao = useLocation();
  const montado = useMontado();

  const [mensagemInicial] = useState(() => lerEstadoPerfil(localizacao.state).mensagem);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [recebidoEm, setRecebidoEm] = useState<Date | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const [confirmando, setConfirmando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [erroExclusao, setErroExclusao] = useState<string | null>(null);
  const emExclusao = useRef(false);

  const idUsuario = sessao?.usuario.id;
  const token = sessao?.token;
  const temEstado = lerEstadoPerfil(localizacao.state).mensagem !== undefined;

  useEffect(() => {
    if (temEstado) {
      navegar("/perfil", { replace: true });
    }
  }, [temEstado, navegar]);

  useEffect(() => {
    if (idUsuario === undefined || token === undefined) {
      return undefined;
    }
    let ativa = true;

    void operacoes.lerCadastro(idUsuario, token).then((resultado) => {
      if (!ativa) {
        return;
      }
      setCarregando(false);
      if (resultado.ok) {
        atualizarUsuario(resultado.dados);
        setRecebidoEm(new Date());
      } else {
        setErro(resultado.mensagem);
      }
    });

    return () => {
      ativa = false;
    };
  }, [idUsuario, token, operacoes, atualizarUsuario, tentativa]);

  if (sessao === null) {
    return null;
  }

  const { usuario } = sessao;

  function buscarNovamente() {
    setCarregando(true);
    setErro(null);
    setTentativa((atual) => atual + 1);
  }

  function abrirConfirmacao() {
    setErroExclusao(null);
    setConfirmando(true);
  }

  function cancelarConfirmacao() {
    if (!excluindo) {
      setConfirmando(false);
    }
  }

  async function confirmarExclusao() {
    if (emExclusao.current || idUsuario === undefined || token === undefined) {
      return;
    }
    emExclusao.current = true;
    setExcluindo(true);
    setErroExclusao(null);

    const resultado = await operacoes.excluirCadastro(idUsuario, token);
    emExclusao.current = false;

    if (resultado.ok) {
      if (montado.current) {
        setConfirmando(false);
        setExcluindo(false);
      }
      encerrarSessaoLocal({ tipo: "sucesso", texto: "Seu cadastro foi excluído." });
      return;
    }

    const naoAutorizado = resultado.tipo === "http" && resultado.status === 401;
    if (montado.current && !naoAutorizado) {
      setExcluindo(false);
      setErroExclusao(resultado.mensagem);
    }
  }

  const textoSituacao = carregando
    ? "Atualizando seus dados..."
    : recebidoEm !== null && erro === null
    ? `Dados recebidos do servidor às ${formatarHorario(recebidoEm)}.`
    : "";

  return (
    <CartaoIngresso
      rotulo="Ingresso de acesso"
      titulo={usuario.nome}
      descricao="Seus dados de cadastro neste servidor."
      largura="media"
    >
      {mensagemInicial !== undefined && <Alerta tipo="sucesso" mensagem={mensagemInicial} />}

      <dl className={estilos.dados}>
        <div className={estilos.item}>
          <dt className={estilos.rotulo}>Nome</dt>
          <dd className={estilos.valor}>{usuario.nome}</dd>
        </div>
        <div className={estilos.item}>
          <dt className={estilos.rotulo}>E-mail</dt>
          <dd className={estilos.valor}>{usuario.email}</dd>
        </div>
        <div className={estilos.item}>
          <dt className={estilos.rotulo}>Cadastro</dt>
          <dd className={estilos.valor}>{formatarNumeroCadastro(usuario.id)}</dd>
        </div>
        <div className={estilos.item}>
          <dt className={estilos.rotulo}>Servidor</dt>
          <dd className={estilos.valor}>
            {conexao === null ? "" : `${conexao.ip}:${conexao.porta}`}
          </dd>
        </div>
      </dl>

      <p role="status" className={estilos.situacao}>{textoSituacao}</p>

      {erro !== null && <Alerta tipo="erro" mensagem={erro} />}

      <div className={estilos.acoes}>
        <Botao aoClicar={() => navegar("/perfil/editar")}>Editar cadastro</Botao>
        {erro !== null && (
          <Botao variante="secundaria" aoClicar={buscarNovamente}>
            Tentar novamente
          </Botao>
        )}
        <Botao
          variante="secundaria"
          carregando={carregando}
          textoCarregando="Atualizando..."
          aoClicar={buscarNovamente}
        >
          Atualizar dados
        </Botao>
        <Botao
          variante="secundaria"
          carregando={saindo}
          textoCarregando="Saindo..."
          aoClicar={() => void sair()}
        >
          Sair
        </Botao>
        <Botao variante="perigo" aoClicar={abrirConfirmacao}>
          Excluir cadastro
        </Botao>
      </div>

      <DialogoConfirmacao
        aberto={confirmando}
        titulo="Excluir cadastro?"
        descricao="Esta ação é permanente. Seus dados serão apagados deste servidor e você será desconectado."
        textoConfirmar="Excluir cadastro"
        textoConfirmando="Excluindo..."
        variante="perigo"
        carregando={excluindo}
        erro={erroExclusao ?? undefined}
        aoConfirmar={() => void confirmarExclusao()}
        aoCancelar={cancelarConfirmacao}
      />
    </CartaoIngresso>
  );
}
