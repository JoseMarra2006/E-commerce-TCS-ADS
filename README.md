# Bilheteria Relâmpago: Serviço de Reserva de Estoque e Pedidos para E-commerce

Sistema cliente-servidor em que cliente e servidor trocam mensagens HTTP em estilo REST (nível 2 de Richardson), conforme o protocolo da turma (versão 1.3.1, em `protocolo/`). Este documento descreve como o sistema foi construído, como instalá-lo a partir do arquivo compactado e como executá-lo.

## Índice

1. [Visão geral da solução](#1-visão-geral-da-solução)
2. [Requisitos](#2-requisitos)
3. [Instalação passo a passo](#3-instalação-passo-a-passo)
4. [Execução](#4-execução)
5. [Como o sistema foi implementado](#5-como-o-sistema-foi-implementado)
6. [Protocolo e exemplos de requisições](#6-protocolo-e-exemplos-de-requisições)
7. [Atendimento aos itens avaliados](#7-atendimento-aos-itens-avaliados)
8. [Testes](#8-testes)
9. [Estrutura do repositório](#9-estrutura-do-repositório)
10. [Solução de problemas](#10-solução-de-problemas)

## 1. Visão geral da solução

```text
 Máquina do cliente                                     Máquina do servidor
+------------------------------------------+          +-----------------------------------------------+
| Navegador                                |          | Painel gráfico (127.0.0.1, porta automática)  |
|  Interface React                         |          |   porta, status, threads, endereços, log      |
|        |  POST /intermediario/enviar     |          |                                               |
|        v                                 |   HTTP   | Recepção (Deno.serve em 0.0.0.0:PORTA)        |
| Intermediário local (127.0.0.1) --------------------> /api/v1/...                                   |
|  Deno + Hono: entrega a requisição       |   rede   |        |                                      |
|  e devolve status, cabeçalhos e corpo    |          |        v                                      |
+------------------------------------------+          | Pool de threads (Web Workers, 2 a 8)          |
                                                      |   cada thread: app Hono + conexão SQLite      |
                                                      |        |                                      |
                                                      |        v                                      |
                                                      | Banco SQLite (servidor/dados/ecommerce.db)    |
                                                      +-----------------------------------------------+
```

| Parte | Tecnologia | Pasta | Responsabilidade |
|---|---|---|---|
| Servidor | Deno, TypeScript, Hono, SQLite (`node:sqlite`), Web Workers | `servidor/` | API do protocolo, autenticação por JWT com lista de sessões ativas, processamento paralelo e persistência. Inclui o painel gráfico de controle (HTML, CSS e JavaScript próprios). |
| Interface do cliente | React, TypeScript, Vite, React Router, CSS Modules | `cliente/` | Telas de conexão, cadastro, login, perfil, edição e exclusão; painel de mensagens com tudo o que foi enviado e recebido. |
| Intermediário do cliente | Deno, TypeScript, Hono | `cliente/intermediario/` | Serve a interface e entrega as requisições aos servidores no lugar do navegador. |

**Por que existe o intermediário.** O navegador só aplica a regra de CORS às requisições que ele mesmo envia a outra origem. Se o servidor de um colega não implementou o CORS, um cliente que fizesse as requisições direto do navegador seria bloqueado. O intermediário faz o envio no lugar do navegador, então o cliente funciona com qualquer servidor da turma. Ele não altera o protocolo: em `cliente/intermediario/src/encaminhar.ts`, método, caminho, corpo e token recebidos da interface são repassados como estão (`Content-Type: application/json` só é enviado quando há corpo, e `Authorization: Bearer <token>` só quando há token), e a resposta (status, cabeçalhos e corpo) volta à interface sem modificação. Os cabeçalhos próprios de qualquer cliente HTTP (como `Host` e `User-Agent`) são acrescentados pelo `fetch` do Deno. O servidor deste projeto continua implementando o CORS, porque clientes web de colegas dependem disso.

## 2. Requisitos

| Requisito | Versão mínima | Versão usada no desenvolvimento e nos testes | Observação |
|---|---|---|---|
| Deno | 2.2 | 2.9.7 | O servidor usa o módulo `node:sqlite`, disponível a partir do Deno 2.2. Só foi executado com a 2.9.7. |
| Node.js | 22.22.0 | 24.14.0 | Exigência do pacote `react-router` 8.4.0 (`>=22.22.0`). Vite 8.3.0 e Vitest 5.0.3 exigem versões menores. |
| npm | o que acompanha o Node | 11.9.0 | |
| Navegador | Chrome, Edge ou Firefox atuais | | Os scripts tentam abrir o Firefox e, se não estiver instalado, abrem o navegador padrão. |

Sistema operacional: desenvolvido e testado no Windows 11. Os scripts `.sh` (Linux e macOS) existem, mas não foram executados nesses sistemas.

Internet: necessária somente na primeira execução de cada script, para baixar as dependências (seção 3, passo 4).

Bibliotecas (versões lidas de `deno.lock` e `package-lock.json`):

| Parte | Biblioteca | Versão | Uso |
|---|---|---|---|
| Servidor | Hono (`jsr:@hono/hono`) | 4.13.8 | Roteamento, middlewares, Server-Sent Events do painel e funções `sign` e `verify` do JWT. |
| Servidor, intermediário e integração | `jsr:@std/assert` | 1.0.19 | Asserções dos testes. |
| Intermediário | Hono | 4.13.13 | Roteamento e middlewares. |
| Testes de integração | Hono | 4.13.8 | Servidor de colega simulado. |
| Interface | React e React DOM | 19.3.0 | Construção da interface. |
| Interface | React Router (`react-router`) | 8.4.0 | Navegação e rotas protegidas. |
| Interface | Vite e `@vitejs/plugin-react` | 8.3.0 e 6.1.1 | Servidor de desenvolvimento e build. |
| Interface | TypeScript | 6.0.3 | Tipagem estática. |
| Interface | Vitest | 5.0.3 | Testes. |
| Interface | ESLint e `typescript-eslint` | 10.11.0 e 8.70.1 | Qualidade do código. |

Criptografia (PBKDF2, números aleatórios, UUID), SQLite e Web Workers são recursos embutidos no Deno; não há bibliotecas externas para eles.

## 3. Instalação passo a passo

1. **Extrair o arquivo compactado.** Extraia o `.zip` recebido em qualquer pasta do computador (por exemplo, a Área de Trabalho). Abra a pasta extraída: ela é a raiz do projeto e contém `iniciar-servidor.bat`, `iniciar-cliente.bat`, `servidor/`, `cliente/` e `protocolo/`.

   O arquivo contém apenas o código-fonte. Não vêm nele (por serem gerados ou baixados): as dependências da interface (`cliente/node_modules/`), a interface compilada (`cliente/dist/`), o banco de dados e o segredo do JWT (`servidor/dados/`) e o cache de dependências do Deno. Nenhum desses itens precisa ser instalado ou criado à mão: os scripts de inicialização (passo 4) baixam, geram ou criam cada um deles automaticamente. A única instalação feita por você é a dos programas dos passos 2 e 3.

2. **Instalar o Deno** (https://deno.com). No Windows, pelo PowerShell: `irm https://deno.land/install.ps1 | iex`, ou o instalador indicado no site.

3. **Instalar o Node.js** (https://nodejs.org), versão 22.22.0 ou superior (a versão LTS atual atende). O npm vem junto. Feche e abra o terminal e confira:

   ```bash
   deno --version
   node --version
   npm --version
   ```

4. **Primeira execução, com internet.** Na primeira vez, o `iniciar-cliente` executa `npm ci` (baixa as dependências da interface para `cliente/node_modules/`) e o Deno baixa o Hono do registro JSR e o guarda em cache no computador (servidor e intermediário). Execute os dois scripts (`iniciar-servidor` e `iniciar-cliente`, seção 4) uma vez com internet. Depois disso nenhuma das duas partes precisa de internet para funcionar em rede local: o comando `deno check --cached-only src/principal.ts` foi executado com sucesso no servidor e no intermediário, o que indica que as dependências do Deno já estão no cache. A internet só volta a ser necessária em outra máquina, ou se o cache do Deno ou a pasta `cliente/node_modules/` forem apagados. Esse funcionamento sem rede foi verificado pelo uso do cache, não com a rede desligada.

5. **Instalação manual das dependências (alternativa aos scripts):**

   ```bash
   (cd servidor && deno install)
   (cd cliente/intermediario && deno install)
   (cd cliente && npm ci)
   ```

6. **Firewall.** Na primeira vez que o servidor escuta na rede, o Windows pode pedir permissão de acesso para o Deno. Permita em redes privadas; sem isso, outras máquinas não conseguem se conectar.

## 4. Execução

### 4.1 Servidor

Dois cliques em `iniciar-servidor.bat` (Windows) ou `./iniciar-servidor.sh` (Git Bash, Linux, macOS). Equivalente manual:

```bash
cd servidor
deno task start
```

O painel gráfico abre no navegador (Firefox ou, se não houver, o navegador padrão), em `127.0.0.1` e numa porta livre escolhida automaticamente. O terminal mostra só `Painel do servidor: http://127.0.0.1:PORTA`, útil se o navegador não abrir sozinho.

1. Digite a porta da API no campo "Porta da API" (por exemplo, `20000`; o campo não tem valor padrão).
2. Clique em "Iniciar servidor".
3. O painel mostra o status "Em execução", a porta e os "Endereços de acesso" (`http://localhost:PORTA/api/v1` e `http://IP-DA-REDE:PORTA/api/v1`). O IP da rede é o que os colegas digitam no cliente.

| Área do painel | O que mostra ou faz |
|---|---|
| Configuração | Campo "Porta da API" e botões "Iniciar servidor" e "Parar servidor". Porta inválida ou em uso gera mensagem de erro no painel. |
| Status | Situação da API (Parada, Iniciando, Em execução, Erro), porta atual e mensagem de erro. |
| Endereços de acesso | Endereços com botão "Copiar". |
| Threads | Uma linha por thread do pool: requisições em andamento e se está "Pronta" ou "Reiniciando". |
| Mensagens | Log em tempo real: horário, thread, método, caminho, status, duração, IP de origem e corpos recebido e enviado (senha mascarada). "Limpar exibição" apaga só o que está na tela. |
| Rodapé | "Encerrar servidor": para a API, fecha o banco e finaliza o programa. |

"Parar servidor" encerra a API e as threads e permite iniciar de novo em outra porta, sem reiniciar o programa.

### 4.2 Cliente

Dois cliques em `iniciar-cliente.bat` ou `./iniciar-cliente.sh`. Equivalente manual:

```bash
cd cliente
npm ci
npm run build
cd intermediario
deno task start
```

O script confere se Deno e Node estão instalados, instala as dependências da interface se `cliente/node_modules/` não existir, gera a interface (`npm run build`, que também confere os tipos), inicia o intermediário e abre o navegador. O terminal mostra `Cliente: http://127.0.0.1:PORTA`.

### 4.3 Uso do cliente

1. **Conectar.** Em "Conectar ao servidor", informe o "IP do servidor" (IPv4 ou nome de host, como `localhost`) e a "Porta" e clique em "Salvar e verificar". O cliente envia um `OPTIONS` ao servidor; se ele responder, aparece o link "Continuar". O cabeçalho mostra o servidor atual e o link "Trocar servidor" (trocar encerra a sessão local).
2. **Criar conta.** Em "Criar conta", preencha "Nome", "E-mail" e "Senha". Se o e-mail já existir, o cliente mostra a mensagem do servidor e oferece ir ao login com o e-mail preenchido.
3. **Entrar.** Em "Entrar", informe e-mail e senha.
4. **Perfil.** A tela busca os dados no servidor (`GET /users/{id}`) e mostra nome, e-mail, número de cadastro (o id) e servidor. "Atualizar dados" busca de novo.
5. **Editar.** "Editar cadastro" abre o formulário preenchido. "Nova senha" vazia significa não alterar. O cliente envia um `PATCH` só com os campos alterados; se nada mudou, não envia e mostra "Nenhuma alteração para salvar.".
6. **Excluir.** "Excluir cadastro" abre o diálogo "Excluir cadastro?"; só a confirmação envia o `DELETE`. Depois do sucesso, a sessão local é encerrada e o cliente volta ao login.
7. **Sair.** "Sair" envia `DELETE /sessions/{id}`; qualquer que seja o resultado, a sessão local é encerrada e o cliente volta ao login, informando se o servidor confirmou.
8. **Painel de mensagens.** Recolhível, na parte inferior de todas as telas. Lista cada requisição enviada e resposta recebida (horário, método, URL, status, duração e corpos), com a senha como `"***"` e o token truncado. Guarda as 200 mais recentes; "Limpar" apaga a lista.

A sessão fica só em memória: recarregar a página apaga a sessão local e volta à tela de conexão (intencional, seção 5.7).

### 4.4 Conectar a um servidor de colega

Na tela "Conectar ao servidor", informe o IP da máquina do colega (o que o painel dele mostra em "Endereços de acesso") e a porta dele. O painel de mensagens mostra o que foi trocado.

### 4.5 Encerrar

- Servidor: botão "Encerrar servidor" no painel.
- Cliente: `Ctrl+C` na janela do terminal do cliente.

### 4.6 Desenvolvimento

```bash
cd cliente/intermediario && deno task dev
cd cliente && npm run dev
```

Em desenvolvimento, o intermediário usa a porta fixa `4180` e o Vite a `5173`, ambos em `127.0.0.1`; o Vite encaminha `/intermediario` para o intermediário. Abra `http://127.0.0.1:5173`. No servidor, `deno task dev` (em `servidor/`) reinicia automaticamente.

## 5. Como o sistema foi implementado

### 5.1 Servidor

Código em `servidor/src/`.

- **Painel gráfico** (`principal.ts`, `painel/`). A thread principal inicia o painel em `127.0.0.1`, em porta livre escolhida pelo sistema operacional, e o abre no navegador. As ações (iniciar, parar, encerrar) chegam por `POST`; estado e log saem por Server-Sent Events. O ciclo de vida da API fica em `controlador-servidor.ts`.
- **Inicialização da API.** Ao clicar em "Iniciar servidor", a thread principal valida a porta, abre uma conexão com o banco, executa as migrações, a fecha e carrega (ou gera) o segredo do JWT. Só depois cria o pool e espera todas as threads confirmarem que abriram a própria conexão. Por fim inicia a recepção. Se algo falhar (porta em uso, por exemplo), tudo é desfeito e o painel mostra o erro.
- **Recepção** (`recepcao.ts`). `Deno.serve` em `0.0.0.0`. Lê o corpo como texto, envia ao pool e monta a resposta HTTP com o que a thread devolveu. Não aplica regras de negócio nem acessa o banco. Registra no log cada requisição (data e hora, thread, método, caminho, status, duração, IP de origem e corpos).
- **Pool de threads** (`pool/`). Web Workers do Deno. Quantidade: `navigator.hardwareConcurrency`, entre 2 e 8 (8 na máquina de desenvolvimento). Cada thread executa o app Hono completo (`aplicacao.ts`) e mantém sua própria conexão SQLite; conexões nunca são compartilhadas. Distribuição: a requisição vai para a thread com menos requisições em andamento, com rodízio entre empatadas; se todas estiverem ocupadas, espera em fila, na ordem de chegada. Se uma thread não responder em 30 segundos, a recepção responde `500` e a thread é substituída. Em falha de thread (erro não tratado), as requisições dela recebem `500`, o painel registra o ocorrido e a thread é substituída automaticamente (até 3 tentativas, com 2 segundos de intervalo, se a nova não conseguir abrir o banco).
- **Encerramento.** A recepção para de aceitar requisições, aguarda as em andamento por até 10 segundos; depois cada thread fecha sua conexão e é finalizada.
- **Camadas.** `modulos/usuarios/` e `modulos/sessoes/` têm rotas, serviço, repositório, validação e tipos. `intermediarios/` tem CORS, autenticação, checagem de posse e resposta `405`. `banco/` tem conexão, migrações e transação. `utilitarios/` tem hash de senha, JWT, segredo, leitura de JSON, respostas e máscara do log.

Caminho de uma requisição:

1. A recepção recebe a requisição e lê o corpo.
2. Escolhe a thread com menos requisições em andamento e envia a mensagem (método, URL, cabeçalhos, corpo).
3. A thread executa o app Hono: o middleware de CORS responde `OPTIONS` com `204` ou acrescenta os cabeçalhos CORS à resposta.
4. A rota é executada; nas protegidas, o middleware de autenticação confere cabeçalho, JWT e sessão, e a checagem de posse confere o id da URL. Rota inexistente cai no `404`; método não suportado, no `405`.
5. Exceção não tratada vira `500` com `{"mensagem": "Erro interno no servidor."}`.
6. A thread devolve status, cabeçalhos e corpo; a recepção responde e registra o log.

### 5.2 Concorrência e integridade

Várias requisições são processadas ao mesmo tempo em threads diferentes (o hash de senha, operação mais pesada, roda em paralelo). A integridade vem do banco, não de suposições sobre a ordem das threads:

- SQLite em modo WAL: leituras em paralelo entre as threads e gravações serializadas. `busy_timeout` de 5000 ms faz a thread esperar a vez de gravar em vez de falhar.
- A restrição `UNIQUE` (sem diferenciar maiúsculas) em `email` decide cadastros e atualizações simultâneos com o mesmo e-mail: um vence e os demais recebem `409`, nunca `500`.
- `executarTransacao` (`banco/transacao.ts`) usa `BEGIN IMMEDIATE`, recusa operações assíncronas dentro da transação e repete a operação se o banco estiver ocupado (até 4 tentativas no total).

Testes que comprovam: `servidor/testes/conformidade-concorrencia.test.ts` (20 cadastros simultâneos com o mesmo e-mail dão um `201` e dezenove `409`; 50 cadastros com e-mails diferentes dão cinquenta `201`; 10 logins simultâneos do mesmo usuário geram 10 sessões; leituras, logouts e exclusões simultâneos; confirmação de que ao menos 2 threads processaram requisições), `pool.test.ts` (50 requisições simultâneas e substituição de thread), `transacao.test.ts` e `testes-integracao/testes/concorrencia-ponta-a-ponta.test.ts`.

### 5.3 Segurança

- **Senha.** PBKDF2-HMAC-SHA256 (Web Crypto), 600.000 iterações, salt aleatório de 16 bytes, hash de 32 bytes, ambos em hexadecimal; comparação em tempo constante. No login com e-mail inexistente, uma derivação fictícia iguala o tempo de resposta, e a mensagem de `401` é sempre a mesma.
- **JWT.** HS256 (outros algoritmos são recusados), com as claims `sub` (id do usuário), `sid` (id da sessão) e `iat`. Não há `exp`: a validade é controlada pela lista de sessões ativas. O JWT não é guardado no banco.
- **Logout e lista de sessões ativas.** O token só é aceito se a sessão `sid` existir na tabela `sessoes` e pertencer ao usuário `sub`. O logout apaga a linha; a exclusão do usuário apaga todas as suas sessões (cascata).
- **Checagem de posse.** O id da URL deve ser o do dono do token (em `/users/{id}`) ou de uma sessão dele (em `/sessions/{id}`); senão, `403`.
- **Segredo do JWT.** 64 bytes aleatórios, gerados na primeira execução em `servidor/dados/segredo-jwt.txt` e reutilizados depois, para que as sessões continuem válidas após reiniciar. Não é versionado nem exibido.
- **Banco.** SQL sempre parametrizado.
- **Registros.** No log do servidor e no painel de mensagens do cliente, a senha vira `"***"` e o token é truncado.
- **CORS e CSRF.** CORS é a liberação, pelo servidor, de requisições vindas de páginas de outras origens; o protocolo exige `Access-Control-Allow-Origin: *`, presente em todas as respostas. CSRF é o ataque em que um site malicioso faz o navegador enviar uma requisição autenticada automaticamente (por cookie, por exemplo). Na API ele não é possível: não há cookies, e o token viaja só no cabeçalho `Authorization`, que o navegador não envia sozinho; por isso o `*` é seguro. O painel e o intermediário, que rodam em `localhost` e têm poder de controle, escutam só em `127.0.0.1`, não enviam cabeçalhos CORS, conferem o `Host` e exigem nos `POST` um token aleatório de 32 bytes (gerado ao iniciar) em `X-Token-Painel` ou `X-Token-Intermediario` e um `Origin` igual ao próprio endereço; senão respondem `403`.
- **Interface.** Não decodifica o JWT, não usa `localStorage`, `sessionStorage` nem cookies e não renderiza HTML vindo do servidor.

### 5.4 Banco de dados

Arquivo `servidor/dados/ecommerce.db`, criado na primeira execução. Esquema (`servidor/src/banco/migracoes.ts`):

```sql
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  senha_hash TEXT NOT NULL,
  senha_salt TEXT NOT NULL,
  papel TEXT NOT NULL DEFAULT 'comum' CHECK (papel IN ('comum', 'administrador')),
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessoes (
  id TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  criado_em TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessoes_usuario_id ON sessoes(usuario_id);
```

A tabela `sessoes` é a lista de sessões ativas: cada login insere uma linha e cada logout a apaga. `AUTOINCREMENT` impede reutilizar o id de um usuário excluído, então um token antigo nunca aponta para outro usuário. A coluna `papel` nunca aparece nas respostas; todo cadastro pela API cria `comum`.

### 5.5 Interface do cliente

- React com TypeScript estrito; CSS próprio com CSS Modules.
- React Router (`BrowserRouter`) com `/conexao`, `/cadastro`, `/login`, `/perfil` e `/perfil/editar`. Rotas protegidas em `cliente/src/rotas/`: sem conexão configurada, vai para `/conexao`; sem sessão, para `/login`; com sessão, `/login` e `/cadastro` redirecionam para `/perfil`; endereço desconhecido volta a `/`.
- Estado de conexão (IP, porta), sessão (token, id da sessão, usuário), mensagens e tema em React Context, somente em memória (`cliente/src/contextos/`).
- Camada de API (`cliente/src/api/`): um único cliente HTTP monta a mensagem do protocolo e a entrega ao intermediário, com limite de 15 segundos. As funções por operação nunca lançam exceção para a interface e devolvem resultado tipado. Qualquer status 2xx é sucesso; os campos obrigatórios das respostas de sucesso são conferidos; erros usam a `mensagem` do corpo ou, se o corpo estiver fora do padrão, mensagem genérica por status. `401` em rota protegida encerra a sessão local e volta ao login.
- Validações iguais às do servidor (`cliente/src/validacao/validacao-campos.ts`), com mensagem por campo, antes de enviar.
- Botões desabilitados e textos de carregamento durante as requisições; temas claro e escuro (botão no cabeçalho, inicial conforme o sistema); rótulos associados aos campos, foco visível, diálogo de confirmação com o elemento `dialog` e alertas com `role`.

### 5.6 Intermediário

Código em `cliente/intermediario/src/`.

- **Escuta** só em `127.0.0.1`, em porta livre escolhida pelo sistema operacional (fixa em 4180 apenas em desenvolvimento), e abre a interface no navegador.
- **Serve** `cliente/dist/` e devolve `index.html` para caminhos que não sejam arquivos, para o React Router funcionar ao abrir uma rota direto.
- **Recebe** `POST /intermediario/enviar` com JSON (IP, porta, método, caminho, token, corpo), **envia** a requisição ao servidor de destino e **devolve** status, cabeçalhos e corpo sem modificação.
- **Restrições.** Métodos `GET`, `POST`, `PUT`, `PATCH`, `DELETE` e `OPTIONS` (sem corpo em `GET`, `DELETE` e `OPTIONS`); caminho iniciado por `/api/v1/` (máximo 2048 caracteres, sem `..`); IP em IPv4 ou nome de host; porta de 1 a 65535; só `Content-Type` e `Authorization` são repassados; pedido de até 1 MB; resposta lida até 2 MB; redirecionamentos não são seguidos.
- **Erros de rede** voltam em campo próprio, separado do status HTTP, classificados em conexão recusada, tempo esgotado (10 segundos), endereço não encontrado, resposta muito grande ou falha de rede. A interface traduz cada um em mensagem clara.
- **Segurança.** Sem CORS, verificação de `Host`, token anti-CSRF obtido em `GET /intermediario/token`, conferência de `Origin` no `POST /intermediario/enviar` (`403` caso contrário) e política de segurança de conteúdo na interface.

### 5.7 Decisões de projeto

- **Token só em memória.** Evita expor o token em `localStorage` ou cookies; o custo é que recarregar a página exige novo login.
- **JWT sem expiração e lista de sessões ativas.** O protocolo define que o token vale até o logout; como um JWT não se invalida sozinho, a validade é decidida pela existência da sessão no banco.
- **Tolerância ao ler respostas de outros servidores.** O cliente aceita qualquer 2xx, ignora campos extras e aceita `id` numérico ou textual onde o protocolo permite, mas envia exatamente o que o protocolo define.
- **Erros de rede separados de respostas HTTP.** O intermediário distingue "o servidor respondeu" de "não foi possível falar com o servidor".
- **Porta digitada no painel.** A porta da API é informada na interface gráfica, sem valor padrão; painel e intermediário usam portas automáticas para nunca conflitar com ela.
- **Integridade pelo banco.** Restrições `UNIQUE` e transações `BEGIN IMMEDIATE` em vez de travas em memória, porque cada thread tem sua conexão.

## 6. Protocolo e exemplos de requisições

O protocolo está em `protocolo/protocolo-cliente-servidor.yaml` (OpenAPI 3.0.3) e `protocolo/README.md`. URL base: `http://{ip}:{porta}/api/v1`.

| Método e rota | Autenticação | Corpo | Sucesso | Erros |
|---|---|---|---|---|
| `POST /users` | Não | `UserRequest` (`nome`, `email`, `senha`) | `201` + `UserResponse` | 400, 409, 500 |
| `POST /sessions` | Não | `LoginRequest` (`email`, `senha`) | `201` + `SessionResponse` | 400, 401, 500 |
| `GET /users/{id}` | Sim | Nenhum | `200` + `UserResponse` | 400, 401, 403, 404, 500 |
| `PUT /users/{id}` | Sim | `UserRequest` (todos os campos) | `200` + `UserResponse` | 400, 401, 403, 404, 409, 500 |
| `PATCH /users/{id}` | Sim | `UserPatchRequest` (um ou mais campos) | `200` + `UserResponse` | 400, 401, 403, 404, 409, 500 |
| `DELETE /users/{id}` | Sim | Nenhum | `204` sem corpo | 400, 401, 403, 404, 500 |
| `DELETE /sessions/{id}` | Sim | Nenhum | `204` sem corpo | 401, 403, 404, 500 |
| `OPTIONS` em qualquer rota | Não | Nenhum | `204` sem corpo | Nenhum |

Regras gerais: prefixo `/api/v1` (barra final aceita); token em `Authorization: Bearer <token>`; erros sempre `{"mensagem": "texto"}`; cabeçalhos CORS em toda resposta (`Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS`, `Access-Control-Allow-Headers: Content-Type, Authorization`); ordem de validação em `/users/{id}` e `/sessions/{id}`: `401` → `400` (id mal formatado) → `403` (id não é do dono do token) → `404` → `400` (corpo inválido) → `409`; rota inexistente `404`, método não suportado `405`; a senha nunca é devolvida; tipo errado ou `null` em campo gera `400`; e-mails são comparados sem diferenciar maiúsculas; cada login cria uma sessão independente.

Adições do servidor que não alteram o protocolo: cabeçalho `Location` nas respostas `201`, `Cache-Control: no-store` no login e `Allow` nas respostas `405`.

### Exemplos com curl

Executados contra o servidor real na porta 20000 (Git Bash). Ids e token foram abreviados ou são de exemplo; os cabeçalhos `access-control-*` aparecem em todas as respostas e foram omitidos, exceto no `OPTIONS`.

Cadastro:

```bash
curl -i -X POST http://localhost:20000/api/v1/users \
  -H "Content-Type: application/json" \
  -d '{"nome":"Maria Souza","email":"maria@exemplo.com","senha":"Senha123"}'
```

```text
HTTP/1.1 201 Created
content-type: application/json; charset=utf-8
location: /api/v1/users/19

{"id":19,"nome":"Maria Souza","email":"maria@exemplo.com"}
```

Cadastro com e-mail já existente (outra capitalização):

```text
HTTP/1.1 409 Conflict

{"mensagem":"E-mail já cadastrado. Faça login para continuar."}
```

Login:

```bash
curl -i -X POST http://localhost:20000/api/v1/sessions \
  -H "Content-Type: application/json" \
  -d '{"email":"maria@exemplo.com","senha":"Senha123"}'
```

```text
HTTP/1.1 201 Created
cache-control: no-store
content-type: application/json; charset=utf-8
location: /api/v1/sessions/03e2aa7e-9151-4a67-8eb7-4ebdcad63d6f

{"id":"03e2aa7e-9151-4a67-8eb7-4ebdcad63d6f","token":"eyJhbGciOiJIUzI1NiIs...","usuario":{"id":19,"nome":"Maria Souza","email":"maria@exemplo.com"}}
```

Senha errada: `401` com `{"mensagem":"E-mail ou senha inválidos."}`.

Leitura (`$TOKEN` é o `token` do login):

```bash
curl -i http://localhost:20000/api/v1/users/19 \
  -H "Authorization: Bearer $TOKEN"
```

```text
HTTP/1.1 200 OK
content-type: application/json; charset=utf-8

{"id":19,"nome":"Maria Souza","email":"maria@exemplo.com"}
```

Atualização parcial:

```bash
curl -i -X PATCH http://localhost:20000/api/v1/users/19 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"nome":"Maria S. Souza"}'
```

```text
HTTP/1.1 200 OK

{"id":19,"nome":"Maria S. Souza","email":"maria@exemplo.com"}
```

`PUT` (com `nome`, `email` e `senha`): mesmo formato de resposta, `200`.

Logout (`$SID` é o `id` da sessão devolvido no login):

```bash
curl -i -X DELETE http://localhost:20000/api/v1/sessions/$SID \
  -H "Authorization: Bearer $TOKEN"
```

```text
HTTP/1.1 204 No Content
```

Depois do logout, o mesmo token é recusado:

```text
HTTP/1.1 401 Unauthorized

{"mensagem":"Token de acesso inválido ou sessão encerrada. Faça login novamente."}
```

Exclusão:

```bash
curl -i -X DELETE http://localhost:20000/api/v1/users/19 \
  -H "Authorization: Bearer $TOKEN"
```

```text
HTTP/1.1 204 No Content
```

Outros casos verificados:

| Requisição | Resposta |
|---|---|
| `GET /users/1` com o token do usuário 19 | `403`: `{"mensagem":"Você não tem permissão para acessar os dados de outro usuário."}` |
| `GET /users/19` sem `Authorization` | `401`: `{"mensagem":"Token de acesso ausente. Faça login para continuar."}` |
| `GET /users/abc` com token válido | `400`: `{"mensagem":"O id do usuário na URL deve ser um número inteiro positivo."}` |
| `PATCH /users/19` com corpo `{}` | `400`: `{"mensagem":"Informe ao menos um dos campos: nome, email ou senha."}` |
| `DELETE /users` | `405`, cabeçalho `allow: POST, OPTIONS`: `{"mensagem":"Método não permitido nesta rota."}` |
| `GET /xyz` | `404`: `{"mensagem":"Rota não encontrada."}` |
| `OPTIONS /users` | `204` sem corpo, com os três cabeçalhos CORS |

## 7. Atendimento aos itens avaliados

Caminhos relativos à raiz. Nos testes, "servidor" é `servidor/testes/`, "interface" é `cliente/testes/` e "integração" é `testes-integracao/testes/`.

| Item | Descrição | Rota | Onde é implementado | Testes |
|---|---|---|---|---|
| a | Cliente envia cadastro | `POST /users` | `cliente/src/paginas/PaginaCadastro.tsx`, `cliente/src/api/operacoes.ts` | interface: `operacoes.test.ts`, `validacao-campos.test.ts`; integração: `fluxo-completo.test.ts`, `colega-simulado.test.ts` |
| b | Cliente envia login | `POST /sessions` | `cliente/src/paginas/PaginaLogin.tsx`, `cliente/src/api/operacoes.ts` | interface: `operacoes.test.ts`; integração: `fluxo-completo.test.ts`, `colega-simulado.test.ts` |
| c | Cliente pede dados do usuário | `GET /users/{id}` | `cliente/src/paginas/PaginaPerfil.tsx`, `cliente/src/api/operacoes.ts` | interface: `operacoes.test.ts`; integração: `fluxo-completo.test.ts` |
| d | Cliente envia atualização | `PATCH /users/{id}` (só campos alterados) | `cliente/src/paginas/PaginaEditarCadastro.tsx`, `cliente/src/validacao/validacao-campos.ts` | interface: `operacoes.test.ts`, `validacao-campos.test.ts`; integração: `fluxo-completo.test.ts` |
| e | Cliente envia exclusão | `DELETE /users/{id}` | `cliente/src/paginas/PaginaPerfil.tsx`, `cliente/src/componentes/DialogoConfirmacao.tsx` | interface: `operacoes.test.ts`; integração: `fluxo-completo.test.ts` |
| f | Cliente envia logout | `DELETE /sessions/{id}` | `cliente/src/contextos/use-sair.ts`, `cliente/src/api/operacoes.ts` | interface: `operacoes.test.ts`, `resultado-saida.test.ts`; integração: `fluxo-completo.test.ts` |
| g | Servidor processa cadastro | `POST /users` | `servidor/src/modulos/usuarios/rotas-usuarios.ts`, `servico-usuarios.ts`, `validacao-usuarios.ts` | servidor: `rotas-cadastro.test.ts`, `servico-usuarios.test.ts`, `validacao-usuarios.test.ts`, `conformidade-fluxo.test.ts` |
| h | Servidor processa login | `POST /sessions` | `servidor/src/modulos/sessoes/rotas-sessoes.ts`, `servico-sessoes.ts`, `servidor/src/utilitarios/jwt.ts` | servidor: `rotas-sessoes.test.ts`, `servico-sessoes.test.ts`, `jwt.test.ts`, `senha.test.ts` |
| i | Servidor envia dados do usuário | `GET /users/{id}` | `servidor/src/modulos/usuarios/rotas-usuarios.ts`, `servidor/src/intermediarios/autenticacao.ts`, `posse.ts` | servidor: `rotas-usuario-id.test.ts`, `autenticacao.test.ts` |
| j | Servidor processa atualização | `PUT` e `PATCH /users/{id}` | `servidor/src/modulos/usuarios/rotas-usuarios.ts`, `servico-usuarios.ts` | servidor: `rotas-usuario-id.test.ts`, `servico-usuarios.test.ts` |
| k | Servidor apaga cadastro | `DELETE /users/{id}` | `servidor/src/modulos/usuarios/rotas-usuarios.ts`, `repositorio-usuarios.ts` | servidor: `rotas-usuario-id.test.ts`, `repositorio-usuarios.test.ts` |
| l | Servidor processa logout | `DELETE /sessions/{id}` | `servidor/src/modulos/sessoes/rotas-sessoes.ts`, `repositorio-sessoes.ts` | servidor: `rotas-sessoes.test.ts`, `repositorio-sessoes.test.ts` |

Observações da avaliação:

| Obs. | Como é atendida | Onde verificar |
|---|---|---|
| 3. Campo de porta do servidor em interface gráfica | Campo "Porta da API" no painel, sem valor padrão, validado (inteiro de 1 a 65535). Nada é digitado no terminal. | `servidor/src/painel/publico/index.html`, seção 4.1 |
| 4. Campos de IP e porta no cliente | Tela "Conectar ao servidor": "IP do servidor" e "Porta". | `cliente/src/paginas/PaginaConexao.tsx`, seção 4.3 |
| 5 e 6. Interoperabilidade com todos os clientes e servidores | Protocolo seguido à risca; servidor tolerante (ignora campos desconhecidos, aceita barra final e `Content-Type` com ou sem `charset`); cliente tolerante a respostas 2xx divergentes e a respostas fora do padrão; intermediário elimina a dependência do CORS dos servidores alheios. | Seções 1, 5.6 e 5.7; testes `colega-simulado.test.ts` e `conformidade-*.test.ts` |
| 7. Sem alterações durante a avaliação | Testes de caminho feliz e de erro, incluindo concorrência, servidor desligado, respostas lentas, enormes e fora do padrão. | Seção 8 |

Requisitos funcionais e não funcionais:

| Requisito | Como é atendido |
|---|---|
| Login | `POST /sessions` busca o usuário pelo e-mail (sem diferenciar maiúsculas), confere a senha e, se correta, cria a sessão e devolve id da sessão, token JWT e dados do usuário. Credenciais inválidas: `401` genérico. |
| Logout por lista de sessões ativas | `DELETE /sessions/{id}` apaga a linha em `sessoes`; depois disso o token recebe `401` em qualquer rota protegida. |
| Cadastro | Valida os campos e confere duplicidade; e-mail existente retorna `409` com orientação para fazer login, e a interface oferece ir ao login com o e-mail preenchido. |
| Leitura | `GET /users/{id}` exige token válido e id da URL igual ao do dono do token (senão `403`). |
| Atualização | `PUT` (todos os campos) e `PATCH` (um ou mais), com as mesmas validações do cadastro e `409` para e-mail duplicado. |
| Exclusão com confirmação | Confirmação no cliente (diálogo "Excluir cadastro?") antes de enviar o `DELETE`; a exclusão apaga também as sessões do usuário. |
| E-mail | Contém `@` e domínio (`^[^@\s]+@[^@\s]+\.[^@\s]+$`), de 5 a 30 caracteres. |
| Senha | De 6 a 20 caracteres, só letras sem acento e dígitos (`^[a-zA-Z0-9]+$`). |
| Nome | De 3 a 50 caracteres após remover espaços das pontas. |
| Token | JWT HS256 em `Authorization: Bearer <token>`. |
| Processamento paralelo | Pool de threads (seções 5.1 e 5.2). |

## 8. Testes

### 8.1 Suítes automatizadas

Quantidades obtidas executando cada comando em 19/10/2026 (Windows 11, Deno 2.9.7, Node 24.14.0).

| Suíte | Pasta | Comando | Cobertura | Testes |
|---|---|---|---|---|
| Servidor | `servidor/` | `deno task test` | Rotas de usuários e sessões (caminho feliz e todos os erros), validações, senha, JWT, lista de sessões ativas, CORS, `404` e `405`, banco, transações, pool, painel (incluindo CSRF) e concorrência. | 340 aprovados, 0 falhas |
| Interface | `cliente/` | `npm test` | Cliente HTTP, operações do protocolo, validações, mascaramento, tratamento de `401`, rotas, painel de mensagens e tema. | 147 aprovados, 0 falhas |
| Intermediário | `cliente/intermediario/` | `deno task test` | Validação do pedido, encaminhamento, erros de rede, arquivos estáticos, token anti-CSRF, `Host` e `Origin`. | 47 aprovados, 0 falhas |
| Integração | `testes-integracao/` | `deno task test` | Cliente, intermediário e servidor real juntos; servidor de colega simulado; cenários adversos; concorrência ponta a ponta. | 14 testes: 13 aprovados e 1 falha |

A falha é o teste "fluxo completo: cliente, intermediário, servidor real e banco" (`testes-integracao/testes/fluxo-completo.test.ts`, linha 34): ele ainda espera status `405` na verificação do servidor, mas a verificação passou a usar `OPTIONS`, que o servidor responde com `204`, como o protocolo exige. O sistema está correto; a expectativa do teste está desatualizada.

Os testes usam bancos e segredos temporários e nunca tocam em `servidor/dados/` (as suítes do servidor e de integração têm um teste final, `zz-sem-arquivos-reais.test.ts`, que confere isso).

Todas as suítes em sequência, a partir da raiz:

```bash
(cd servidor && deno task test)
(cd cliente/intermediario && deno task test)
(cd cliente && npm test)
(cd testes-integracao && deno task test)
```

Para executar os testes de integração, instale antes as dependências dessa pasta: `(cd testes-integracao && deno install)`.

Verificações de qualidade (executadas com sucesso em 19/10/2026): `deno task check`, `deno task lint` e `deno task fmt:check` em `servidor/`, `cliente/intermediario/` e `testes-integracao/`; `npm run typecheck`, `npm run lint` e `npm run build` em `cliente/`.

### 8.2 Servidor de colega simulado

Para testar o cliente contra um servidor diferente do próprio, sem CORS:

```bash
cd testes-integracao
deno task colega --modo=correto --porta=20001
```

| Modo | Comportamento |
|---|---|
| `correto` | Segue o protocolo, mas sem CORS. |
| `divergente` | Responde `200` onde o protocolo define `201`/`204`, devolve `id` em texto e campos extras; o cliente tolera. |
| `quebrado` | Responde com corpos e tipos fora do protocolo; o cliente mostra erro sem travar. |
| `lento` | Atrasa cada resposta; acima de 10 segundos o intermediário informa tempo esgotado. |
| `enorme` | Devolve resposta acima do limite do intermediário (2 MB). |

Sem `--porta`, o sistema operacional escolhe uma (o terminal mostra `Colega simulado (modo) em http://0.0.0.0:PORTA/api/v1`). Execute `iniciar-cliente` e, na tela de conexão, informe `localhost` e essa porta. Encerre com `Ctrl+C`.

### 8.3 Roteiro de teste manual

Com o painel do servidor e o painel de mensagens do cliente abertos:

1. (g) Crie uma conta. `POST /users` com `201` nos dois painéis; o do servidor mostra o número da thread.
2. (g) Tente criar outra com o mesmo e-mail (pode variar as maiúsculas): `409`, com oferta de ir ao login.
3. (h) Entre. `POST /sessions` com `201`; senha como `"***"` e token truncado.
4. (i) O perfil carrega (`GET /users/{id}` com `200`).
5. (j) Edite só o nome: `PATCH` com apenas `nome` (`200`).
6. (j) Edite sem alterar nada: o cliente avisa "Nenhuma alteração para salvar." e não envia.
7. (l) "Sair": `DELETE /sessions/{id}` com `204` e volta ao login.
8. (h) Entre de novo e confira que o perfil carrega com o token novo.
9. (k) "Excluir cadastro", cancele (nada é enviado), repita e confirme: `DELETE /users/{id}` com `204` e volta ao login.
10. Tente entrar com a conta excluída: `401` "E-mail ou senha inválidos.".

## 9. Estrutura do repositório

```text
.
├── README.md
├── iniciar-servidor.bat / .sh   inicia o servidor (painel gráfico)
├── iniciar-cliente.bat / .sh    instala dependências se faltarem, gera a interface, inicia o intermediário
├── protocolo/
│   ├── protocolo-cliente-servidor.yaml   protocolo da turma (OpenAPI 3.0.3)
│   └── README.md                         regras gerais do protocolo
├── servidor/
│   ├── deno.json, deno.lock     tarefas e dependências
│   ├── dados/.gitkeep           pasta do banco e do segredo (conteúdo gerado na execução)
│   ├── src/
│   │   ├── principal.ts         thread principal: painel e ciclo de vida
│   │   ├── controlador-servidor.ts   iniciar, parar e estado da API
│   │   ├── estado.ts            tipos do estado e dos registros do log
│   │   ├── recepcao.ts          Deno.serve da API e envio ao pool
│   │   ├── aplicacao.ts         app Hono (executado em cada thread)
│   │   ├── pool/                gerenciador do pool, mensagens e Worker de processamento
│   │   ├── painel/              rotas do painel e publico/ (index.html, painel.css, painel.js)
│   │   ├── banco/               conexão, migrações, erros e transação
│   │   ├── intermediarios/      CORS, autenticação, posse e 405
│   │   ├── modulos/
│   │   │   ├── usuarios/        rotas, serviço, repositório, validação, respostas e tipos
│   │   │   └── sessoes/         rotas, serviço, repositório, respostas e tipos
│   │   └── utilitarios/         senha, JWT, segredo, JSON, respostas, máscara, rede e portas
│   └── testes/                  um arquivo .test.ts por módulo, mais auxiliares/
├── cliente/
│   ├── package.json, package-lock.json, vite.config.ts, vitest.config.ts, eslint.config.js, tsconfig*.json
│   ├── index.html, public/
│   ├── src/
│   │   ├── main.tsx, Aplicacao.tsx
│   │   ├── api/                 cliente HTTP, operações do protocolo, validação de respostas, máscara
│   │   ├── contextos/           conexão, sessão, mensagens, operações e tema
│   │   ├── rotas/               configuração das rotas e rotas protegidas
│   │   ├── paginas/             Conexão, Cadastro, Login, Perfil e Editar cadastro
│   │   ├── componentes/         componentes reutilizáveis e painel-mensagens/
│   │   ├── validacao/           regras do protocolo
│   │   ├── tipos/               tipos do protocolo e do intermediário
│   │   └── estilos/             CSS global
│   ├── testes/                  testes da interface (Vitest)
│   └── intermediario/
│       ├── deno.json, deno.lock
│       ├── src/                 principal.ts, aplicacao-intermediario.ts, encaminhar.ts, pedido-envio.ts, arquivos-estaticos.ts, abrir-navegador.ts
│       └── testes/              testes e fixtures/dist/
└── testes-integracao/
    ├── deno.json, deno.lock
    ├── auxiliares/              inicia servidor real e intermediário para os testes
    ├── colega-simulado/         servidor de colega simulado (sem CORS)
    └── testes/                  cenários adversos, colega simulado, concorrência e fluxo completo
```

Itens que não vêm no arquivo compactado e são obtidos automaticamente pelos scripts de inicialização (seção 3, passo 4):

| Arquivo ou pasta | Origem |
|---|---|
| `servidor/dados/ecommerce.db` (e `-wal`, `-shm`) | Banco de dados, criado na primeira vez que o servidor é iniciado pelo painel (a pasta `servidor/dados/` já vem no arquivo). |
| `servidor/dados/segredo-jwt.txt` | Segredo do JWT, gerado na primeira execução; sigiloso. |
| `cliente/node_modules/` | Dependências da interface, instaladas por `npm ci`. |
| `cliente/dist/` | Interface compilada, gerada por `npm run build`. |

## 10. Solução de problemas

| Problema | Causa provável | Solução |
|---|---|---|
| Script mostra "Deno nao encontrado" ou "Node.js nao encontrado" | Não instalado ou fora do `PATH` | Instale, feche e abra o terminal e confira com `deno --version` e `node --version`. |
| Painel: "A porta N já está em uso por outro programa. Escolha outra porta." | Outro programa usa a porta | Digite outra porta e clique em "Iniciar servidor". |
| Colegas não conseguem conectar ao seu servidor | Firewall, IP ou porta errados, redes diferentes | Libere o Deno (ou a porta) no firewall para redes privadas; confira o IP e a porta em "Endereços de acesso"; de outra máquina, `curl -i -X OPTIONS http://IP:PORTA/api/v1/users` deve retornar `204`. |
| Cliente mostra "Não foi possível conectar ao servidor. Verifique o IP, a porta e se o servidor está em execução." | IP ou porta errados, servidor desligado, rede inacessível | Confira IP e porta e se o painel do servidor mostra "Em execução". |
| "O intermediário do cliente não está em execução. Feche e abra o cliente novamente." | Processo do intermediário encerrado | Feche a aba e execute `iniciar-cliente` de novo. |
| "Nao foi possivel instalar as dependencias. Verifique a conexao com a internet." ou falha ao baixar o Hono | Primeira execução sem internet | Conecte-se e execute de novo; depois disso a internet não é mais necessária. |
| "Interface do cliente não encontrada. Execute o script iniciar-cliente novamente." | `cliente/dist/` não existe | Execute `iniciar-cliente` (ele gera a interface) em vez de `deno task start` direto. |
| O navegador não abriu sozinho | Nenhum navegador pôde ser aberto | Copie para o navegador o endereço impresso no terminal (`Painel do servidor: ...` ou `Cliente: ...`). |
| Zerar os dados do servidor | | Com o servidor encerrado, apague `servidor/dados/ecommerce.db` e, se existirem, `ecommerce.db-wal` e `ecommerce.db-shm`; o banco é recriado vazio. O `segredo-jwt.txt` pode ser mantido (tokens antigos deixam de valer porque as sessões foram apagadas) ou apagado (novo segredo é gerado). |
| Deno mostra `Failed to resolve 'open' for allow-run` e `Failed to resolve 'xdg-open' for allow-run` ao iniciar | O Windows não tem esses programas, que a permissão também lista (macOS e Linux) | Avisos sem efeito. |
| Recarreguei a página e voltei à tela de conexão | A sessão fica só em memória, de propósito | Conecte-se e entre de novo. |
