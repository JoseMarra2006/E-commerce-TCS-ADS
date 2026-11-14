import { abrirConexao, fecharConexao } from "../../src/banco/conexao.ts";
import { executarMigracoes } from "../../src/banco/migracoes.ts";
import {
  abrirConexaoSomenteLeitura,
  consultarUsuariosLogados,
  type UsuarioLogado,
} from "../../src/logados/consulta-usuarios-logados.ts";
import type { InstantaneoLogados } from "../../src/logados/monitor-usuarios-logados.ts";
import {
  EMAIL_ADM_PADRAO,
  SENHA_ADM_PADRAO,
} from "../../src/modulos/usuarios/adm-padrao.ts";
import { serializarLogadosParaSse } from "../../src/painel/logados-painel.ts";
import { type AmbienteLogados, API, sessoesDe } from "./ambiente-logados.ts";
import type { ClienteSse } from "./cliente-sse-teste.ts";
import { verificarRespostaSessao } from "./conformidade.ts";

export interface MedicaoConsulta {
  usuarios: number;
  sessoes: number;
  temposMs: number[];
  medianaMs: number;
  maximoMs: number;
  bytesEvento: number;
}

export interface MedicaoLatencia {
  latenciasMs: number[];
  medianaMs: number;
  maximoMs: number;
}

export function calcularMediana(valores: number[]): number {
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 === 0
    ? (ordenados[meio - 1] + ordenados[meio]) / 2
    : ordenados[meio];
}

export function popularBancoCarga(
  caminhoBanco: string,
  quantidadeUsuarios: number,
  sessoesPorUsuario: number,
): void {
  const conexao = abrirConexao(caminhoBanco);
  try {
    executarMigracoes(conexao);
    const inserirUsuario = conexao.prepare(
      "INSERT INTO usuarios (nome, email, senha_hash, senha_salt, papel, criado_em, atualizado_em) VALUES (?, ?, ?, ?, 'comum', ?, ?) RETURNING id;",
    );
    const inserirSessao = conexao.prepare(
      "INSERT INTO sessoes (id, usuario_id, criado_em) VALUES (?, ?, ?);",
    );
    const base = Date.UTC(2026, 0, 1);
    conexao.exec("BEGIN IMMEDIATE;");
    try {
      for (let i = 0; i < quantidadeUsuarios; i++) {
        const agora = new Date(base + i * 1000).toISOString();
        const linha = inserirUsuario.get(
          `Usuário de carga ${i}`,
          `carga${i}@teste.com`,
          "00",
          "00",
          agora,
          agora,
        ) as { id: number };
        for (let j = 0; j < sessoesPorUsuario; j++) {
          inserirSessao.run(
            crypto.randomUUID(),
            linha.id,
            new Date(base + i * 1000 + j).toISOString(),
          );
        }
      }
      conexao.exec("COMMIT;");
    } catch (erro) {
      conexao.exec("ROLLBACK;");
      throw erro;
    }
  } finally {
    fecharConexao(conexao);
  }
}

export function medirConsultaLogados(
  caminhoBanco: string,
  repeticoes: number,
): MedicaoConsulta {
  const conexao = abrirConexaoSomenteLeitura(caminhoBanco);
  try {
    const temposMs: number[] = [];
    let usuarios: UsuarioLogado[] = [];
    for (let i = 0; i < repeticoes; i++) {
      const inicio = performance.now();
      usuarios = consultarUsuariosLogados(conexao);
      temposMs.push(performance.now() - inicio);
    }
    const instantaneo: InstantaneoLogados = {
      estado: "disponivel",
      usuarios,
      atualizadoEm: new Date().toISOString(),
    };
    return {
      usuarios: usuarios.length,
      sessoes: usuarios.reduce((soma, u) => soma + u.sessoes, 0),
      temposMs,
      medianaMs: calcularMediana(temposMs),
      maximoMs: Math.max(...temposMs),
      bytesEvento: new TextEncoder().encode(
        serializarLogadosParaSse(instantaneo),
      ).length,
    };
  } finally {
    fecharConexao(conexao);
  }
}

export async function medirLatenciaLogins(
  ambiente: AmbienteLogados,
  cliente: ClienteSse,
  quantidade: number,
): Promise<MedicaoLatencia> {
  const latenciasMs: number[] = [];
  for (let i = 1; i <= quantidade; i++) {
    const resposta = await ambiente.api("POST", `${API}/sessions`, {
      corpo: { email: EMAIL_ADM_PADRAO, senha: SENHA_ADM_PADRAO },
    });
    const respondidoEm = performance.now();
    const sessao = (await verificarRespostaSessao(resposta)).corpo;
    const corresponde = (dados: string) =>
      sessoesDe(JSON.parse(dados), sessao.usuario.id) === i;
    await cliente.esperar(
      (eventos) =>
        eventos.some((e) => e.evento === "logados" && corresponde(e.dados)),
      `evento do login ${i}`,
      2000,
    );
    const evento = cliente.eventos.find((e) =>
      e.evento === "logados" && corresponde(e.dados)
    );
    if (evento === undefined) {
      throw new Error(`Evento do login ${i} não encontrado.`);
    }
    latenciasMs.push(Math.max(0, evento.recebidoEm - respondidoEm));
  }
  return {
    latenciasMs,
    medianaMs: calcularMediana(latenciasMs),
    maximoMs: Math.max(...latenciasMs),
  };
}
