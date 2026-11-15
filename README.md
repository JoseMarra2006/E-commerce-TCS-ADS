# Bilheteria Relâmpago: Serviço de Reserva de Estoque e Pedidos para E-commerce

Projeto da disciplina Tecnologias Cliente-Servidor (Tecnologia em Análise e Desenvolvimento de Sistemas, UTFPR). Sistema cliente-servidor que troca mensagens HTTP em estilo REST (nível 2 de Richardson), com autenticação por JWT e processamento paralelo em threads, seguindo o protocolo comum da turma. O cliente funciona com o servidor de qualquer colega e o servidor atende o cliente de qualquer colega.

Este README cobre as entregas EP-1 (usuário comum: cadastro, login, leitura, atualização, exclusão e logout) e EP-2 (administrador, produtos e estoque, lista de usuários logados no painel do servidor).

## Índice

1. [Protocolo implementado](#1-protocolo-implementado)
2. [Visão geral](#2-visão-geral)
3. [Requisitos](#3-requisitos)
4. [Estrutura do repositório](#4-estrutura-do-repositório)
5. [Instalação e execução](#5-instalação-e-execução)
6. [Painel do servidor](#6-painel-do-servidor)
7. [ADM padrão](#7-adm-padrão)
8. [Uso do cliente](#8-uso-do-cliente)
9. [Testar com colegas](#9-testar-com-colegas)
10. [Testes automatizados](#10-testes-automatizados)
11. [Atendimento aos itens avaliados](#11-atendimento-aos-itens-avaliados)
12. [Decisões de projeto e limitações conhecidas](#12-decisões-de-projeto-e-limitações-conhecidas)
13. [Solução de problemas](#13-solução-de-problemas)

## 1. Protocolo implementado

Versão **1.5.0** do protocolo da turma, em `protocolo/protocolo-cliente-servidor.yaml` (OpenAPI 3.0.3) e `protocolo/README.md`. Repositório do protocolo: https://github.com/JoseMarra2006/protocolo-cliente-servidor

URL base: `http://{ip}:{porta}/api/v1`.

| Método e rota | Quem pode | Sucesso |
|---|---|---|
| `POST /sessions` (login) | público | `201` com `id` da sessão, `token` e `usuario` |
| `DELETE /sessions/{id}` (logout) | dono da sessão | `204` |
| `POST /users` (cadastro) | público | `201` com o usuário (`admin: false`) |
| `GET /users` | ADM | `200` com todos os usuários, ordenados por `id` |
| `GET`, `PUT`, `PATCH`, `DELETE /users/{id}` | dono ou ADM | `200` (leitura e atualização) ou `204` (exclusão) |
| `GET /products`, `GET /products/{id}` | qualquer usuário logado | `200` (a quantidade em estoque é o campo `quantidade`) |
| `POST /products` | ADM | `201` com o produto |
| `PUT`, `PATCH`, `DELETE /products/{id}` | ADM | `200` ou `204` |
| `OPTIONS` em qualquer rota | público | `204` com os cabeçalhos CORS |

Toda resposta `201` leva o cabeçalho `Location` (por exemplo, `/api/v1/sessions/{id}`). Todo erro tem corpo `{"mensagem": "texto"}` e os cabeçalhos CORS.

## 2. Visão geral

```text
 Máquina do cliente                                Máquina do servidor
+-------------------------------------+          +---------------------------------------------+
| Navegador: interface React          |          | Painel gráfico (127.0.0.1, porta automática)|
|        |  POST /intermediario/enviar|          |   porta, status, threads, endereços, log,   |
|        v                            |   HTTP   |   usuários logados                          |
| Intermediário local (127.0.0.1) ------------------> Recepção (0.0.0.0:PORTA) /api/v1/...      |
|  entrega a requisição e devolve     |   rede   |        v                                    |
|  status, cabeçalhos e corpo         |          | Pool de threads (Web Workers, 2 a 8)        |
+-------------------------------------+          |   cada thread: app Hono + conexão SQLite    |
                                                 |        v                                    |
                                                 | SQLite (servidor/dados/ecommerce.db)        |
                                                 +---------------------------------------------+
```

| Parte | Tecnologia | Pasta |
|---|---|---|
| Servidor e painel gráfico | Deno, TypeScript, Hono, SQLite (`node:sqlite`), Web Workers | `servidor/` |
| Interface do cliente | React, TypeScript, Vite, React Router, CSS Modules | `cliente/` |
| Intermediário do cliente | Deno, TypeScript, Hono | `cliente/intermediario/` |
| Testes de integração e servidor falso de colega | Deno | `testes-integracao/` |

O intermediário existe porque o navegador aplica o CORS às requisições que ele mesmo envia. Com o intermediário, o cliente funciona até com servidores de colegas que não implementaram o CORS. Ele repassa método, caminho, `Content-Type`, `Authorization` e corpo sem alterar nada, e devolve a resposta sem modificação. O servidor deste projeto implementa o CORS normalmente.

## 3. Requisitos

| Programa | Versão usada nos testes | Versão mínima | De onde vem a exigência |
|---|---|---|---|
| Deno | 2.9.7 | 2.2 | Mensagem dos scripts `iniciar-*`; só a 2.9.7 foi testada. |
| Node.js | 24.14.0 | 22.22.0 (linhas 22 ou 24, ou 26 em diante) | `package-lock.json`: `react-router` 8.4.0 exige `>=22.22.0`; `vitest` 5.0.3 aceita `^22.12.0`, `^24.0.0` ou `>=26.0.0`. |
| npm | 11.9.0 | a que acompanha o Node | |
| Navegador | Firefox, Chrome ou Edge atuais | | Os programas tentam abrir o Firefox e, se não houver, o navegador padrão. |

Sistema operacional testado: Windows 11. Os scripts `.sh` para Linux e macOS existem, mas não foram executados nesses sistemas.

Internet: necessária na primeira execução, para o `npm ci` e para o Deno baixar o Hono do registro JSR. Não há variáveis de ambiente a configurar.

Confira as versões instaladas:

```bash
deno --version
node --version
npm --version
```

## 4. Estrutura do repositório

```text
.
├── README.md
├── iniciar-servidor.bat / .sh     inicia o servidor (abre o painel gráfico)
├── iniciar-cliente.bat / .sh      instala dependências se faltarem, gera a interface e inicia o intermediário
├── protocolo/                     protocolo da turma, versão 1.5.0
├── servidor/
│   ├── deno.json, deno.lock
│   ├── dados/                     banco e segredo do JWT (criados no primeiro uso; fora do git)
│   ├── src/                       principal, recepção, pool, painel, banco, módulos usuarios, sessoes e produtos
│   └── testes/
├── cliente/
│   ├── package.json, package-lock.json, vite.config.ts
│   ├── src/                       api, contextos, rotas, paginas, componentes, validacao, tipos, estilos
│   ├── testes/                    testes Vitest
│   └── intermediario/             intermediário local (Deno): src/ e testes/
└── testes-integracao/
    ├── auxiliares/                sobem servidor real, intermediário e cliente para os testes
    ├── colega-simulado/           servidor falso de colega (sem CORS, com modos de divergência)
    └── testes/
```

Não estão no repositório e são criados ou baixados na execução: `cliente/node_modules/`, `cliente/dist/`, `servidor/dados/ecommerce.db` (com `-wal` e `-shm`), `servidor/dados/segredo-jwt.txt` e o cache do Deno.

## 5. Instalação e execução

### 5.1 Pelos scripts (Windows)

1. Dois cliques em `iniciar-servidor.bat`. O painel do servidor abre no navegador (seção 6).
2. Dois cliques em `iniciar-cliente.bat`. Na primeira vez, o script executa `npm ci` (mensagem "Instalando as dependencias do cliente. Isso so acontece na primeira vez."); depois gera a interface com `npm run build`, inicia o intermediário e abre a interface no navegador.

Os dois scripts conferem se o Deno (e, no cliente, o npm) estão instalados e mostram uma mensagem se não estiverem. Execute os dois uma vez com internet antes da apresentação, para que nada precise ser baixado na hora.

### 5.2 Pelo terminal

Servidor, a partir da raiz:

```bash
cd servidor
deno task start
```

O terminal mostra `Painel do servidor: http://127.0.0.1:PORTA`. Use esse endereço se o navegador não abrir sozinho.

Cliente, a partir da raiz, em outro terminal:

```bash
cd cliente
npm ci
npm run build
cd intermediario
deno task start
```

O terminal mostra `Cliente: http://127.0.0.1:PORTA`. Para encerrar o cliente, use `Ctrl+C` nesse terminal.

Não suba dois servidores a partir da mesma pasta do projeto ao mesmo tempo, mesmo em portas diferentes: eles compartilham o banco e o segredo de `servidor/dados/` e passam a se comportar como um único servidor (um usuário cadastrado em um entra pelo outro, e o token de um vale no outro). Isso não corrompe os dados, mas confunde o painel e a avaliação. Para dois servidores independentes, use cópias do projeto em pastas separadas.

### 5.3 Modo de desenvolvimento

Em dois terminais, a partir da raiz:

```bash
cd cliente/intermediario
deno task dev
```

```bash
cd cliente
npm run dev
```

O intermediário usa a porta fixa `4180` e o Vite a `5173`, ambos em `127.0.0.1`; o Vite encaminha `/intermediario` para o intermediário. Abra `http://127.0.0.1:5173/`.

## 6. Painel do servidor

O painel escuta só em `127.0.0.1`, numa porta livre escolhida pelo sistema operacional, então não conflita com a porta da API.

1. Digite a porta da API no campo "Porta da API" (sem valor padrão; por exemplo, `20000`). Valores inválidos são recusados no próprio painel ("A porta deve conter apenas números.", "A porta deve estar entre 1 e 65535.").
2. Clique em "Iniciar servidor". O painel mostra "Servidor iniciado na porta N com T threads." (T vai de 2 a 8, conforme os processadores da máquina).
3. Os endereços de acesso aparecem no painel: `http://localhost:PORTA/api/v1` e um endereço para cada IPv4 da máquina, inclusive de VPNs (como Radmin ou Hamachi) e de adaptadores virtuais. Informe ao colega só o endereço da rede que os dois computadores compartilham (seção 9).

O painel também mostra as threads em tempo real, o log de cada requisição (horário, thread, método, caminho, status e duração; a senha aparece como `"***"` e o token truncado) e o cartão "Usuários logados", sempre atualizado, com nome, e-mail, tipo, quantidade de sessões e horário da sessão mais antiga de cada usuário que tem sessão ativa.

"Parar servidor" encerra a API e permite iniciar em outra porta. "Encerrar servidor" para a API, fecha o banco e finaliza o programa.

No primeiro início da API, o servidor cria `servidor/dados/ecommerce.db` e `servidor/dados/segredo-jwt.txt` (o segredo do JWT, reutilizado nas execuções seguintes para que as sessões continuem válidas). As ações do painel exigem o token anti-CSRF da própria página e o cabeçalho `Origin` do painel; sem isso, respondem `403`.

## 7. ADM padrão

| Campo | Valor |
|---|---|
| E-mail | `adm@teste.com` |
| Senha | `admin123` |
| Nome | `Admin` |

Definido pelo protocolo e igual em todos os servidores da turma. A cada início da API, o servidor procura o e-mail `adm@teste.com` (sem diferenciar maiúsculas). Se não existir, cria o ADM e registra no log do painel "ADM padrão criado (adm@teste.com)."; se existir, não altera nada e registra "Aviso: o e-mail do ADM padrão (adm@teste.com) já está cadastrado. Nada foi alterado.".

As credenciais são públicas e valem só para o ambiente da disciplina. O ADM pode alterar a própria senha pela tela de edição do perfil, mas o combinado da turma é não alterar nem remover o ADM padrão durante a avaliação. Se o e-mail padrão deixar de existir, o próximo início da API cria o ADM de novo. Nenhuma rota cria ou promove outro ADM: todo cadastro pela API é de usuário comum.

## 8. Uso do cliente

1. **Conectar.** Na tela "Conectar ao servidor", informe "IP do servidor" (IPv4 ou nome de host, como `localhost`) e "Porta", e clique em "Salvar e verificar". Quando o servidor responde, aparece "Continuar". "Trocar servidor", no cabeçalho, volta a essa tela e encerra a sessão local.
2. **Criar conta.** Tela "Criar conta": nome, e-mail e senha. Se o e-mail já existir, o cliente mostra a mensagem do servidor e oferece ir ao login com o e-mail preenchido.
3. **Entrar.** Tela "Entrar".
4. **Perfil** (`/perfil`). Mostra os dados lidos do servidor; "Atualizar dados" lê de novo. "Editar cadastro" envia um `PATCH` só com os campos alterados (senha vazia significa não alterar). "Excluir cadastro" pede confirmação antes do `DELETE`. "Sair" envia o logout.
5. **Produtos** (link "Produtos" no cabeçalho, para qualquer usuário logado). `/produtos` lista nome, descrição, quantidade em estoque (com o selo "Esgotado" quando é 0) e "Ver detalhes"; `/produtos/{id}` mostra o detalhe.
6. **Painel de mensagens.** Na parte inferior de todas as telas, lista cada requisição enviada e cada resposta recebida (senha mascarada e token truncado).

Telas que só o ADM vê (decidido apenas pelo campo `admin` do usuário devolvido no login):

| Tela | Caminho | Ação |
|---|---|---|
| Usuários | link "Usuários" no cabeçalho, `/usuarios` | lista todos os usuários |
| Detalhes do usuário | "Ver detalhes" na lista, `/usuarios/{id}` | lê os dados; botões "Editar" e "Excluir usuário" (com confirmação) |
| Editar usuário | `/usuarios/{id}/editar` | `PATCH` só com os campos alterados |
| Novo produto | "Novo produto" na lista de produtos, `/produtos/novo` | cadastra nome, descrição e quantidade |
| Editar produto | "Editar produto" no detalhe, `/produtos/{id}/editar` | `PUT` com os três campos |
| Excluir produto | "Excluir produto" no detalhe | `DELETE` depois da confirmação |

Usuário comum que digita esses endereços é levado ao perfil. A sessão fica só em memória: recarregar a página volta à tela de conexão.

## 9. Testar com colegas

- **Seu cliente no servidor de um colega:** na tela "Conectar ao servidor", informe o IP da máquina do colega (o que o painel dele mostra) e a porta que ele escolheu. O servidor do colega não precisa ter CORS, porque o intermediário faz o envio.
- **Seu servidor para um colega:** inicie a API no painel e informe ao colega o endereço de acesso da rede que vocês compartilham (IP e porta).
- Na rede cabeada da UTFPR costumam ser usadas portas entre 20000 e 25000.

### 9.1 Qual IP informar

O painel lista todos os endereços IPv4 da máquina. Endereços de VPN (Radmin, Hamachi e semelhantes) e de adaptadores virtuais não servem para o colega na mesma sala: use o da rede cabeada (na UTFPR, por exemplo, endereços que começam com `10.20.`; confira o prefixo da rede no dia). Para conferir, execute no terminal:

```bash
ipconfig
```

Procure o adaptador da rede em uso (na rede cabeada, "Adaptador Ethernet Ethernet"; no Wi-Fi, "Adaptador de Rede sem Fio Wi-Fi") e a linha "Endereço IPv4". Ignore os adaptadores com nome de VPN, como "Adaptador Ethernet Radmin VPN".

### 9.2 Firewall do Windows

Na primeira vez em que o servidor escuta na rede, o Windows pode pedir permissão de firewall para o `deno.exe`. Permita na rede em uso, seja ela Pública ou Privada. Sem essa liberação, outros computadores não conseguem se conectar, mesmo com o servidor funcionando e respondendo em `localhost`.

1. Confira o perfil da rede em Configurações do Windows > Rede e Internet: abra a conexão em uso (Ethernet ou Wi-Fi) e veja o "Tipo de perfil de rede" (Pública ou Privada).
2. Se não liberou quando o aviso apareceu, abra o Firewall do Windows Defender, clique em "Permitir um aplicativo ou recurso através do Firewall do Windows Defender", depois em "Alterar configurações", e marque o perfil correto (Pública ou Privada) nas linhas do `deno.exe`. O firewall também abre por este comando:

   ```bash
   control firewall.cpl
   ```

3. Para diagnosticar, de outro computador da mesma rede, abra no navegador `http://IP:PORTA/api/v1/users`, com o IP e a porta do servidor. Qualquer resposta, mesmo de erro (sem login, o servidor responde `401` com uma mensagem em JSON), prova que a rede chega ao servidor. "Tempo esgotado" indica bloqueio do firewall ou IP errado.

## 10. Testes automatizados

Contagens medidas em 15/11/2026, numa cópia limpa do repositório (só os arquivos do git, sem `node_modules`, sem banco, sem segredo e com o cache do Deno vazio), no Windows 11 com Deno 2.9.7 e Node 24.14.0.

| Suíte | Pasta | Testes | Tempo aproximado |
|---|---|---|---|
| Interface do cliente | `cliente/` | 480 aprovados (31 arquivos) | 6 s |
| Intermediário | `cliente/intermediario/` | 63 aprovados | 18 s |
| Servidor | `servidor/` | 582 aprovados | 3 min |
| Integração | `testes-integracao/` | 71 aprovados | 1 min |

Interface do cliente, em `cliente/` (depois do `npm ci`):

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Intermediário, servidor e integração: em `cliente/intermediario/`, em `servidor/` e em `testes-integracao/`, execute:

```bash
deno task check
deno task lint
deno task fmt:check
deno task test
```

Os testes usam bancos e segredos temporários e conferem, ao final, que `servidor/dados/` real não foi alterado. No Windows, rode `npm test` a partir de um caminho que comece com `C:` maiúsculo (com `c:` minúsculo no diretório atual, o Vitest falha em todos os arquivos com "Cannot read properties of undefined (reading 'config')").

A integração testa o cliente real, pelo intermediário real, contra o servidor real e contra um servidor falso de colega, nos itens a a h da EP-2, além de conformidade do servidor ao protocolo, concorrência e persistência.

### 10.1 Servidor falso de colega

Em `testes-integracao/`:

```bash
deno task colega --modo=correto --porta=20001
```

O terminal mostra `Colega simulado (correto) em http://0.0.0.0:20001/api/v1`. No cliente, conecte em `localhost` e nessa porta. O ADM desse servidor é o mesmo ADM padrão, com id 1000. Os dados ficam só em memória. Encerre com `Ctrl+C`.

| Modo | Comportamento |
|---|---|
| `correto` | Segue o protocolo 1.5.0, mas sem CORS. |
| `divergente` | `200` no lugar de `201` e `204`, `id` em texto, campos extras e sem `admin`; o cliente tolera. |
| `quebrado` | Erros em HTML e respostas fora do protocolo; o cliente mostra erro sem travar. |
| `lento` | Atrasa cada resposta (1,5 s por padrão). |
| `enorme` | Resposta acima de 2 MB na leitura de usuário. |
| `sem_location` | Respostas `201` sem `Location`. |
| `location_diferente` | `Location` com valor diferente do esperado. |
| `sem_admin` | Respostas de usuário sem o campo `admin` (o cliente trata como `false`). |
| `mensagens_diferentes` | Textos de erro próprios, com os mesmos status. |

## 11. Atendimento aos itens avaliados

Caminhos relativos à raiz. "Interface" é `cliente/testes/`, "servidor" é `servidor/testes/` e "integração" é `testes-integracao/testes/`. Todos os testes citados passaram na medição da seção 10.

### EP-2, cliente

| Item | Requisito | Tela e caminho | Implementação | Testes |
|---|---|---|---|---|
| a | ADM lê cadastro de outros usuários | "Usuários" → `/usuarios` → "Ver detalhes" → `/usuarios/{id}` | `PaginaUsuarios.tsx`, `TabelaUsuarios.tsx`, `PaginaDetalheUsuario.tsx`; `listarUsuarios` e `lerCadastro` em `cliente/src/api/operacoes.ts` | interface: `lista-usuarios`, `detalhe-usuario`, `renderizacao-adm`, `operacoes-adm-produtos`; integração: `cliente-ep2-ponta-a-ponta` itens a e b |
| b | ADM atualiza cadastro de outros usuários | `/usuarios/{id}` → "Editar" → `/usuarios/{id}/editar` | `PaginaEditarUsuario.tsx`, `paginas/edicao-usuario.ts`; `atualizarCadastro` (`PATCH`) | interface: `edicao-usuario`; integração: `cliente-ep2-ponta-a-ponta` item b |
| c | ADM apaga cadastro de outros usuários | `/usuarios/{id}` → "Excluir usuário" → confirmação | `PaginaDetalheUsuario.tsx`, `paginas/exclusao-usuario.ts`; `excluirCadastro` | interface: `exclusao-usuario`; integração: `cliente-ep2-ponta-a-ponta` item c |
| d | ADM cadastra produto | "Produtos" → "Novo produto" → `/produtos/novo` | `PaginaNovoProduto.tsx`, `FormularioProduto.tsx`, `paginas/cadastro-produto.ts`, `validacao/validacao-produto.ts`; `criarProduto` | interface: `cadastro-produto`, `validacao-produto`, `renderizacao-produtos-gestao`; integração: `cliente-ep2-ponta-a-ponta` item d, `cliente-colega-divergencias` |
| e | ADM lê os produtos | `/produtos` e `/produtos/{id}` | `PaginaProdutos.tsx`, `TabelaProdutos.tsx`, `PaginaDetalheProduto.tsx`; `listarProdutos` e `lerProduto` | interface: `produtos-leitura`, `renderizacao-produtos`; integração: `cliente-ep2-ponta-a-ponta` item e, `cliente-robustez-intermediario` |
| f | ADM atualiza produto | `/produtos/{id}` → "Editar produto" → `/produtos/{id}/editar` | `PaginaEditarProduto.tsx`, `paginas/edicao-produto.ts`; `atualizarProduto` (`PUT`) | interface: `edicao-exclusao-produto`; integração: `cliente-ep2-ponta-a-ponta` item f |
| g | ADM remove produto | `/produtos/{id}` → "Excluir produto" → confirmação | `AcoesDetalheProduto.tsx`, `paginas/exclusao-produto.ts`; `excluirProduto` | interface: `edicao-exclusao-produto`; integração: `cliente-ep2-ponta-a-ponta` item g |
| h | Comum consulta estoque | "Produtos" → `/produtos` → `/produtos/{id}` | as mesmas telas de e, sem as ações de ADM; `ehAdministrador` em `contextos/eh-administrador.ts` | interface: `produtos-leitura`, `eh-administrador`, `navegacao`, `destinos`; integração: `cliente-ep2-ponta-a-ponta` item h |

Na integração, cada item a a h roda duas vezes: contra o servidor real e contra o servidor falso de colega.

### EP-2, servidor

| Item | Requisito | Implementação | Testes |
|---|---|---|---|
| i | ADM lê cadastro de outros usuários | `GET /users` e `GET /users/{id}` em `modulos/usuarios/rotas-usuarios.ts`; `exigirAdministrador` (`intermediarios/autorizacao-administrador.ts`); `verificarPosseUsuario` (`intermediarios/posse.ts`) | servidor: `listagem-usuarios`, `posse-dono-ou-adm`, `campo-admin-respostas`, `conformidade-fluxo-adm`; integração: `colega-simulado-usuarios-adm` |
| j | ADM atualiza cadastro de outros usuários | `PUT` e `PATCH /users/{id}` em `rotas-usuarios.ts` e `servico-usuarios.ts` | servidor: `posse-dono-ou-adm`, `conformidade-fluxo-adm`; integração: `colega-simulado-usuarios-adm` |
| k | ADM apaga cadastro de outros usuários | `DELETE /users/{id}`; as sessões do excluído caem em cascata | servidor: `posse-dono-ou-adm`, `logout-sessoes`, `conformidade-fluxo-adm`; integração: `colega-simulado-usuarios-adm` |
| l | ADM cadastra produto | `POST /products` em `modulos/produtos/rotas-produtos.ts`, `validacao-produtos.ts`, `repositorio-produtos.ts` | servidor: `rotas-produtos-escrita`, `validacao-produtos`, `conformidade-produtos-protocolo`; integração: `colega-simulado-produtos` |
| m | ADM lê os produtos | `GET /products` e `GET /products/{id}` | servidor: `rotas-produtos-leitura`, `conformidade-fluxo-produtos`; integração: `colega-simulado-produtos` |
| n | ADM atualiza produto | `PUT` e `PATCH /products/{id}` | servidor: `rotas-produtos-escrita`, `conformidade-produtos-escrita-concorrencia`; integração: `colega-simulado-produtos`, `colega-simulado-concorrencia-persistencia` |
| o | ADM remove produto | `DELETE /products/{id}` | servidor: `rotas-produtos-escrita`, `conformidade-produtos-concorrencia`; integração: `colega-simulado-produtos`, `colega-simulado-concorrencia-persistencia` |
| p | Comum consulta estoque | `GET /products/{id}`, liberado a qualquer usuário logado | servidor: `rotas-produtos-leitura`; integração: `colega-simulado-produtos`, `cliente-ep2-ponta-a-ponta` item h |
| q | Lista de usuários logados sempre atualizada | sinal `sessoes_alteradas` (`pool/sinal-logados.ts`, `pool/trabalhador.ts`, `pool/gerenciador-pool.ts`); monitor `MonitorUsuariosLogados` (`logados/monitor-usuarios-logados.ts`, `logados/consulta-usuarios-logados.ts`); evento SSE `logados` (`painel/logados-painel.ts`, `painel/aplicacao-painel.ts`); cartão "Usuários logados" (`painel/publico/logados-visao.js`, `logados-cartao.js`) | servidor: `sinal-logados`, `gerenciador-sinal-logados`, `integracao-sinal-logados`, `monitor-usuarios-logados`, `consulta-usuarios-logados`, `controlador-usuarios-logados`, `painel-logados-sse`, `painel-logados-visao`, `painel-logados-cartao`, `painel-logados-interface`, `regressao-logados-ponta-a-ponta`, `regressao-logados-desempenho` |

A aparência do cartão "Usuários logados" no navegador não tem teste automatizado: confira abrindo o painel, entrando com uma conta no cliente e saindo, e vendo a linha aparecer e sumir.

A EP-1 (itens a a l: cadastro, login, leitura, atualização, exclusão e logout do usuário comum) é coberta, no servidor, por `rotas-cadastro`, `rotas-sessoes`, `rotas-usuario-id`, `conformidade-fluxo` e `conformidade-concorrencia`; na interface, por `operacoes`, `validacao-campos` e `resultado-saida`; e na integração, por `fluxo-completo`, `colega-simulado` e `cenarios-adversos`.

## 12. Decisões de projeto e limitações conhecidas

- **Token só em memória.** O cliente não usa `localStorage`, `sessionStorage` nem cookies e não decodifica o JWT. Recarregar a página encerra a sessão local.
- **JWT sem expiração.** A validade é decidida pela lista de sessões ativas no banco: logout e exclusão do usuário invalidam o token. Por isso a lista de usuários logados inclui sessões antigas de clientes que nunca fizeram logout.
- **O cliente não depende do `Location`.** Ele usa o `id` do corpo da resposta, então funciona com servidores que omitem o cabeçalho.
- **Tolerância do cliente.** Aceita qualquer status 2xx como sucesso, ignora campos extras, aceita `id` em texto com dígitos e trata `admin` ausente como `false`. Envia exatamente o que o protocolo define.
- **Tolerância do servidor.** Aceita barra no final da URL, ids com zeros à esquerda (`/products/01` é o produto 1) e não exige o `Content-Type` para ler o corpo. Ids `0`, negativos ou acima do maior inteiro seguro dão `400`.
- **Quantidade.** O servidor aceita qualquer número JSON inteiro de 0 a 1.000.000; como o JSON não distingue `1.0` de `1`, os literais `1.0` e `1e3` são aceitos como `1` e `1000`, e `-0` vira `0`. Decimal (`1.5`), texto (`"10"`), booleano e `null` dão `400`.
- **Restrições do intermediário.** Só repassa caminhos que começam com `/api/v1/` (sem query string e sem `..`), só os cabeçalhos `Content-Type` e `Authorization`, pedidos de até 1 MB e respostas de até 2 MB; espera o servidor por até 10 segundos e não segue redirecionamentos. Uma lista com 500 produtos de descrição com 500 caracteres tem cerca de 320 KB e passa normalmente.
- **Painel e intermediário** escutam só em `127.0.0.1`, não enviam CORS e exigem token anti-CSRF e `Origin` nas ações.
- **Somente HTTP.** Não há HTTPS nem certificados.

## 13. Solução de problemas

| Problema | Solução |
|---|---|
| Script mostra "Deno nao encontrado" ou "Node.js nao encontrado" | Instale o programa (seção 3), feche e abra o terminal e confira com `deno --version` e `node --version`. |
| Painel: "A porta N já está em uso por outro programa. Escolha outra porta." | Digite outra porta e clique em "Iniciar servidor". |
| Colegas não conseguem conectar ao seu servidor | Libere o `deno.exe` no firewall para o perfil da rede em uso, Pública ou Privada (seção 9.2), e confira se informou o IP da rede compartilhada, não o de uma VPN (seção 9.1). De outra máquina, `curl -i -X OPTIONS http://IP:PORTA/api/v1/users` deve responder `204`; tempo esgotado indica firewall ou IP errado. |
| O servidor do colega não tem CORS | Não afeta este cliente: o intermediário faz o envio no lugar do navegador. |
| "Não foi possível conectar ao servidor. Verifique o IP, a porta e se o servidor está em execução." | IP ou porta errados, ou servidor parado. Confira no painel do servidor se a API está em execução. |
| "O intermediário do cliente não está em execução. Feche e abra o cliente novamente." | Execute `iniciar-cliente` de novo. |
| "Interface do cliente não encontrada. Execute o script iniciar-cliente novamente." | `cliente/dist/` não existe: execute `iniciar-cliente`, que gera a interface, ou `npm run build` em `cliente/`. |
| O navegador não abriu sozinho | Copie o endereço impresso no terminal (`Painel do servidor: ...` ou `Cliente: ...`). |
| Deno mostra `Failed to resolve 'open' for allow-run` e `Failed to resolve 'xdg-open' for allow-run` | Avisos sem efeito no Windows: esses programas são do macOS e do Linux. |
| Recarreguei a página e voltei à tela de conexão | Comportamento esperado: a sessão fica só em memória. |
| Zerar os dados do servidor | Com o servidor encerrado, apague `servidor/dados/ecommerce.db`, `ecommerce.db-wal` e `ecommerce.db-shm`. O banco é recriado vazio, com o ADM padrão, no próximo início da API. |
