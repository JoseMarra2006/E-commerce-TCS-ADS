import "./auxiliares/vigia-arquivos-reais.ts";
import { assertEquals } from "@std/assert";
import {
  ehMensagemDaThread,
  ehMensagemParaThread,
} from "../src/pool/mensagens.ts";

const RESPOSTA_VALIDA = {
  tipo: "resposta",
  id: 1,
  status: 200,
  cabecalhos: [],
  corpo: null,
  corpoRecebidoRegistro: null,
  corpoEnviadoRegistro: null,
};

Deno.test('sessoes_alteradas: aceita exatamente { tipo: "sessoes_alteradas" }', () => {
  assertEquals(ehMensagemDaThread({ tipo: "sessoes_alteradas" }), true);
  assertEquals(
    ehMensagemDaThread(JSON.parse('{"tipo":"sessoes_alteradas"}')),
    true,
  );
});

Deno.test("sessoes_alteradas: rejeita campos extras, outra caixa, sem tipo e não objetos", () => {
  const invalidas: unknown[] = [
    { tipo: "sessoes_alteradas", numero: 1 },
    { tipo: "sessoes_alteradas", id: 1 },
    { tipo: "sessoes_alteradas", usuario: "ana@exemplo.com" },
    { tipo: "sessoes_alteradas", detalhe: undefined },
    { tipo: "Sessoes_Alteradas" },
    { tipo: "SESSOES_ALTERADAS" },
    { tipo: "sessoes-alteradas" },
    { tipo: " sessoes_alteradas" },
    { tipo: 1 },
    { tipo: null },
    {},
    { sessoes_alteradas: true },
    "sessoes_alteradas",
    ["sessoes_alteradas"],
    1,
    true,
    null,
    undefined,
  ];
  for (const mensagem of invalidas) {
    assertEquals(ehMensagemDaThread(mensagem), false, JSON.stringify(mensagem));
  }
});

Deno.test("sessoes_alteradas não é aceito como mensagem para a thread", () => {
  assertEquals(ehMensagemParaThread({ tipo: "sessoes_alteradas" }), false);
});

Deno.test("mensagens antigas da thread continuam aceitas como antes", () => {
  const validas: unknown[] = [
    { tipo: "pronta", numero: 1 },
    { tipo: "falha_inicializacao", numero: 2, mensagem: "erro" },
    RESPOSTA_VALIDA,
    { ...RESPOSTA_VALIDA, corpo: "{}", corpoRecebidoRegistro: "x" },
    { ...RESPOSTA_VALIDA, corpoEnviadoRegistro: "y" },
    { tipo: "encerrada", numero: 3 },
    { tipo: "pronta", numero: 1, extra: true },
    { tipo: "encerrada", numero: 3, extra: true },
  ];
  for (const mensagem of validas) {
    assertEquals(ehMensagemDaThread(mensagem), true, JSON.stringify(mensagem));
  }
});

Deno.test("mensagens antigas da thread continuam rejeitadas como antes", () => {
  const invalidas: unknown[] = [
    { tipo: "pronta" },
    { tipo: "pronta", numero: "1" },
    { tipo: "falha_inicializacao", numero: 1 },
    { tipo: "falha_inicializacao", mensagem: "erro" },
    { ...RESPOSTA_VALIDA, id: "1" },
    { ...RESPOSTA_VALIDA, status: "200" },
    { ...RESPOSTA_VALIDA, cabecalhos: {} },
    { ...RESPOSTA_VALIDA, corpo: 1 },
    { ...RESPOSTA_VALIDA, corpoRecebidoRegistro: undefined },
    { ...RESPOSTA_VALIDA, corpoEnviadoRegistro: 1 },
    { tipo: "encerrada" },
    { tipo: "desconhecida" },
    { tipo: "Pronta", numero: 1 },
    {},
    null,
    "pronta",
  ];
  for (const mensagem of invalidas) {
    assertEquals(
      ehMensagemDaThread(mensagem),
      false,
      JSON.stringify(mensagem),
    );
  }
});

Deno.test("mensagens para a thread continuam aceitas e rejeitadas como antes", () => {
  assertEquals(
    ehMensagemParaThread({
      tipo: "iniciar",
      numero: 1,
      caminhoBanco: "b",
      segredoJwt: "s",
    }),
    true,
  );
  assertEquals(
    ehMensagemParaThread({
      tipo: "requisicao",
      id: 1,
      metodo: "GET",
      url: "http://x/",
      cabecalhos: [],
      corpo: null,
    }),
    true,
  );
  assertEquals(ehMensagemParaThread({ tipo: "encerrar" }), true);
  assertEquals(ehMensagemParaThread({ tipo: "iniciar", numero: 1 }), false);
  assertEquals(ehMensagemParaThread({ tipo: "requisicao", id: 1 }), false);
  assertEquals(ehMensagemParaThread({ tipo: "pronta", numero: 1 }), false);
  assertEquals(ehMensagemParaThread(null), false);
});
