import "./auxiliares/vigia-arquivos-reais.ts";
import { assert, assertEquals, assertGreater } from "@std/assert";
import { consultarUsuariosLogados } from "../src/logados/consulta-usuarios-logados.ts";
import {
  type InstantaneoLogados,
  MonitorUsuariosLogados,
  type OpcoesMonitorUsuariosLogados,
} from "../src/logados/monitor-usuarios-logados.ts";
import {
  EMAIL_ADM_PADRAO,
  MENSAGEM_ADM_PADRAO_CRIADO,
  SENHA_ADM_PADRAO,
} from "../src/modulos/usuarios/adm-padrao.ts";
import {
  API,
  cadastrar,
  comAmbienteLogados,
  conferirSemFalhas,
  esperarIgualAoBanco,
  esperarLista,
  eventosLogados,
  logar,
  sair,
  sessoesDe,
} from "./auxiliares/ambiente-logados.ts";
import {
  verificarRespostaListaProdutos,
  verificarRespostaUsuario,
  verificarRespostaVazia,
} from "./auxiliares/conformidade.ts";

const INTERVALO_RELEITURA_TESTE_MS = 200;
const MENSAGEM_INDISPONIVEL =
  "Não foi possível ler a lista de usuários logados. Nova tentativa em 0 segundos.";
const MENSAGEM_DISPONIVEL_DE_NOVO =
  "A lista de usuários logados voltou a ficar disponível.";

interface ControleMonitor {
  intervaloReleituraMs: number | undefined;
  ignorarSinais: boolean;
  falharLeitura: boolean;
  sinaisIgnorados: number;
}

class MonitorControlavel extends MonitorUsuariosLogados {
  constructor(
    opcoes: OpcoesMonitorUsuariosLogados,
    private readonly controle: ControleMonitor,
  ) {
    super(opcoes);
  }

  override solicitarAtualizacao(): void {
    if (this.controle.ignorarSinais) {
      this.controle.sinaisIgnorados++;
      return;
    }
    super.solicitarAtualizacao();
  }
}

function criarFabricaMonitor(controle: ControleMonitor) {
  return (opcoes: OpcoesMonitorUsuariosLogados) =>
    new MonitorControlavel({
      ...opcoes,
      intervaloReleituraMs: controle.intervaloReleituraMs,
      consultar: (conexao) => {
        if (controle.falharLeitura) {
          throw new Error("leitura indisponível simulada");
        }
        return consultarUsuariosLogados(conexao);
      },
    }, controle);
}

function usuarioDe(instantaneo: InstantaneoLogados, id: number) {
  const usuario = instantaneo.usuarios.find((u) => u.id === id);
  assert(usuario !== undefined, `usuário ${id} deveria estar na lista`);
  return usuario;
}

Deno.test("item q de ponta a ponta: a lista do SSE do painel acompanha cada passo, reinício, sinal perdido e indisponibilidade", async () => {
  const controle: ControleMonitor = {
    intervaloReleituraMs: undefined,
    ignorarSinais: false,
    falharLeitura: false,
    sinaisIgnorados: 0,
  };

  await comAmbienteLogados(async (ambiente) => {
    const cliente = await ambiente.conectar();
    const inicial = JSON.parse(eventosLogados(cliente)[0].dados);
    assertEquals(inicial.estado, "disponivel");
    assertEquals(inicial.usuarios, []);

    const idAna = await cadastrar(ambiente, "Ana Souza", "ana@teste.com");
    const idBruno = await cadastrar(ambiente, "Bruno Lima", "bruno@teste.com");
    const idCarla = await cadastrar(ambiente, "Carla Dias", "carla@teste.com");

    const ana1 = await logar(ambiente, "ana@teste.com");
    let lista = await esperarLista(
      cliente,
      (i) => sessoesDe(i, idAna) === 1,
      "primeiro login da Ana",
    );
    const desdeAna1 = usuarioDe(lista, idAna).desde;
    const ana2 = await logar(ambiente, "ana@teste.com");
    lista = await esperarLista(
      cliente,
      (i) => sessoesDe(i, idAna) === 2,
      "segundo login da Ana",
    );
    assertEquals(usuarioDe(lista, idAna).desde, desdeAna1);

    const bruno = await logar(ambiente, "bruno@teste.com");
    await esperarLista(cliente, (i) => sessoesDe(i, idBruno) === 1, "Bruno");
    const carla1 = await logar(ambiente, "carla@teste.com");
    const carla2 = await logar(ambiente, "carla@teste.com");
    await esperarLista(cliente, (i) => sessoesDe(i, idCarla) === 2, "Carla");
    const adm = await logar(ambiente, EMAIL_ADM_PADRAO, SENHA_ADM_PADRAO);
    lista = await esperarIgualAoBanco(
      ambiente.caminhoBanco,
      cliente,
      "login do ADM",
    );
    assertEquals(lista.usuarios.map((u) => u.id), [
      adm.usuario.id,
      idAna,
      idBruno,
      idCarla,
    ]);
    assertEquals(lista.usuarios.map((u) => u.tipo), [
      "administrador",
      "comum",
      "comum",
      "comum",
    ]);
    assertEquals(lista.usuarios.map((u) => u.sessoes), [1, 2, 1, 2]);
    for (const usuario of lista.usuarios) {
      assertEquals(new Date(usuario.desde).toISOString(), usuario.desde);
      assertEquals(Object.keys(usuario), [
        "id",
        "nome",
        "email",
        "tipo",
        "sessoes",
        "desde",
      ]);
    }

    await sair(ambiente, ana1);
    lista = await esperarLista(
      cliente,
      (i) => sessoesDe(i, idAna) === 1,
      "logout de uma das sessões da Ana",
    );
    assertGreater(usuarioDe(lista, idAna).desde, desdeAna1);

    await sair(ambiente, carla1);
    await esperarLista(cliente, (i) => sessoesDe(i, idCarla) === 1, "Carla 1");
    await sair(ambiente, carla2);
    await esperarLista(
      cliente,
      (i) => !i.usuarios.some((u) => u.id === idCarla),
      "último logout da Carla",
    );

    await verificarRespostaUsuario(
      await ambiente.api("PUT", `${API}/users/${idBruno}`, {
        token: bruno.token,
        corpo: {
          nome: "Bruno Atualizado",
          email: "bruno.novo@teste.com",
          senha: "outra123",
        },
      }),
      200,
    );
    lista = await esperarLista(
      cliente,
      (i) => i.usuarios.some((u) => u.email === "bruno.novo@teste.com"),
      "PUT do Bruno",
    );
    assertEquals(usuarioDe(lista, idBruno).nome, "Bruno Atualizado");

    await verificarRespostaUsuario(
      await ambiente.api("PATCH", `${API}/users/${idAna}`, {
        token: adm.token,
        corpo: { nome: "Ana Nova", email: "ana.nova@teste.com" },
      }),
      200,
    );
    lista = await esperarLista(
      cliente,
      (i) => i.usuarios.some((u) => u.nome === "Ana Nova"),
      "PATCH da Ana pelo ADM",
    );
    assertEquals(usuarioDe(lista, idAna).email, "ana.nova@teste.com");

    await verificarRespostaVazia(
      await ambiente.api("DELETE", `${API}/users/${idBruno}`, {
        token: adm.token,
      }),
    );
    await esperarLista(
      cliente,
      (i) => !i.usuarios.some((u) => u.id === idBruno),
      "exclusão do Bruno logado pelo ADM",
    );

    await verificarRespostaVazia(
      await ambiente.api("DELETE", `${API}/users/${adm.usuario.id}`, {
        token: adm.token,
      }),
    );
    lista = await esperarIgualAoBanco(
      ambiente.caminhoBanco,
      cliente,
      "ADM excluiu a si",
    );
    assertEquals(lista.usuarios.map((u) => u.id), [idAna]);

    const quantidadeAntesDoReinicio = eventosLogados(cliente).length;
    assertEquals((await ambiente.controlador.parar()).ok, true);
    await esperarLista(
      cliente,
      (i) => i.estado === "indisponivel",
      "parada do controlador",
    );
    controle.intervaloReleituraMs = INTERVALO_RELEITURA_TESTE_MS;
    await ambiente.iniciar();
    await cliente.esperar(
      () =>
        eventosLogados(cliente).slice(quantidadeAntesDoReinicio).some((e) =>
          JSON.parse(e.dados).estado === "disponivel"
        ),
      "primeiro evento depois do reinício",
    );
    const depoisDoReinicio = eventosLogados(cliente)
      .slice(quantidadeAntesDoReinicio)
      .map((e) => JSON.parse(e.dados) as InstantaneoLogados);
    assertEquals(depoisDoReinicio[0].estado, "indisponivel");
    assertEquals(depoisDoReinicio[1].estado, "disponivel");
    assertEquals(depoisDoReinicio[1].usuarios.map((u) => u.id), [idAna]);
    assertEquals(depoisDoReinicio[1].usuarios[0].sessoes, 1);
    assert(
      ambiente.registros.some((r) =>
        r.tipo === "sistema" && r.mensagem === MENSAGEM_ADM_PADRAO_CRIADO
      ),
    );

    controle.ignorarSinais = true;
    const anaRelogada = await logar(ambiente, "ana.nova@teste.com");
    await ambiente.controlador.substituirThread(1);
    const idDiego = await cadastrar(ambiente, "Diego Reis", "diego@teste.com");
    const diego = await logar(ambiente, "diego@teste.com");
    await ambiente.controlador.substituirThread(2);
    await sair(ambiente, ana2);
    await logar(ambiente, EMAIL_ADM_PADRAO, SENHA_ADM_PADRAO);
    assertGreater(controle.sinaisIgnorados, 3);
    lista = await esperarIgualAoBanco(
      ambiente.caminhoBanco,
      cliente,
      "convergência pela releitura de segurança",
      INTERVALO_RELEITURA_TESTE_MS * 5,
    );
    assertEquals(sessoesDe(lista, idAna), 1);
    assertEquals(sessoesDe(lista, idDiego), 1);
    assertEquals(lista.usuarios.length, 3);
    assert(
      ambiente.registros.some((r) =>
        r.tipo === "sistema" && r.mensagem === "A thread 1 foi substituída."
      ),
    );
    controle.ignorarSinais = false;

    controle.falharLeitura = true;
    await esperarLista(
      cliente,
      (i) => i.estado === "indisponivel" && i.usuarios.length === 0,
      "monitor indisponível",
      INTERVALO_RELEITURA_TESTE_MS * 5,
    );
    assertEquals(ambiente.controlador.obterEstado().status, "em_execucao");
    await verificarRespostaUsuario(
      await ambiente.api("GET", `${API}/users/${idDiego}`, {
        token: diego.token,
      }),
      200,
    );
    await verificarRespostaListaProdutos(
      await ambiente.api("GET", `${API}/products`, { token: diego.token }),
    );
    await sair(ambiente, diego);
    controle.falharLeitura = false;
    lista = await esperarIgualAoBanco(
      ambiente.caminhoBanco,
      cliente,
      "recuperação do monitor",
      INTERVALO_RELEITURA_TESTE_MS * 5,
    );
    assertEquals(sessoesDe(lista, idDiego), 0);
    assert(
      ambiente.registros.some((r) =>
        r.tipo === "sistema" && r.mensagem === MENSAGEM_DISPONIVEL_DE_NOVO
      ),
    );
    assertEquals(
      ambiente.registros.filter((r) =>
        r.tipo === "sistema" && r.mensagem === MENSAGEM_INDISPONIVEL
      ).length,
      1,
    );

    const bruto = cliente.bruto();
    for (
      const proibido of [
        ana1.token,
        ana1.id,
        anaRelogada.token,
        anaRelogada.id,
        adm.token,
        diego.id,
        "senha",
        "salt",
        "hash",
        "token",
      ]
    ) {
      assertEquals(
        eventosLogados(cliente).some((e) => e.dados.includes(proibido)),
        false,
        `evento logados contém ${proibido}`,
      );
    }
    assert(bruto.length > 0);
    assertEquals(ambiente.controlador.obterEstado().status, "em_execucao");
    conferirSemFalhas(ambiente.registros, [MENSAGEM_INDISPONIVEL]);
  }, {
    opcoesControlador: { criarMonitorLogados: criarFabricaMonitor(controle) },
  });
});
