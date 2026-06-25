const { spawn } = require('child_process');
const fs = require('fs');

const REMOTE_USER = 'root';
const REMOTE_HOST = '212.85.21.157';
const REMOTE_DIR = '/opt/apps/crm';
const COMPOSE_FILE = 'docker-compose-vps.yaml';
const ENV_FILE = '.env.production';
const BUNDLE_FILE = 'nexus-sources.tar.gz';
const DEPLOY_SCRIPT = 'deploy-nexus-remote.sh';
const SERVICE_NAME = 'evonexus-dashboard';
const SOURCE_DIRS = ['evo-nexus'];

const EXCLUDE_PATTERNS = [
    'node_modules',
    '.git',
    'tmp',
    'log',
    '.cache',
    '*.sqlite3',
    '*.tar',
    '*.tar.gz',
];

function runCommand(command, args) {
    return new Promise((resolve, reject) => {
        console.log(`\n> ${command} ${args.join(' ')}`);

        const childProcess = spawn(command, args, {
            stdio: 'inherit',
            shell: true,
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

        console.log('=== Deploy do EvoNexus na VPS ===\n');

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

        console.log('[1/3] Criando script de deploy remoto...');
        const remoteScript = `#!/bin/bash
set -e
cd ${REMOTE_DIR}

echo "=============================================="
echo "  EXTRAINDO FONTES DO EVONEXUS"
echo "=============================================="
echo "Removendo fontes anteriores..."
rm -rf evo-nexus 2>/dev/null || true
echo "Extraindo pacote..."
tar -xzf ${BUNDLE_FILE}

echo "Copiando .env.production para .env (Docker Compose auto-lê .env)..."
cp ${ENV_FILE} .env

echo ""
echo "=============================================="
echo "  BUILDANDO IMAGEM DO EVONEXUS"
echo "=============================================="
docker compose -f ${COMPOSE_FILE} build ${SERVICE_NAME}

echo ""
echo "=============================================="
echo "  RECRIANDO CONTAINER DO EVONEXUS"
echo "=============================================="
docker compose -f ${COMPOSE_FILE} up -d --no-deps --force-recreate ${SERVICE_NAME}

echo ""
echo "Aguardando serviço iniciar..."
sleep 10

echo ""
echo "=============================================="
echo "  STATUS DO EVONEXUS"
echo "=============================================="
docker compose -f ${COMPOSE_FILE} ps ${SERVICE_NAME}

echo ""
echo "=============================================="
echo "  ÚLTIMOS LOGS DO EVONEXUS"
echo "=============================================="
docker compose -f ${COMPOSE_FILE} logs --tail 30 ${SERVICE_NAME}
`;

        fs.writeFileSync(DEPLOY_SCRIPT, remoteScript);
        console.log(`  ✓ Script criado: ${DEPLOY_SCRIPT}`);

        console.log('\n[2/3] Empacotando fontes e enviando para a VPS...');
        const excludeArgs = [];
        for (const pattern of EXCLUDE_PATTERNS) {
            excludeArgs.push('--exclude', pattern);
        }

        await runCommand('tar', [
            '-czf', BUNDLE_FILE,
            ...excludeArgs,
            COMPOSE_FILE, ENV_FILE, DEPLOY_SCRIPT,
            ...SOURCE_DIRS,
        ]);

        const sizeMB = (fs.statSync(BUNDLE_FILE).size / (1024 * 1024)).toFixed(2);
        console.log(`  ✓ Pacote: ${BUNDLE_FILE} (${sizeMB} MB)`);

        console.log('\n  Enviando para a VPS (será pedida a senha 2x)...');
        await runCommand('ssh', [`${REMOTE_USER}@${REMOTE_HOST}`, `mkdir -p ${REMOTE_DIR}`]);
        await runCommand('scp', [BUNDLE_FILE, `${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/${BUNDLE_FILE}`]);
        console.log('  ✓ Pacote enviado.');

        console.log('\n[3/3] Executando deploy do EvoNexus na VPS (senha 1x)...');
        await runCommand('ssh', [
            `${REMOTE_USER}@${REMOTE_HOST}`,
            `"cd ${REMOTE_DIR} && tar -xzf ${BUNDLE_FILE} ${DEPLOY_SCRIPT} && bash ${DEPLOY_SCRIPT}"`
        ]);

        console.log('\nLimpando arquivos temporários...');
        try { fs.unlinkSync(BUNDLE_FILE); } catch (_) {}
        try { fs.unlinkSync(DEPLOY_SCRIPT); } catch (_) {}

        console.log('\n=== Deploy do EvoNexus concluído! ===');
    } catch (err) {
        console.error('\nErro:', err.message);
        try { fs.unlinkSync(BUNDLE_FILE); } catch (_) {}
        try { fs.unlinkSync(DEPLOY_SCRIPT); } catch (_) {}
        process.exit(1);
    }
}

main();
