# Fubá — painel operacional de entregas

MVP do painel da operação: pedidos, planejamento de rotas, motoristas, veículos,
execução das entregas com comprovante, ocorrências, monitoramento e histórico.
Backend 100% Firebase (Authentication + Cloud Firestore), sem Cloud Functions.

> "Fubá" é o nome de trabalho do projeto (pasta `projeto-fuba`). Troque no
> `Sidebar.tsx`, `LoginPage.tsx`, `index.html` e `favicon.svg` quando houver marca.

## Rodando localmente (emuladores, sem projeto Firebase)

Pré-requisitos: Node 20+ e **Java 21+** (exigido pelo emulador do Firestore).

```bash
npm install
cp .env.example .env          # o exemplo já aponta para os emuladores
npm run emulators             # terminal 1 — Auth :9099, Firestore :8080, UI :4000
npm run seed:emulator         # terminal 2 — organização demo com dados fictícios
npm run dev:emulator          # terminal 2 — http://localhost:5173 (modo emulador)
```

`npm run dev` usa o `.env` (projeto real); `npm run dev:emulator` sobrepõe com `.env.emulator`.
Os testes sempre usam os emuladores, independentemente do `.env`.

Acessos criados pelo seed (senha `demo1234`):

| E-mail | Perfil |
|---|---|
| `admin@demo.fuba` | Administrador |
| `operador@demo.fuba` | Operador |
| `motorista@demo.fuba` | Motorista (não entra no painel; reservado ao app) |

Os dados do emulador são descartados quando ele para. Para recriar: `npm run seed:emulator -- --reset`.

## Usando um projeto Firebase real

1. Crie o projeto no console, ative **Authentication → E-mail/senha** e o **Cloud Firestore**.
2. Preencha `.env` com a configuração web do app e `VITE_USE_EMULATORS=false`.
3. Publique regras e índices: `npx firebase deploy --only firestore --project SEU_PROJETO`
   (exige `npx firebase login`). Alternativa só com a chave de serviço (regras; índices exigem o papel
   *Cloud Datastore Index Admin*): `npx tsx scripts/deploy-firestore.ts <chave.json>`.
   Diagnóstico somente leitura (Firestore, Auth, estado dos índices): `npx tsx scripts/check-firebase.ts <chave.json>`.
4. Crie a organização e o primeiro administrador (Admin SDK, com uma chave de conta de serviço
   que **não** deve ir para o repositório — o `.gitignore` já bloqueia `serviceAccountKey*.json`):

   ```bash
   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json npx tsx scripts/seed.ts \
     --project SEU_PROJETO --confirm --org-id minha-org --org-name "Minha Empresa" \
     --admin-email voce@empresa.com --admin-password 'SenhaForte123' --admin-name "Seu Nome" --no-demo
   ```

   Sem `--no-demo`, cria também os dados de demonstração.
5. Os demais usuários são criados pelo administrador em **Configurações → Usuários**.

## Testes

```bash
npm test              # unitários: máquinas de estado, validações, espelho das regras
npm run test:rules    # sobe os emuladores e roda regras + fluxo completo com os services reais
```

`tests/emulator/flow.test.ts` executa o fluxo principal (pedido → rota → motorista/veículo →
início → localização → chegada → entrega com foto → falha → finalização → histórico →
reagendamento) autenticado e **com as regras de segurança ativas**, incluindo uma rota de 30
paradas criada e iniciada em transação única.

## Arquitetura

```
src/
  domain/status.ts        máquinas de estado e rótulos (fonte única dos status)
  types/domain.ts         tipos das entidades
  firebase/               inicialização, emuladores, nomes das coleções
  services/               única camada que fala com o Firestore (um service por domínio)
  hooks/                  sessão, dados compartilhados em tempo real, ações com feedback
  components/ui|layout|map  componentes reutilizáveis; mapa atrás de um contrato (MapView)
  features/               componentes por domínio (orders, routes, proofs, occurrences…)
  pages/                  telas roteadas
firestore.rules           autorização e validação no servidor
firestore.indexes.json    índices compostos usados pelas consultas
scripts/seed.ts           provisionamento e dados de demonstração (Admin SDK)
```

### Consistência do estado

- **Toda mudança de status passa por um service** e roda em `runTransaction`: lê o estado
  atual, valida a transição (`domain/status.ts`), grava pedido, parada, rota, comprovante,
  ocorrência e histórico no mesmo commit. Nada fica pela metade.
- **As regras do Firestore revalidam no servidor** as mesmas transições (tabelas espelhadas;
  um teste unitário falha se as duas divergirem), além de: `organizationId` do perfil,
  papel do usuário, datas `request.time`, autor (`createdBy`/`changedBy`) igual ao usuário
  autenticado, pedido só vira `DELIVERED` se o comprovante existir no mesmo lote, rota só
  conclui com todas as paradas resolvidas, contadores sequenciais só avançam de 1 em 1.
- Histórico, comprovantes e localização não podem ser apagados pelo cliente.

### Multiempresa

Coleções de topo com `organizationId` em cada documento. A organização do usuário vem do
perfil em `/users/{uid}` lido pelas regras — nunca de um filtro enviado pelo cliente. Usuário
inativo ou sem perfil não lê nada. Motoristas não acessam o painel.

### Tempo real e custo de leitura

Um listener por coleção operacional (`OperationDataProvider`), compartilhado por todas as telas:
pedidos em aberto + movimentados em 30 dias, rotas ativas + 14 dias, ocorrências abertas + 30 dias,
motoristas e veículos. Paradas e histórico só são ouvidos na tela que os exibe; o trajeto do
motorista é lido uma vez. Cache persistente do Firestore (IndexedDB, várias abas).

### Comprovantes (imagem no banco)

`deliveryProofService` é o único ponto que sabe como o comprovante é armazenado. A foto passa por
`compressImage()` (valida JPEG/PNG/WEBP, até 15 MB de entrada, corrige rotação, redimensiona para
1280 px, comprime em WEBP/JPEG até ~450 KB em base64) e vai no campo `imageData` do documento
em `deliveryProofs`. As regras limitam o campo a 480 KB e aos três formatos. Listagens nunca leem
a imagem: o pedido guarda só um resumo (`proof`), e a foto é carregada ao abrir o comprovante.
Uma foto por entrega; administradores podem removê-la (com motivo no histórico).

### Localização

Aceita apenas com a rota `IN_PROGRESS`, do motorista da rota, com intervalo mínimo de 15 s.
O painel tem um botão **Simular posição** (somente em `npm run dev`) para demonstrar o
monitoramento até o app do motorista existir. Retenção prevista: apagar pontos com mais de
30 dias por rotina agendada (ainda não implementada).

### Mapa

As telas usam o contrato `components/map/MapView.tsx`. A implementação atual é Leaflet com tiles
configuráveis (`VITE_MAP_TILE_URL`, padrão OpenStreetMap — adequado para desenvolvimento e piloto;
para produção use um provedor de tiles com contrato). Trocar de provedor = novo arquivo que
implementa o contrato.

## Decisões e limitações do MVP

- **Número do pedido gerado** (`PED-0001`, contador transacional por organização) para garantir
  unicidade; o código do sistema do cliente vai em "Referência".
- **Sem geocodificação**: o ponto no mapa é marcado manualmente no cadastro do pedido
  (opcional; sem ponto, o pedido não aparece nos mapas).
- **Motorista e veículo livres** são checados antes da transação (consulta), não dentro dela —
  duas atribuições simultâneas do mesmo motorista em abas diferentes ainda são possíveis.
- **Execução pelo painel**: o operador registra chegada, entrega e falha em nome do motorista;
  o app do motorista usará os mesmos services. A localização do comprovante fica vazia quando
  registrado pelo painel (não há posição real do aparelho).
- Buscas e filtros são feitos em memória sobre a janela carregada (30 dias). Consulta de
  pedidos antigos exigirá busca paginada no servidor.
- Até 80 paradas por rota (mantém a transação longe do limite de 500 escritas).
- Bundle principal ~330 KB gzip, quase todo do SDK do Firebase; telas com mapa carregam sob demanda.
