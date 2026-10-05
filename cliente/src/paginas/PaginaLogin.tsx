import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useLocation, useNavigate } from "react-router";
import { Alerta } from "../componentes/Alerta.tsx";
import { Botao } from "../componentes/Botao.tsx";
import { CampoSenha } from "../componentes/CampoSenha.tsx";
import { CampoTexto } from "../componentes/CampoTexto.tsx";
import { CartaoIngresso } from "../componentes/CartaoIngresso.tsx";
import { LinkTexto } from "../componentes/LinkTexto.tsx";
import { useOperacoes } from "../contextos/use-operacoes.ts";
import { useSessao } from "../contextos/use-sessao.ts";
import { validarFormularioLogin } from "../validacao/validacao-campos.ts";
import type { ErrosLogin } from "../validacao/validacao-campos.ts";
import { lerEstadoLogin } from "./estado-navegacao.ts";
import { useTituloPagina } from "./use-titulo-pagina.ts";
import estilos from "./PaginaAutenticacao.module.css";

export function PaginaLogin() {
  useTituloPagina("Entrar");
  const operacoes = useOperacoes();
  const { iniciarSessao, avisoSessao: avisoDoContexto, consumirAvisoSessao } = useSessao();
  const navegar = useNavigate();
  const localizacao = useLocation();

  const [estadoInicial] = useState(() => lerEstadoLogin(localizacao.state));
  const [email, setEmail] = useState(estadoInicial.email ?? "");
  const [senha, setSenha] = useState("");
  const [erros, setErros] = useState<ErrosLogin>({});
  const [falha, setFalha] = useState<string | null>(null);
  const [avisoSessao] = useState(avisoDoContexto);
  const [enviando, setEnviando] = useState(false);

  const referenciaEmail = useRef<HTMLInputElement>(null);
  const referenciaSenha = useRef<HTMLInputElement>(null);
  const emEnvio = useRef(false);

  useEffect(() => {
    consumirAvisoSessao();
  }, [consumirAvisoSessao]);

  function alterarEmail(valor: string) {
    setEmail(valor);
    setErros((atuais) => ({ ...atuais, email: undefined }));
  }

  function alterarSenha(valor: string) {
    setSenha(valor);
    setErros((atuais) => ({ ...atuais, senha: undefined }));
  }

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (emEnvio.current) {
      return;
    }
    setFalha(null);

    const validacao = validarFormularioLogin({ email, senha });
    if (!validacao.ok) {
      setErros(validacao.erros);
      if (validacao.erros.email !== undefined) {
        referenciaEmail.current?.focus();
      } else {
        referenciaSenha.current?.focus();
      }
      return;
    }

    setErros({});
    emEnvio.current = true;
    setEnviando(true);
    try {
      const resultado = await operacoes.entrar(validacao.dados);
      if (resultado.ok) {
        iniciarSessao(resultado.dados);
        navegar("/perfil", { replace: true });
        return;
      }
      setFalha(resultado.mensagem);
      setSenha("");
    } finally {
      emEnvio.current = false;
      setEnviando(false);
    }
  }

  return (
    <CartaoIngresso
      rotulo="Acesso à bilheteria"
      titulo="Entrar"
      descricao="Informe seu e-mail e sua senha."
    >
      {estadoInicial.mensagem !== undefined && (
        <Alerta tipo="sucesso" mensagem={estadoInicial.mensagem} />
      )}
      {avisoSessao !== null && <Alerta tipo={avisoSessao.tipo} mensagem={avisoSessao.texto} />}

      <form className={estilos.formulario} onSubmit={enviar} noValidate>
        <CampoTexto
          rotulo="E-mail"
          valor={email}
          aoAlterar={alterarEmail}
          tipo="email"
          autoComplete="username"
          desabilitado={enviando}
          erro={erros.email}
          referencia={referenciaEmail}
        />
        <CampoSenha
          rotulo="Senha"
          valor={senha}
          aoAlterar={alterarSenha}
          autoComplete="current-password"
          desabilitado={enviando}
          erro={erros.senha}
          referencia={referenciaSenha}
        />
        <Botao tipo="submit" carregando={enviando} textoCarregando="Entrando...">
          Entrar
        </Botao>
      </form>

      {falha !== null && <Alerta tipo="erro" mensagem={falha} />}

      <p className={estilos.rodape}>
        Ainda não tem cadastro? <LinkTexto para="/cadastro">Criar conta</LinkTexto>
      </p>
    </CartaoIngresso>
  );
}
