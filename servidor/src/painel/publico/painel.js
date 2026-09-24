const token = document.querySelector('meta[name="token-painel"]').content;

const elementoAvisoConexao = document.getElementById("aviso-conexao");
const elementoSeloStatus = document.getElementById("selo-status");
const elementoCampoPorta = document.getElementById("campo-porta");
const elementoMensagemValidacaoPorta = document.getElementById(
  "mensagem-validacao-porta",
);
const elementoMensagemAcao = document.getElementById("mensagem-acao");
const elementoBotaoIniciar = document.getElementById("botao-iniciar");
const elementoBotaoParar = document.getElementById("botao-parar");
const elementoTextoStatus = document.getElementById("texto-status");
const elementoTextoPorta = document.getElementById("texto-porta");
const elementoTextoErro = document.getElementById("texto-erro");
const elementoListaEnderecos = document.getElementById("lista-enderecos");
const elementoGradeThreads = document.getElementById("grade-threads");
const elementoListaMensagens = document.getElementById("lista-mensagens");
const elementoBotaoLimpar = document.getElementById("botao-limpar");
const elementoBotaoEncerrar = document.getElementById("botao-encerrar");

const ROTULOS_STATUS = {
  parada: "Parada",
  iniciando: "Iniciando",
  em_execucao: "Em execução",
  parando: "Parando",
  erro: "Erro",
};

const LIMITE_MENSAGENS_EXIBIDAS = 500;

let estadoAtual = null;

function validarPorta(texto) {
  const textoLimpo = texto.trim();

  if (textoLimpo.length === 0) {
    return { ok: false, mensagem: "Informe a porta." };
  }

  if (!/^[0-9]+$/.test(textoLimpo)) {
    return { ok: false, mensagem: "A porta deve conter apenas números." };
  }

  const porta = Number(textoLimpo);

  if (porta < 1 || porta > 65535) {
    return { ok: false, mensagem: "A porta deve estar entre 1 e 65535." };
  }

  return { ok: true, porta };
}

function formatarHorario(horarioIso) {
  const data = new Date(horarioIso);
  const doisDigitos = (valor) => String(valor).padStart(2, "0");
  return `${doisDigitos(data.getHours())}:${doisDigitos(data.getMinutes())}:${
    doisDigitos(data.getSeconds())
  }`;
}

function classeStatusHttp(status) {
  if (status >= 200 && status < 300) {
    return "registro-status-2xx";
  }
  if (status >= 400 && status < 500) {
    return "registro-status-4xx";
  }
  if (status >= 500) {
    return "registro-status-5xx";
  }
  return "";
}

function estaRoladoParaBaixo() {
  const distancia = elementoListaMensagens.scrollHeight -
    elementoListaMensagens.scrollTop -
    elementoListaMensagens.clientHeight;
  return distancia < 24;
}

function adicionarElementoRegistro(elemento) {
  const deveRolar = estaRoladoParaBaixo();

  elementoListaMensagens.appendChild(elemento);

  while (elementoListaMensagens.children.length > LIMITE_MENSAGENS_EXIBIDAS) {
    elementoListaMensagens.removeChild(elementoListaMensagens.firstChild);
  }

  if (deveRolar) {
    elementoListaMensagens.scrollTop = elementoListaMensagens.scrollHeight;
  }
}

function renderizarRegistroRequisicao(registro) {
  const detalhes = document.createElement("details");
  detalhes.className = "registro " + classeStatusHttp(registro.status);

  const sumario = document.createElement("summary");
  const threadTexto = registro.thread === null
    ? "-"
    : `Thread ${registro.thread}`;
  sumario.textContent = `${
    formatarHorario(registro.horario)
  } | ${threadTexto} | ${registro.metodo} ${registro.caminho} | ${registro.status} | ${
    Math.round(registro.duracaoMs)
  } ms | ${registro.ipOrigem}`;
  detalhes.appendChild(sumario);

  const tituloRecebido = document.createElement("p");
  tituloRecebido.textContent = "Recebido";
  detalhes.appendChild(tituloRecebido);

  const preRecebido = document.createElement("pre");
  preRecebido.textContent = registro.corpoRecebido ?? "(sem corpo)";
  detalhes.appendChild(preRecebido);

  const tituloEnviado = document.createElement("p");
  tituloEnviado.textContent = "Enviado";
  detalhes.appendChild(tituloEnviado);

  const preEnviado = document.createElement("pre");
  preEnviado.textContent = registro.corpoEnviado ?? "(sem corpo)";
  detalhes.appendChild(preEnviado);

  adicionarElementoRegistro(detalhes);
}

function renderizarRegistroSistema(registro) {
  const linha = document.createElement("div");
  linha.className = "registro registro-sistema" +
    (registro.nivel === "erro" ? " registro-sistema-erro" : "");
  linha.textContent = `${
    formatarHorario(registro.horario)
  } | ${registro.mensagem}`;
  adicionarElementoRegistro(linha);
}

function renderizarRegistro(registro) {
  if (registro.tipo === "requisicao") {
    renderizarRegistroRequisicao(registro);
    return;
  }
  renderizarRegistroSistema(registro);
}

function limparElemento(elemento) {
  while (elemento.firstChild) {
    elemento.removeChild(elemento.firstChild);
  }
}

function renderizarEnderecos(enderecos) {
  limparElemento(elementoListaEnderecos);

  for (const endereco of enderecos) {
    const item = document.createElement("li");

    const textoEndereco = document.createElement("span");
    textoEndereco.textContent = endereco;
    item.appendChild(textoEndereco);

    const botaoCopiar = document.createElement("button");
    botaoCopiar.type = "button";
    botaoCopiar.textContent = "Copiar";
    botaoCopiar.addEventListener("click", () => {
      navigator.clipboard.writeText(endereco).then(() => {
        const textoOriginal = botaoCopiar.textContent;
        botaoCopiar.textContent = "Copiado!";
        setTimeout(() => {
          botaoCopiar.textContent = textoOriginal;
        }, 2000);
      }).catch(() => {
        botaoCopiar.textContent = "Não foi possível copiar.";
      });
    });
    item.appendChild(botaoCopiar);

    elementoListaEnderecos.appendChild(item);
  }
}

function renderizarThreads(threads) {
  limparElemento(elementoGradeThreads);

  for (const thread of threads) {
    const caixa = document.createElement("div");
    caixa.className = "caixa-thread";

    const titulo = document.createElement("strong");
    titulo.textContent = `Thread ${thread.numero}`;
    caixa.appendChild(titulo);

    const linhaAndamento = document.createElement("p");
    linhaAndamento.textContent = `${thread.emAndamento} em andamento`;
    caixa.appendChild(linhaAndamento);

    const linhaStatus = document.createElement("p");
    linhaStatus.textContent = thread.pronta ? "Pronta" : "Reiniciando";
    caixa.appendChild(linhaStatus);

    elementoGradeThreads.appendChild(caixa);
  }
}

function atualizarControles(estado) {
  const podeIniciar = estado.status === "parada" || estado.status === "erro";
  const podeParar = estado.status === "em_execucao";

  elementoBotaoIniciar.disabled = !podeIniciar;
  elementoBotaoParar.disabled = !podeParar;
  elementoCampoPorta.disabled = !podeIniciar;
}

function renderizarEstado(estado) {
  estadoAtual = estado;

  elementoSeloStatus.dataset.status = estado.status;
  elementoSeloStatus.textContent = ROTULOS_STATUS[estado.status] ??
    estado.status;
  elementoTextoStatus.textContent = ROTULOS_STATUS[estado.status] ??
    estado.status;
  elementoTextoPorta.textContent = estado.porta === null
    ? "-"
    : String(estado.porta);

  if (estado.mensagemErro) {
    elementoTextoErro.hidden = false;
    elementoTextoErro.textContent = estado.mensagemErro;
  } else {
    elementoTextoErro.hidden = true;
    elementoTextoErro.textContent = "";
  }

  renderizarEnderecos(estado.enderecos);
  renderizarThreads(estado.threads);
  atualizarControles(estado);
}

async function enviarAcao(caminho, corpo) {
  const resposta = await fetch(caminho, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Token-Painel": token,
    },
    body: JSON.stringify(corpo ?? {}),
  });
  return await resposta.json();
}

elementoBotaoIniciar.addEventListener("click", async () => {
  const valorDigitado = elementoCampoPorta.value;
  const validacao = validarPorta(valorDigitado);

  if (!validacao.ok) {
    elementoMensagemValidacaoPorta.textContent = validacao.mensagem;
    return;
  }

  elementoMensagemValidacaoPorta.textContent = "";
  elementoBotaoIniciar.disabled = true;

  try {
    const resultado = await enviarAcao("/acoes/iniciar", {
      porta: valorDigitado,
    });
    elementoMensagemAcao.textContent = resultado.mensagem ?? "";
  } catch {
    elementoMensagemAcao.textContent =
      "Não foi possível comunicar com o painel.";
  } finally {
    if (estadoAtual) {
      atualizarControles(estadoAtual);
    }
  }
});

elementoBotaoParar.addEventListener("click", async () => {
  elementoBotaoParar.disabled = true;

  try {
    const resultado = await enviarAcao("/acoes/parar");
    elementoMensagemAcao.textContent = resultado.mensagem ?? "";
  } catch {
    elementoMensagemAcao.textContent =
      "Não foi possível comunicar com o painel.";
  } finally {
    if (estadoAtual) {
      atualizarControles(estadoAtual);
    }
  }
});

elementoBotaoEncerrar.addEventListener("click", async () => {
  const confirmado = confirm("Deseja encerrar o servidor?");
  if (!confirmado) {
    return;
  }

  try {
    const resultado = await enviarAcao("/acoes/encerrar");
    elementoMensagemAcao.textContent = resultado.mensagem ?? "";
  } catch {
    elementoMensagemAcao.textContent =
      "Não foi possível comunicar com o painel.";
  }

  elementoBotaoIniciar.disabled = true;
  elementoBotaoParar.disabled = true;
  elementoBotaoEncerrar.disabled = true;
  elementoCampoPorta.disabled = true;
});

elementoBotaoLimpar.addEventListener("click", () => {
  limparElemento(elementoListaMensagens);
});

function conectarEventos() {
  const origem = new EventSource("/eventos");

  origem.addEventListener("estado", (evento) => {
    elementoAvisoConexao.hidden = true;
    renderizarEstado(JSON.parse(evento.data));
  });

  origem.addEventListener("registro", (evento) => {
    elementoAvisoConexao.hidden = true;
    renderizarRegistro(JSON.parse(evento.data));
  });

  origem.addEventListener("ping", () => {
    elementoAvisoConexao.hidden = true;
  });

  origem.addEventListener("error", () => {
    elementoAvisoConexao.hidden = false;
  });
}

conectarEventos();
