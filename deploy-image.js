const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configurações
const REMOTE_USER = 'root';
const REMOTE_HOST = '212.85.21.157';
const REMOTE_DIR = '/opt/apps/crm';
const COMPOSE_FILE = 'docker-compose-vps.yaml';
const ENV_FILE = '.env.production';
const BUNDLE_FILE = 'crm-sources.tar.gz';
const DEPLOY_SCRIPT = 'deploy-remote.sh';

// Diretórios de código fonte
const SOURCE_DIRS = [
    'nginx',
    'evo-auth-service-community',
    'evo-ai-crm-community',
    'evo-ai-core-service-community',
    'evo-ai-processor-community',
    'evo-bot-runtime',
    'evo-ai-frontend-community',
    'evo-nexus',
];

// Padrões excluídos do tar
const EXCLUDE_PATTERNS = [
    'node_modules',
    '.git',
    'tmp',
    'log',
    'vendor/bundle',
    'vendor/cache',
    'coverage',
    '.bundle',
    '.cache',
    '*.sqlite3',
    '*.tar',
    '*.tar.gz',
];

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

        console.log('=== Deploy da Aplicação na VPS (build remoto) ===\n');

        // Verificar pré-requisitos
        if (!fs.existsSync(COMPOSE_FILE)) {
            throw new Error(`Arquivo ${COMPOSE_FILE} não encontrado. Execute na raiz do projeto.`);
        }
        if (!fs.existsSync(ENV_FILE)) {
            throw new Error(`Arquivo ${ENV_FILE} não encontrado. Configure as variáveis de produção.`);
        }
        for (const dir of SOURCE_DIRS) {
            if (!fs.existsSync(dir)) {
                throw new Error(`Diretório não encontrado: ${dir}`);
            }
        }

        // 1. Criar script remoto que faz tudo (extrair → build → deploy)
        console.log('[1/3] Criando script de deploy remoto...');
        const remoteScript = `#!/bin/bash
set -e
cd ${REMOTE_DIR}

echo "=============================================="
echo "  EXTRAINDO FONTES"
echo "=============================================="
echo "Removendo fontes anteriores..."
for dir in ${SOURCE_DIRS.join(' ')}; do rm -rf "\$dir" 2>/dev/null || true; done
echo "Extraindo pacote..."
tar -xzf ${BUNDLE_FILE}

echo "Copiando .env.production para .env (Docker Compose auto-lê .env)..."
cp ${ENV_FILE} .env

echo ""
echo "=============================================="
echo "=============================================="
echo "  BUILDANDO IMAGENS DOCKER"
echo "=============================================="
docker compose -f ${COMPOSE_FILE} build

echo ""
echo "=============================================="
echo "  PARANDO CONTAINERS ANTIGOS"
echo "=============================================="
docker compose -f ${COMPOSE_FILE} down --remove-orphans 2>/dev/null || true

echo ""
echo "=============================================="
echo "  INICIANDO NOVOS CONTAINERS"
echo "=============================================="
docker compose -f ${COMPOSE_FILE} up -d --force-recreate

echo ""
echo "Aguardando serviços iniciarem..."
sleep 10

echo ""
echo "=============================================="
echo "  STATUS DOS CONTAINERS"
echo "=============================================="
docker compose -f ${COMPOSE_FILE} ps

echo ""
echo "=============================================="
echo "  ÚLTIMOS LOGS"
echo "=============================================="
docker compose -f ${COMPOSE_FILE} logs --tail 15

echo ""
echo "=============================================="
echo "  DEPLOY CONCLUÍDO!"
echo "=============================================="
echo "  Frontend:    http://${REMOTE_HOST}:5173"
echo "  API Gateway: http://${REMOTE_HOST}:3030"
echo ""
echo "Para logs em tempo real:"
echo "  docker compose -f ${COMPOSE_FILE} logs -f"
`;

        fs.writeFileSync(DEPLOY_SCRIPT, remoteScript);
        console.log(`  ✓ Script criado: ${DEPLOY_SCRIPT}`);

        // 2. Empacotar tudo (fontes + compose + env + script)
        console.log('\n[2/3] Empacotando fontes e enviando para a VPS...');

        const excludeArgs = [];
        for (const pattern of EXCLUDE_PATTERNS) {
            excludeArgs.push('--exclude', pattern);
        }

        await runCommand('tar', [
            '-czf', BUNDLE_FILE,
            ...excludeArgs,
            COMPOSE_FILE, ENV_FILE, DEPLOY_SCRIPT,
            ...SOURCE_DIRS
        ]);

        const sizeMB = (fs.statSync(BUNDLE_FILE).size / (1024 * 1024)).toFixed(2);
        console.log(`  ✓ Pacote: ${BUNDLE_FILE} (${sizeMB} MB)`);

        console.log('\n  Enviando para a VPS (será pedida a senha 2x)...');
        await runCommand('ssh', [`${REMOTE_USER}@${REMOTE_HOST}`, `mkdir -p ${REMOTE_DIR}`]);
        await runCommand('scp', [BUNDLE_FILE, `${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/${BUNDLE_FILE}`]);
        console.log('  ✓ Pacote enviado.');

        // 3. Executar script remoto (única conexão SSH)
        console.log('\n[3/3] Executando deploy na VPS (senha 1x)...');
        await runCommand('ssh', [
            `${REMOTE_USER}@${REMOTE_HOST}`,
            `"cd ${REMOTE_DIR} && tar -xzf ${BUNDLE_FILE} ${DEPLOY_SCRIPT} && bash ${DEPLOY_SCRIPT}"`
        ]);

        // Limpeza local
        console.log('\nLimpando arquivos temporários...');
        try { fs.unlinkSync(BUNDLE_FILE); } catch (_) {}
        try { fs.unlinkSync(DEPLOY_SCRIPT); } catch (_) {}

        console.log('\n=== Deploy concluído! ===');

    } catch (err) {
        console.error('\nErro:', err.message);
        try { fs.unlinkSync(BUNDLE_FILE); } catch (_) {}
        try { fs.unlinkSync(DEPLOY_SCRIPT); } catch (_) {}
        process.exit(1);
    }
}

main();
