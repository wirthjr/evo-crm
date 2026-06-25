# Arco CRM — Guia de Configuração e Deploy

## 1. Estrutura do Projeto

```
evo-crm/
├── .env                          # Desenvolvimento local (localhost)
├── .env.production               # Produção (VPS) — enviado como .env
├── docker-compose.yml            # Dev local (build + run)
├── docker-compose-vps.yaml       # Produção VPS (build + run)
├── deploy-db.js                  # Deploy infraestrutura (postgres + redis)
├── deploy-image.js               # Deploy aplicação (fontes → build → up)
├── nginx/                        # API Gateway (Nginx)
├── evo-auth-service-community/   # Auth Service (Rails)
├── evo-ai-crm-community/         # CRM Service (Rails)
├── evo-ai-core-service-community/# Core Service (Go)
├── evo-ai-processor-community/   # Processor Service (Python/FastAPI)
├── evo-bot-runtime/              # Bot Runtime (Go)
└── evo-ai-frontend-community/    # Frontend (React/Vite/Nginx)
```

---

## 2. Serviços e Portas

| Serviço | Porta Interna | Porta Exposta | Descrição |
|---|---|---|---|
| `crm-postgres` | 5432 | — | PostgreSQL + pgvector |
| `crm-redis` | 6379 | — | Redis |
| `crm-gateway` | 3030 | **3030** | API Gateway (Nginx) — unifica todas as APIs |
| `crm-auth` | 3001 | — | Auth Service (Rails) |
| `crm-auth-sidekiq` | — | — | Background jobs do Auth |
| `crm-crm` | 3000 | — | CRM Service (Rails) |
| `crm-crm-sidekiq` | — | — | Background jobs do CRM |
| `crm-core` | 5555 | — | Core Service (Go) |
| `crm-processor` | 8000 | — | Processor Service (Python) |
| `crm-bot-runtime` | 8080 | — | Bot Runtime (Go) |
| `crm-frontend` | 80 | **5173** | Frontend (React/Nginx) |

> Apenas **gateway (3030)** e **frontend (5173)** são expostos. Os demais comunicam-se via rede interna `crm-net`.

---

## 3. Desenvolvimento Local

### 3.1 Pré-requisitos

- Docker Desktop (Windows/Mac) ou Docker Engine (Linux)
- Node.js (para rodar os scripts de deploy)
- Git (para clonar o repositório com submódulos)

### 3.2 Configurar `.env`

```bash
cp .env.example .env
```

Edite o `.env` com valores de desenvolvimento (localhost):

```ini
# URLs
BACKEND_URL=http://localhost:3000
FRONTEND_URL=http://localhost:5173
AUTH_SERVICE_URL=http://localhost:3001
CORS_ORIGINS=http://localhost:3000,http://localhost:5173,http://127.0.0.1:5173

# Ambiente
RAILS_ENV=development

# Banco (senha padrão)
POSTGRES_PASSWORD=apppass
REDIS_PASSWORD=evoai_redis_pass

# Frontend (build-time)
VITE_APP_ENV=development
VITE_API_URL=http://localhost:3000
VITE_AUTH_API_URL=http://localhost:3001
VITE_EVOAI_API_URL=http://localhost:5555
VITE_AGENT_PROCESSOR_URL=http://localhost:8000
VITE_WS_URL=http://localhost:3000

# SMTP (MailHog em dev — emails capturados)
SMTP_ADDRESS=mailhog
SMTP_PORT=1025
SMTP_AUTHENTICATION=plain
SMTP_ENABLE_STARTTLS_AUTO=false
```

> Segredos (`SECRET_KEY_BASE`, `JWT_SECRET_KEY`, etc.) podem manter os defaults em dev.

### 3.3 Iniciar

```bash
docker compose build
docker compose up -d
```

**Endpoints:**
| Serviço | URL |
|---|---|
| Frontend | http://localhost:5173 |
| CRM API | http://localhost:3000 |
| Auth API | http://localhost:3001 |
| Core API | http://localhost:5555 |
| Processor | http://localhost:8000 |
| Bot Runtime | http://localhost:8080 |
| MailHog | http://localhost:8025 |

### 3.4 Primeiro acesso

1. Acesse http://localhost:5173/setup
2. Crie o usuário administrador
3. Pronto — a aplicação está disponível

---

## 4. Produção (VPS)

### 4.1 Pré-requisitos na VPS

```bash
# Instalar Docker
curl -fsSL https://get.docker.com | bash

# Verificar
docker --version          # ≥ 29
docker compose version    # v2 plugin
```

### 4.2 Domínios (Cloudflare)

Crie 2 registros DNS tipo **A** apontando para o IP da VPS:

| Nome | Tipo | IP |
|---|---|---|
| `crm-api.arcotech.api.br` | A | IP da VPS |
| `crm.arcotech.api.br` | A | IP da VPS |

### 4.3 cPanel — Proxy Reverso

No cPanel, crie 2 **Reverse Proxy**:

| Domínio | Destino |
|---|---|
| `crm-api.arcotech.api.br` | `http://127.0.0.1:3030` |
| `crm.arcotech.api.br` | `http://127.0.0.1:5173` |

### 4.4 Configurar `.env.production`

```bash
cp .env.production.example .env.production
```

Preencha com valores reais:

```ini
# Domínios
BACKEND_URL=https://crm-api.arcotech.api.br
FRONTEND_URL=https://crm.arcotech.api.br
AUTH_SERVICE_URL=https://crm-api.arcotech.api.br
CORS_ORIGINS=https://crm.arcotech.api.br,https://crm-api.arcotech.api.br

# Banco — use senhas fortes
POSTGRES_PASSWORD=<senha-forte>
REDIS_PASSWORD=<senha-forte>
# REDIS_URL deve usar a mesma senha
REDIS_URL=redis://:<senha-forte>@crm-redis:6379

# Ambiente
RAILS_ENV=production

# Segredos — gere uma vez e use os mesmos em todos os deploys
SECRET_KEY_BASE=<openssl rand -hex 64>
JWT_SECRET_KEY=<openssl rand -hex 64>
ENCRYPTION_KEY=<Fernet.generate_key()>
EVOAI_CRM_API_TOKEN=<openssl rand -hex 32>
BOT_RUNTIME_SECRET=<openssl rand -hex 32>
DOORKEEPER_JWT_SECRET_KEY=<openssl rand -hex 64>

# SMTP real
SMTP_ADDRESS=smtp.seuprovedor.com
SMTP_PORT=587
SMTP_DOMAIN=seudominio.com.br
MAILER_SENDER_EMAIL=noreply@seudominio.com.br
SMTP_AUTHENTICATION=plain
SMTP_ENABLE_STARTTLS_AUTO=true
SMTP_USERNAME=seu-usuario
SMTP_PASSWORD=sua-senha

# Frontend (todas APIs via gateway)
VITE_APP_ENV=production
VITE_API_URL=https://crm-api.arcotech.api.br
VITE_AUTH_API_URL=https://crm-api.arcotech.api.br
VITE_EVOAI_API_URL=https://crm-api.arcotech.api.br
VITE_AGENT_PROCESSOR_URL=https://crm-api.arcotech.api.br
VITE_WS_URL=https://crm-api.arcotech.api.br
```

> **IMPORTANTE:** As VITE_* são build-time. Após alterar, é necessário rebuild do frontend.

### 4.5 Deploy

```bash
# Deploy completo (banco + aplicação)
npm run deploy:all

# Ou separado:
npm run deploy-db     # Infraestrutura (postgres + redis)
npm run deploy        # Aplicação (fontes → build → containers)
```

**O que acontece em cada deploy:**

| Script | Ações |
|---|---|
| `deploy-db.js` | 1. SCP envia `docker-compose-vps.yaml` + `.env.production` (como `.env`) + script<br>2. SSH executa: pull imagens públicas → `docker compose up -d crm-postgres crm-redis` |
| `deploy-image.js` | 1. Empacota fontes (~68 MB tar.gz) excluindo `node_modules`, `.git`<br>2. SCP envia para `/opt/apps/crm/`<br>3. SSH executa: extrai → `docker compose build --no-cache` → `docker compose down` → `docker compose up -d --force-recreate` → `ps` + `logs` |

---

## 5. Comandos Úteis na VPS

```bash
# SSH na VPS
ssh root@<IP>

# Ver status dos containers
cd /opt/apps/crm
docker compose -f docker-compose-vps.yaml ps

# Ver logs
docker compose -f docker-compose-vps.yaml logs -f
docker compose -f docker-compose-vps.yaml logs <servico> --tail 50

# Reiniciar tudo
docker compose -f docker-compose-vps.yaml down
docker compose -f docker-compose-vps.yaml up -d --force-recreate

# Reiniciar um serviço específico
docker compose -f docker-compose-vps.yaml up -d --force-recreate <servico>

# Ver consumo de recursos
docker stats
```

---

## 6. Troubleshooting

### CORS bloqueado no navegador

1. Verifique se `CORS_ORIGINS` inclui o domínio do frontend
2. Verifique se `VITE_*_URL` batem com os domínios configurados
3. Rebuild do frontend necessário após alterar VITE_*

### Erro `WRONGPASS` no Redis/Sidekiq

1. `REDIS_PASSWORD` no `.env` deve ser igual em `REDIS_URL` e no comando do Redis
2. No docker-compose-vps.yaml, o Redis usa `env_file: .env.production`
3. Faça `docker compose down -v && docker compose up -d` para recriar volumes

### Frontend não carrega / 503

```bash
docker compose logs crm-frontend --tail 20
docker compose logs crm-gateway --tail 20
```

Verifique se o `VITE_API_URL` está correto no `.env.production`.

### Processor com erro `sslmode`

O `POSTGRES_CONNECTION_STRING` **não** deve conter `?sslmode=disable` (incompatível com asyncpg).

### Conexão SSH pede senha várias vezes

Configure chave SSH para evitar prompts:
```bash
ssh-copy-id root@<IP>
```

---

## 7. Rede Interna (crm-net)

Todos os containers comunicam-se via rede bridge `crm-net` (criada automaticamente pelo Docker Compose).

```
┌─────────────────────────────────────────────────┐
│  crm-net (bridge)                                │
│                                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ postgres │  │  redis   │  │   auth   │       │
│  │  :5432   │  │  :6379   │  │  :3001   │       │
│  └──────────┘  └──────────┘  └──────────┘       │
│                                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │   crm    │  │   core   │  │processor │       │
│  │  :3000   │  │  :5555   │  │  :8000   │       │
│  └──────────┘  └──────────┘  └──────────┘       │
│                                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │bot-runtime│ │ frontend  │  │ gateway  │       │
│  │  :8080   │  │   :80    │  │  :3030   │───▶ exposta :3030
│  └──────────┘  └──────────┘  └──────────┘       │
│                      │                            │
└──────────────────────┼────────────────────────────┘
                       │ exposta :5173
                       
   Internet ──▶ nginx cPanel ──▶ gateway:3030 (API)
              ──▶ nginx cPanel ──▶ frontend:5173
```
