const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configurações
const REMOTE_USER = 'root';
const REMOTE_HOST = '212.85.21.157';
const REMOTE_DIR = '/opt/apps/crm';
const COMPOSE_FILE = 'docker-compose-vps.yaml';
const ENV_FILE = '.env.production';
const DEPLOY_SCRIPT = 'deploy-db-remote.sh';

// Função auxiliar
function runCommand(command, args) {
    return new Promise((resolve, reject) => {
        console.log(`\n> ${command} ${args.join(' ')}`);

        const childProcess = spawn(command, args, {
            stdio: 'inherit',
            shell: true
        });

        childProcess.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Comando falhou com código ${code}`));
        });

        childProcess.on('error', (err) => reject(err));
    });
}

async function main() {
    try {
        process.chdir(__dirname);

        console.log('=== Deploy Infraestrutura (PostgreSQL + Redis) na VPS ===\n');

        if (!fs.existsSync(ENV_FILE)) {
            throw new Error(`Arquivo ${ENV_FILE} não encontrado. Configure as variáveis de produção.`);
        }
        if (!fs.existsSync(COMPOSE_FILE)) {
            throw new Error(`Arquivo ${COMPOSE_FILE} não encontrado. Execute na raiz do projeto.`);
        }

        // 1. Criar script remoto
        console.log('[1/2] Preparando arquivos...');
        const remoteScript = `#!/bin/bash
set -e
cd ${REMOTE_DIR}

echo "Copiando .env.production para .env..."
cp ${ENV_FILE} .env

echo "Arquivos recebidos:"
ls -la ${COMPOSE_FILE} ${ENV_FILE}

echo ""
echo "Baixando imagens (pgvector + redis)..."
docker pull pgvector/pgvector:pg16
docker pull redis:alpine

echo ""
echo "Parando containers antigos..."
docker compose -f ${COMPOSE_FILE} down --remove-orphans 2>/dev/null || true

echo ""
echo "Iniciando postgres e redis..."
docker compose -f ${COMPOSE_FILE} up -d crm-postgres crm-redis

echo ""
echo "Aguardando postgres..."
for i in $(seq 1 20); do
  if docker compose -f ${COMPOSE_FILE} exec -T crm-postgres pg_isready -U postgres 2>/dev/null; then
    echo "  Postgres OK!"
    break
  fi
  sleep 3
done

echo ""
echo "Aguardando redis..."
for i in $(seq 1 15); do
  if docker compose -f ${COMPOSE_FILE} exec -T crm-redis redis-cli ping 2>/dev/null | grep -q PONG; then
    echo "  Redis OK!"
    break
  fi
  sleep 2
done

echo ""
echo "=== Banco pronto! ==="
docker compose -f ${COMPOSE_FILE} ps
`;
        fs.writeFileSync(DEPLOY_SCRIPT, remoteScript);

        // 2. Enviar arquivos e executar
        console.log('\n[2/2] Enviando arquivos e executando na VPS...');

        console.log('\n  Enviando compose + env (senha 1x)...');
        const remoteTarget = `${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/`;
        await runCommand('ssh', [`${REMOTE_USER}@${REMOTE_HOST}`, `mkdir -p ${REMOTE_DIR}`]);
        await runCommand('scp', [COMPOSE_FILE, DEPLOY_SCRIPT, remoteTarget]);
        await runCommand('scp', [ENV_FILE, `${remoteTarget}.env`]);

        console.log('\n  Executando deploy na VPS (senha 1x)...');
        await runCommand('ssh', [
            `${REMOTE_USER}@${REMOTE_HOST}`,
            `"cd ${REMOTE_DIR} && bash ${DEPLOY_SCRIPT}"`
        ]);

        // Limpeza
        try { fs.unlinkSync(DEPLOY_SCRIPT); } catch (_) {}

        console.log('\n=== Infraestrutura implantada com sucesso! ===');
        console.log('Agora execute: npm run deploy');

    } catch (err) {
        console.error('\nErro:', err.message);
        try { fs.unlinkSync(DEPLOY_SCRIPT); } catch (_) {}
        process.exit(1);
    }
}

main();
