# Protocolo Cliente-Servidor — E-commerce

Este repositório contém o **protocolo de comunicação compartilhado** usado na disciplina de Tecnologias Cliente-Servidor. Cada aluno implementa seu próprio cliente e servidor, em linguagem e framework livres, mas **todos precisam falar a mesma "língua"** na hora de trocar requisições HTTP — é isso que este arquivo define.

Se o seu cliente segue este protocolo, ele deve conseguir conversar com o servidor de qualquer colega (e vice-versa), mesmo que o servidor dele esteja em outra linguagem/framework completamente diferente da sua.

## Documentação publicada (GitHub Pages)

**https://josemarra2006.github.io/protocolo-cliente-servidor/**

Página interativa (Swagger UI), gerada a partir da pasta [`docs/`](./docs). Ela busca o `protocolo-cliente-servidor.yaml` direto do repositório, então qualquer push na `main` que altere o arquivo atualiza a documentação automaticamente.

## O que é este protocolo

O arquivo [`protocolo-cliente-servidor.yaml`](./protocolo-cliente-servidor.yaml) é uma especificação **OpenAPI 3.0.3** (também conhecida como "Swagger"). Ele descreve, de forma neutra a qualquer linguagem:

- quais **rotas** (endpoints) existem;
- qual **método HTTP** cada uma usa (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, e `OPTIONS` no preflight de CORS);
- o formato exato do **corpo da requisição** (JSON) que cada rota espera;
- o formato exato da **resposta** (JSON) que cada rota devolve;
- quais **códigos de status HTTP** (200, 201, 400, 401, 404, 409...) cada rota pode retornar e em qual situação;
- as **restrições de validação** de cada campo (tamanho mínimo/máximo, formato, caracteres permitidos);
- como funciona a **autenticação** (token Bearer).

Não importa se seu servidor é feito em Node, Java, Python, C#, Go, PHP etc. — desde que ele implemente essas rotas exatamente como descritas aqui, qualquer cliente de colega (também implementado a partir deste protocolo) deve conseguir usá-lo.

### Por que isso importa

Como não podemos nos ajudar diretamente no código, este arquivo é o **único contrato** que garante que todo mundo vai conseguir se comunicar no dia da integração. Qualquer ambiguidade ou divergência de interpretação aqui vira um bug de interoperabilidade lá na frente — por isso o protocolo precisa ser lido com atenção e qualquer dúvida/sugestão deve virar uma issue ou PR (veja mais abaixo).

## Escopo desta versão (1.5.0: 1ª e 2ª entregas)

| Funcionalidade | Rota | Método | Quem pode |
|---|---|---|---|
| Login (criar sessão) | `/sessions` | `POST` | público |
| Logout (encerrar sessão) | `/sessions/{id}` | `DELETE` | dono da sessão |
| Criar usuário (cadastro) | `/users` | `POST` | público |
| Listar todos os usuários | `/users` | `GET` | ADM |
| Buscar usuário por id | `/users/{id}` | `GET` | dono ou ADM |
| Atualizar usuário (todos os campos) | `/users/{id}` | `PUT` | dono ou ADM |
| Atualizar usuário (campos parciais) | `/users/{id}` | `PATCH` | dono ou ADM |
| Remover usuário | `/users/{id}` | `DELETE` | dono ou ADM |
| Listar produtos (com estoque) | `/products` | `GET` | qualquer usuário logado |
| Cadastrar produto | `/products` | `POST` | ADM |
| Buscar produto por id (consultar estoque) | `/products/{id}` | `GET` | qualquer usuário logado |
| Atualizar produto (todos os campos) | `/products/{id}` | `PUT` | ADM |
| Atualizar produto (campos parciais) | `/products/{id}` | `PATCH` | ADM |
| Remover produto | `/products/{id}` | `DELETE` | ADM |

Login e logout são modelados como criação/remoção do recurso **sessão** (`/sessions`), em vez de rotas de ação tipo `/auth/login` — isso segue o princípio REST de identificar recursos, não ações (uma URL não deve descrever um verbo). Pelo mesmo motivo, consultar o estoque não tem rota própria: a quantidade em estoque é um campo do recurso **produto**, lido com `GET /products/{id}`.

## Papéis de usuário (comum e ADM)

Todo usuário tem o campo `admin` (booleano) em `UserResponse`, inclusive no `usuario` devolvido pelo login — é por ele que o cliente decide se mostra as telas de administração.

- **Como alguém vira ADM é definido pelo protocolo:** existe um **ADM padrão**, descrito na subseção abaixo, que todo servidor cria sozinho. `POST /users` sempre cria usuário comum, e nenhuma rota altera o papel: um campo `admin` enviado em `POST`, `PUT` ou `PATCH` de `/users` é ignorado (regra 7).
- **ADM** pode listar, ler, atualizar e remover **qualquer** usuário (inclusive outro ADM ou a si mesmo) e é o único que cadastra, atualiza e remove produtos.
- **Usuário comum** só mexe no próprio cadastro e só lê produtos.
- Sessões continuam sendo só do dono: nem o ADM encerra a sessão de outra pessoa com `DELETE /sessions/{id}`. Remover um usuário encerra todas as sessões dele.

### ADM padrão

Para que qualquer cliente consiga usar as funções de administração em qualquer servidor, todos os servidores têm o **mesmo** ADM, com estas credenciais fixas:

| Campo | Valor |
|---|---|
| `nome` | `Admin` |
| `email` | `adm@teste.com` |
| `senha` | `admin123` |

Essas credenciais já respeitam as restrições de dados do protocolo (nome de 3 a 50 caracteres, e-mail de 5 a 30 caracteres com `@` e domínio, senha alfanumérica de 6 a 20 caracteres). Regras:

1. **Criação automática** — a cada inicialização, o servidor verifica se existe um usuário com o e-mail `adm@teste.com` (comparação sem diferenciar maiúscula/minúscula, regra 8). Se não existir, cria esse usuário com `admin: true`, com o nome e a senha da tabela. Se já existir, não altera nada. Isso vale tanto para banco novo quanto para banco já existente.
2. **Sem outra forma de criar ADM** — nenhuma rota cria ou promove ADM. O único mecanismo que cria ADM é a verificação da regra 1.
3. **Mesmas regras dos demais usuários** — o ADM padrão pode ser lido, atualizado e removido pelas mesmas rotas de `/users/{id}`, sem proteção especial. Como a criação é verificada a cada inicialização, se o e-mail padrão deixar de existir (por remoção ou por troca de e-mail), a próxima inicialização do servidor cria o ADM padrão de novo.
4. **Combinado para a avaliação** — para não quebrar o acesso padronizado dos outros clientes, ninguém deve alterar nem remover o ADM padrão durante a avaliação.
5. **Clientes** — decidem se mostram as telas de administração apenas pelo campo `admin` do usuário devolvido no login (`usuario.admin`), nunca pelo e-mail nem pelo `id`, que não é fixo e varia de servidor para servidor. Se a resposta de algum servidor vier sem o campo `admin`, o cliente deve tratá-lo como `false`.
6. **Cadastro com o e-mail padrão** — `POST /users` com `adm@teste.com` recebe `409`, como qualquer e-mail já cadastrado (a comparação ignora maiúscula/minúscula, regra 8).
7. **Implementação livre** — como o servidor guarda a senha e cria o usuário internamente é decisão de cada um; o protocolo exige apenas o comportamento descrito. As credenciais são públicas e valem somente para o ambiente da disciplina.

## Como a autenticação funciona

1. O cliente envia `email` e `senha` para `POST /sessions`.
2. Se as credenciais baterem, o servidor cria uma sessão e responde com o **id da sessão**, o **token** (por exemplo, um JWT) e os dados do usuário.
3. O token deve ser enviado em toda requisição que exige autenticação, no header:
   ```
   Authorization: Bearer <token>
   ```
4. Nas rotas `/users/{id}` (GET, PUT, PATCH, DELETE), o servidor recebe o `id` do usuário na URL **e** o token no header. Ele precisa checar se aquele `id` pertence ao dono do token — se não pertencer **e o dono do token não for ADM**, responde `403 Forbidden`. Isso mantém a URL endereçando o recurso pelo seu id (RESTful), sem abrir brecha pra um usuário mexer no cadastro de outro só trocando o número na URL.
5. `DELETE /sessions/{id}` faz o logout — `{id}` aqui é o **id da sessão** devolvido no login, não o token inteiro. Mesma regra: o id da sessão na URL precisa pertencer ao dono do token enviado. O servidor deve remover essa sessão de uma "whitelist" de sessões ativas (ou colocá-la numa "blacklist"). Depois do logout, o token daquela sessão não pode mais ser usado em nenhuma rota, exceto `POST /sessions` e `POST /users`.

## Regras gerais do protocolo

Valem pra todo cliente e servidor, em qualquer linguagem:

1. **Prefixo** — toda rota começa com `/api/v1`. IP e porta são variáveis (quem define é quem sobe o servidor).
2. **Formato** — corpo sempre `Content-Type: application/json`, UTF-8. Servidor deve aceitar o header com ou sem `; charset=utf-8`.
3. **Autenticação** — header `Authorization: Bearer <token>` (um espaço depois do `Bearer`). O token é o campo `token` devolvido por `POST /sessions`; trate como string opaca, não precisa decodificar. Vale enquanto a sessão estiver na whitelist do servidor (até logout ou exclusão do usuário) — servidor pode também expirar por tempo, se quiser. Ao tomar `401` numa rota protegida, o cliente deve encerrar a sessão local e voltar pro login.
4. **Rotas públicas** — só `POST /sessions` e `POST /users` (fora o `OPTIONS`, regra 5) não exigem token.
5. **CORS** — toda resposta, inclusive erro, leva `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS` e `Access-Control-Allow-Headers: Content-Type, Authorization`. Toda rota responde `OPTIONS` (preflight) com `204`, mesmos cabeçalhos, sem token e sem corpo — obrigatório pra clientes rodando em navegador (React etc.) funcionarem.
6. **Erros** — sempre corpo JSON no formato `ErroResponse`: `{"mensagem": "texto"}`. Se a resposta não vier nesse formato, o cliente deve mostrar algo genérico baseado no status, sem travar.
7. **Tolerância a campos** — servidor ignora campo desconhecido no JSON recebido; cliente ignora campo extra na resposta. Um `id` enviado no corpo de PUT/PATCH é ignorado — vale sempre o `id` da URL.
8. **E-mail** — comparação (duplicidade, login) ignora maiúscula/minúscula.
9. **Nome e descrição** — servidor faz trim (remove espaços nas pontas) antes de validar e salvar. Vale para o `nome` do usuário e para o `nome` e a `descricao` do produto.
10. **Ordem de validação** em todas as rotas protegidas — quando há mais de um problema, o servidor responde com o primeiro nesta ordem: `401` (token) → `400` (id da URL mal formatado) → `403` (sem permissão) → `404` (não existe) → `400` (corpo inválido) → `409` (e-mail duplicado). Cada rota só usa os códigos que lista no YAML. "Sem permissão" é: em `/users/{id}`, o id não é do dono do token e ele não é ADM; em `/sessions/{id}`, a sessão não é do dono do token; em `GET /users` e nas escritas de `/products`, o dono do token não é ADM. Como o `403` vem antes do `404`, um usuário comum que tenta mexer num id de outro usuário ou editar um produto — exista ou não — sempre recebe `403`. Para o ADM, um id que não existe dá `404`, exceto em `DELETE /sessions/{id}`: uma sessão que não existe também não é do dono do token, então dá sempre `403`, para qualquer usuário, inclusive ADM. Essa rota nunca devolve `404`.
11. **Senha** — nunca volta em nenhuma resposta.
12. **Erro interno** — falha inesperada do servidor é `500` com corpo `ErroResponse`.
13. **Tipos e null** — todo campo deve ter o tipo certo (texto é string JSON); campo com tipo errado ou `null` dá `400`. Servidor não converte tipo. No PATCH, campo que não deve mudar simplesmente não é enviado.
14. **Múltiplas sessões** — cada login bem-sucedido cria uma sessão nova e independente (id e token próprios), mesmo que o usuário já tenha outra ativa. `DELETE /sessions/{id}` encerra só aquela sessão.
15. **Rota/método inexistente** — rota que não existe dá `404`; método não suportado numa rota que existe dá `405`. Ambos com corpo `ErroResponse` e cabeçalhos CORS.
16. **Listas** — `GET /users` e `GET /products` devolvem um array JSON (vazio quando não há registros), ordenado por `id` crescente, sem paginação nem filtros.
17. **Location nas criações** — toda resposta `201` leva o cabeçalho `Location` com o caminho do recurso criado, começando em `/api/v1` e sem esquema nem host (IP e porta variam de servidor para servidor): `/api/v1/users/{id}` em `POST /users`, `/api/v1/products/{id}` em `POST /products` e `/api/v1/sessions/{id}` em `POST /sessions`, onde `{id}` é o id do próprio recurso criado (no login, o id da sessão). O cabeçalho é informativo: o cliente não deve depender dele (o navegador só deixa o JavaScript ler cabeçalhos liberados por CORS, e `Location` não está entre eles) e usa o `id` que vem no corpo da resposta. O cliente deve funcionar mesmo se o `Location` vier ausente.

## Regras de validação de dados

Estas regras estão embutidas no schema do YAML (`Email`, `Senha`, `Nome`, `NomeProduto`, `Descricao` e `Quantidade`, em `components/schemas`) e devem ser respeitadas por todos os servidores:

**E-mail**
- Precisa conter `@` e um domínio válido;
- Entre 5 e 30 caracteres.

**Senha**
- Entre 6 e 20 caracteres;
- Alfanumérica (letras maiúsculas/minúsculas e números);
- **Não pode** conter caracteres especiais.

**Nome do produto**
- Entre 2 e 100 caracteres, depois do trim;
- Nomes repetidos são permitidos (o produto é identificado pelo `id`).

**Descrição do produto**
- Até 500 caracteres, depois do trim;
- Pode ser vazia (`""`), mas o campo precisa vir no `POST` e no `PUT`.

**Quantidade em estoque**
- Número inteiro JSON entre 0 e 1.000.000;
- Decimal (`1.5`), negativo ou texto (`"10"`) dá `400`.

Se um campo não seguir essas regras, o servidor deve responder `400 Bad Request`.

## Códigos de resposta esperados (resumo)

| Código | Quando acontece |
|---|---|
| `200 OK` | Operação de leitura/atualização concluída com sucesso |
| `201 Created` | Usuário, sessão ou produto criado com sucesso, com o cabeçalho `Location` (regra 17) |
| `204 No Content` | Logout ou remoção (de usuário ou produto) concluídos, sem corpo de resposta |
| `400 Bad Request` | Corpo mal formatado ou violando alguma restrição de validação |
| `401 Unauthorized` | Token ausente, inválido ou já invalidado por logout |
| `403 Forbidden` | Sem permissão: o `id` de usuário na URL não pertence ao dono do token e ele não é ADM; a sessão na URL não pertence ao dono do token (inclusive quando não existe, mesmo para ADM); ou a rota é exclusiva de ADM |
| `404 Not Found` | Usuário ou produto com o `id` informado não existe, ou a rota não existe |
| `405 Method Not Allowed` | Método HTTP não suportado numa rota que existe |
| `409 Conflict` | E-mail já cadastrado (por outro usuário, no cadastro ou no PUT/PATCH) |
| `500 Internal Server Error` | Falha inesperada no servidor |

## Estrutura dos dados (schemas)

- **`LoginRequest`** — `{ email, senha }`
- **`SessionResponse`** — `{ id, token, usuario: UserResponse }`, todos obrigatórios (`id` é o id da sessão, usado no `DELETE /sessions/{id}`)
- **`UserRequest`** — `{ nome, email, senha }` (usado no cadastro e no PUT, todos obrigatórios)
- **`UserPatchRequest`** — mesmos campos, todos opcionais, mas pelo menos um precisa vir (usado no PATCH)
- **`UserResponse`** — `{ id, nome, email, admin }`, todos obrigatórios (nunca inclui a senha)
- **`ProductRequest`** — `{ nome, descricao, quantidade }` (usado no cadastro e no PUT de produto, todos obrigatórios)
- **`ProductPatchRequest`** — mesmos campos, todos opcionais, mas pelo menos um precisa vir (usado no PATCH de produto)
- **`ProductResponse`** — `{ id, nome, descricao, quantidade }`, todos obrigatórios
- **`ErroResponse`** — `{ mensagem }` (corpo padrão de toda resposta de erro)
- **`Email`** — string de 5 a 30 caracteres, com `@` e domínio
- **`Senha`** — string alfanumérica de 6 a 20 caracteres, sem caracteres especiais
- **`Nome`** — string de 3 a 50 caracteres, já com trim aplicado
- **`NomeProduto`** — string de 2 a 100 caracteres, já com trim aplicado
- **`Descricao`** — string de até 500 caracteres (pode ser vazia), já com trim aplicado
- **`Quantidade`** — inteiro de 0 a 1.000.000

Consulte o YAML diretamente para ver os exemplos completos de cada campo — ele pode ser aberto em qualquer editor com suporte a OpenAPI (VS Code com extensão, [Swagger Editor](https://editor.swagger.io/), Insomnia, Postman etc.) pra visualizar de forma mais amigável.

## Como visualizar o protocolo de forma mais legível

Além da documentação publicada (link no topo deste README), dá pra copiar o conteúdo de `protocolo-cliente-servidor.yaml` e colar em https://editor.swagger.io/ pra visualizar sem depender do link publicado.

## Como contribuir (fork + pull request)

Este protocolo é um contrato **compartilhado por toda a turma**. Se você encontrar algo ambíguo, incompleto, ou que impede a interoperabilidade entre implementações, siga este fluxo:

1. **Abra uma issue primeiro**, descrevendo o problema ou a sugestão. Como qualquer mudança no protocolo afeta todo mundo, é importante alinhar antes de sair editando.
2. **Faça um fork** deste repositório (botão "Fork" no canto superior direito da página do GitHub).
3. **Clone o seu fork** localmente:
   ```bash
   git clone https://github.com/<seu-usuario>/protocolo-cliente-servidor.git
   cd protocolo-cliente-servidor
   ```
4. **Crie uma branch** para sua alteração:
   ```bash
   git checkout -b minha-alteracao
   ```
5. **Edite o `protocolo-cliente-servidor.yaml`** com a mudança proposta.
6. **Commite e envie para o seu fork:**
   ```bash
   git add .
   git commit -m "descreva a alteração aqui"
   git push origin minha-alteracao
   ```
7. **Abra um Pull Request** do seu fork para a branch `main` deste repositório (o próprio GitHub sugere isso assim que você faz o push). Descreva no PR o que mudou e por quê.
8. Aguarde revisão — como o protocolo é compartilhado, o ideal é que a mudança seja discutida/aprovada antes do merge.

Se você só quer **manter uma cópia própria** do protocolo (sem necessariamente contribuir de volta), o fork sozinho já resolve — ele fica salvo na sua conta do GitHub e você pode sincronizar com o repositório original quando quiser, usando o botão "Sync fork" ou:
```bash
git remote add upstream https://github.com/JoseMarra2006/protocolo-cliente-servidor.git
git fetch upstream
git merge upstream/main
```

## Versionamento

O campo `version` no topo do YAML (`info.version`) é incrementado a cada mudança relevante no protocolo. Fique de olho nele — se você já implementou algo baseado numa versão anterior, um PR aceito pode exigir ajustes no seu cliente/servidor. O histórico de cada versão fica no log de commits do GitHub, não mais dentro do YAML.

**Versão atual: 1.5.0.** Novidades em relação à 1.4.0: o ADM padrão fixo e igual em todos os servidores (seção "ADM padrão"); `DELETE /sessions/{id}` com sessão inexistente dá `403`, nunca `404` (regra 10); e toda resposta `201` leva o cabeçalho `Location` (regra 17).
