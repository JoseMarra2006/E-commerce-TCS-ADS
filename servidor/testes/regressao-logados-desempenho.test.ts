import "./auxiliares/vigia-arquivos-reais.ts";
import { assert, assertEquals, assertLess, assertThrows } from "@std/assert";
import type { ConexaoBanco } from "../src/banco/conexao.ts";
import {
  ControladorServidor,
  type OpcoesControladorServidor,
} from "../src/controlador-servidor.ts";
import { abrirConexaoSomenteLeitura } from "../src/logados/consulta-usuarios-logados.ts";
import {
  type InstantaneoLogados,
  MonitorUsuariosLogados,
} from "../src/logados/monitor-usuarios-logados.ts";
import {
  EMAIL_ADM_PADRAO,
  SENHA_ADM_PADRAO,
} from "../src/modulos/usuarios/adm-padrao.ts";
import {
  type AmbienteLogados,
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
  verificarRespostaProduto,
  verificarRespostaUsuario,
} from "./auxiliares/conformidade.ts";
import {
  type MedicaoConsulta,
  medirConsultaLogados,
  medirLatenciaLogins,
  popularBancoCarga,
} from "./auxiliares/medicoes-logados.ts";

const LATENCIA_MAXIMA_MS = 1000;
const CONSULTA_MAXIMA_MS = 100;
const USUARIOS_CARGA = 200;
const SESSOES_POR_USUARIO = 25;
const CICLOS_VAZAMENTO = 20;

class ControladorContador extends ControladorServidor {
  readonly ouvintes = new Map<string, number>();

  override addEventListener(
    tipo: string,
    ouvinte: EventListenerOrEventListenerObject | null,
    opcoes?: boolean | AddEventListenerOptions,
  ): void {
    if (ouvinte !== null) {
      this.ouvintes.set(tipo, (this.ouvintes.get(tipo) ?? 0) + 1);
    }
    super.addEventListener(tipo, ouvinte, opcoes);
  }

  override removeEventListener(
    tipo: string,
    ouvinte: EventListenerOrEventListenerObject | null,
    opcoes?: boolean | EventListenerOptions,
  ): void {
    if (ouvinte !== null) {
      this.ouvintes.set(tipo, (this.ouvintes.get(tipo) ?? 0) - 1);
    }
    super.removeEventListener(tipo, ouvinte, opcoes);
  }
}

async function esperarAte(
  condicao: () => boolean,
  descricao: string,
): Promise<void> {
  const inicio = Date.now();
  while (!condicao()) {
    if (Date.now() - inicio > 2000) {
      throw new Error(`Condição não atingida: ${descricao}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

Deno.test("latência: 30 logins sequenciais chegam ao SSE em menos de 1 s cada", async () => {
  await comAmbienteLogados(async (ambiente) => {
    const cliente = await ambiente.conectar();
    const medicao = await medirLatenciaLogins(ambiente, cliente, 30);
    assertEquals(medicao.latenciasMs.length, 30);
    assertLess(medicao.maximoMs, LATENCIA_MAXIMA_MS);
    conferirSemFalhas(ambiente.registros);
  });
});

Deno.test("carga: 200 usuários e 5.000 sessões, consulta abaixo de 100 ms e painel e API seguem respondendo", async () => {
  let medicao: MedicaoConsulta | null = null;
  await comAmbienteLogados(async (ambiente) => {
    assert(medicao !== null);
    assertEquals(medicao.usuarios, USUARIOS_CARGA);
    assertEquals(medicao.sessoes, USUARIOS_CARGA * SESSOES_POR_USUARIO);
    assertLess(medicao.maximoMs, CONSULTA_MAXIMA_MS);

    const cliente = await ambiente.conectar();
    const primeiro = eventosLogados(cliente)[0];
    const instantaneo: InstantaneoLogados = JSON.parse(primeiro.dados);
    assertEquals(instantaneo.estado, "disponivel");
    assertEquals(instantaneo.usuarios.length, USUARIOS_CARGA);
    assert(
      instantaneo.usuarios.every((u) => u.sessoes === SESSOES_POR_USUARIO),
    );
    const bytes = new TextEncoder().encode(primeiro.dados).length;
    assertLess(Math.abs(bytes - medicao.bytesEvento), 100);

    const pagina = await fetch(`${ambiente.origemPainel}/`);
    assertEquals(pagina.status, 200);
    await pagina.text();

    const adm = await logar(ambiente, EMAIL_ADM_PADRAO, SENHA_ADM_PADRAO);
    const lista = await esperarLista(
      cliente,
      (i) => i.usuarios.length === USUARIOS_CARGA + 1,
      "login do ADM com a base carregada",
    );
    assertEquals(sessoesDe(lista, adm.usuario.id), 1);
    const usuarios = await ambiente.api("GET", `${API}/users`, {
      token: adm.token,
    });
    assertEquals(usuarios.status, 200);
    assertEquals((await usuarios.json()).length, USUARIOS_CARGA + 1);
    await verificarRespostaListaProdutos(
      await ambiente.api("GET", `${API}/products`, { token: adm.token }),
    );
    await sair(ambiente, adm);
    await esperarLista(
      cliente,
      (i) => i.usuarios.length === USUARIOS_CARGA,
      "logout do ADM com a base carregada",
    );
    conferirSemFalhas(ambiente.registros);
  }, {
    prepararBanco: (caminhoBanco) => {
      popularBancoCarga(caminhoBanco, USUARIOS_CARGA, SESSOES_POR_USUARIO);
      medicao = medirConsultaLogados(caminhoBanco, 10);
    },
  });
});

Deno.test("vazamentos: 20 ciclos de iniciar e parar com SSE não deixam ouvinte, inscrição, temporizador nem conexão", async () => {
  const conexoes: ConexaoBanco[] = [];
  const monitores: MonitorUsuariosLogados[] = [];
  let contador: ControladorContador | null = null;
  const opcoesControlador: OpcoesControladorServidor = {
    criarMonitorLogados: (opcoes) => {
      const monitor = new MonitorUsuariosLogados({
        ...opcoes,
        abrirConexao: (caminho) => {
          const conexao = abrirConexaoSomenteLeitura(caminho);
          conexoes.push(conexao);
          return conexao;
        },
      });
      monitores.push(monitor);
      return monitor;
    },
  };

  await comAmbienteLogados(async (ambiente) => {
    assert(contador !== null);
    const ativos = (ouvintes: Map<string, number>) =>
      [...ouvintes].filter(([, quantidade]) => quantidade !== 0);
    const base = ativos(contador.ouvintes);
    assertEquals(base, [["registro", 1]]);
    for (let ciclo = 1; ciclo <= CICLOS_VAZAMENTO; ciclo++) {
      const cliente = await ambiente.conectar();
      assertEquals(ambiente.inscricoesAtivas(), 1);
      await ambiente.iniciar();
      const adm = await logar(ambiente, EMAIL_ADM_PADRAO, SENHA_ADM_PADRAO);
      await esperarLista(
        cliente,
        (i) => sessoesDe(i, adm.usuario.id) === ciclo,
        `login do ciclo ${ciclo}`,
      );
      assertEquals((await ambiente.controlador.parar()).ok, true);
      await esperarLista(
        cliente,
        (i) => i.estado === "indisponivel",
        `parada do ciclo ${ciclo}`,
      );
      await cliente.fechar();
      await esperarAte(
        () => ambiente.inscricoesAtivas() === 0,
        `inscrição do ciclo ${ciclo} cancelada`,
      );
    }

    assertEquals(ambiente.inscricoesAtivas(), 0);
    assertEquals(ativos(contador.ouvintes), base);
    assertEquals(monitores.length, CICLOS_VAZAMENTO);
    assertEquals(conexoes.length, CICLOS_VAZAMENTO);
    for (const conexao of conexoes) {
      assertThrows(() => conexao.prepare("SELECT 1;"));
    }
    assertEquals(
      ambiente.controlador.obterUsuariosLogados().estado,
      "indisponivel",
    );
    conferirSemFalhas(ambiente.registros);
  }, {
    opcoesControlador,
    iniciarAutomaticamente: false,
    criarControlador: (opcoes) => {
      contador = new ControladorContador(opcoes);
      return contador;
    },
  });
});

async function cadastrarELogar(
  ambiente: AmbienteLogados,
  indice: number,
): Promise<void> {
  await cadastrar(ambiente, `Novo ${indice}`, `novo${indice}@teste.com`);
  await logar(ambiente, `novo${indice}@teste.com`);
}

async function logarESair(
  ambiente: AmbienteLogados,
  email: string,
): Promise<void> {
  const sessao = await logar(ambiente, email);
  await sair(ambiente, sessao);
}

Deno.test("carga mista com 5 clientes SSE: nenhum 500 e a lista final de todos bate com o banco", async () => {
  await comAmbienteLogados(async (ambiente) => {
    const clientes = await Promise.all(
      Array.from({ length: 5 }, () => ambiente.conectar()),
    );
    const adm = await logar(ambiente, EMAIL_ADM_PADRAO, SENHA_ADM_PADRAO);
    const ids = await Promise.all(
      Array.from(
        { length: 20 },
        (_, i) => cadastrar(ambiente, `Base ${i}`, `base${i}@teste.com`),
      ),
    );

    const tarefas: Promise<unknown>[] = [];
    for (let i = 0; i < 10; i++) {
      tarefas.push(cadastrarELogar(ambiente, i));
      tarefas.push(logarESair(ambiente, `base${i}@teste.com`));
      tarefas.push(logar(ambiente, `base${i + 10}@teste.com`));
      tarefas.push(
        ambiente.api("POST", `${API}/products`, {
          token: adm.token,
          corpo: { nome: `Produto ${i}`, descricao: "", quantidade: i },
        }).then((r) => verificarRespostaProduto(r, 201)),
      );
      tarefas.push(
        ambiente.api("GET", `${API}/products`, { token: adm.token }).then(
          verificarRespostaListaProdutos,
        ),
      );
      tarefas.push(
        ambiente.api("GET", `${API}/users`, { token: adm.token }).then(
          async (r) => {
            assertEquals(r.status, 200);
            await r.json();
          },
        ),
      );
    }
    for (let i = 0; i < 5; i++) {
      tarefas.push(
        ambiente.api("PATCH", `${API}/users/${ids[i + 10]}`, {
          token: adm.token,
          corpo: { nome: `Base Editado ${i}` },
        }).then((r) => verificarRespostaUsuario(r, 200)),
      );
    }
    await Promise.all(tarefas);

    for (const cliente of clientes) {
      const lista = await esperarIgualAoBanco(
        ambiente.caminhoBanco,
        cliente,
        "lista final da carga mista",
      );
      assertEquals(lista.usuarios.length, 21);
    }
    assertEquals(ambiente.inscricoesAtivas(), 5);
    conferirSemFalhas(ambiente.registros);
  });
});
