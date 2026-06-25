const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REMOTE_USER = 'root';
const REMOTE_HOST = '212.85.21.157';
const REMOTE_DIR = '/opt/apps/crm';
const COMPOSE_FILE = 'docker-compose-vps.yaml';
const IMAGES_TAR = 'crm-images.tar.gz';

const SERVICES = [
    'crm-gateway',
    'crm-auth',
    'crm-crm',
    'crm-core',
    'crm-processor',
    'crm-bot-runtime',
    'crm-frontend',
    'evonexus-dashboard',
];

const DOCKER_desktop_PATH = 'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe';

function runCommand(command, args) {
    return new Promise((resolve, reject) => {
        console.log(`\n> ${command} ${args.join(' ')}`);
        const childProcess = spawn(command, args, {
            stdio: 'inherit',
            shell: true,
            env: { ...process.env, DOCKER_BUILDKIT: '0' },
        });
        childProcess.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Command failed with exit code ${code}`));
        });
        childProcess.on('error', (err) => reject(err));
    });
}

function runShell(command) {
    return new Promise((resolve, reject) => {
        console.log(`\n> ${command}`);
        const childProcess = spawn(command, {
            stdio: 'inherit',
            shell: true,
            env: { ...process.env, DOCKER_BUILDKIT: '0' },
        });
        childProcess.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Command failed with exit code ${code}`));
        });
        childProcess.on('error', (err) => reject(err));
    });
}

function getFreeDiskSpaceMB() {
    try {
        const output = execSync('wmic logicaldisk where "DeviceID=\'C:\'" get FreeSpace /value', {
            encoding: 'utf8',
            shell: true,
        });
        const match = output.match(/FreeSpace=(\d+)/);
        if (match) return Math.floor(parseInt(match[1], 10) / (1024 * 1024));
    } catch {}
    return null;
}

function isDockerRunning() {
    try {
        execSync('docker info', { stdio: 'ignore', shell: true });
        return true;
    } catch {
        return false;
    }
}

function startDockerDesktop() {
    console.log('\n Docker Desktop não está rodando. Iniciando...');
    spawn('cmd', ['/c', 'start', '', DOCKER_desktop_PATH], {
        stdio: 'ignore',
        detached: true,
    }).unref();
}

async function waitForDocker(maxWaitSeconds = 120) {
    console.log(`  Aguardando Docker Desktop inicializar (max ${maxWaitSeconds}s)...`);
    const start = Date.now();
    while (Date.now() - start < maxWaitSeconds * 1000) {
        if (isDockerRunning()) {
            console.log('  Docker Desktop pronto!');
            return;
        }
        process.stdout.write('.');
        await new Promise(r => setTimeout(r, 2000));
    }
    throw new Error('Docker Desktop não inicializou a tempo.');
}

async function ensureDocker() {
    if (isDockerRunning()) {
        console.log('  Docker já está rodando.');
        return;
    }
    startDockerDesktop();
    await waitForDocker();
}

async function main() {
    try {
        process.chdir(__dirname);

        if (!fs.existsSync(COMPOSE_FILE)) {
            throw new Error(`${COMPOSE_FILE} not found. Run from project root.`);
        }

        const envFile = fs.existsSync('.env.production') ? '.env.production' : '.env';
        console.log(`Using env: ${envFile}`);

        await ensureDocker();

        // Check free disk space before build
        const freeMB = getFreeDiskSpaceMB();
        if (freeMB !== null) {
            console.log(`\n  Free disk space: ${freeMB} MB`);
            if (freeMB < 5000) {
                console.warn('  WARNING: Less than 5 GB free. Deploy may fail due to insufficient space.');
                console.warn('  Consider running: docker system prune -a -f');
            }
        }

        console.log('\n==============================================');
        console.log('  CLEANING DOCKER CACHE');
        console.log('==============================================\n');

        await runCommand('docker', ['system', 'prune', '-f']);
        await runCommand('docker', ['builder', 'prune', '-f']);

        // Only build custom services (skip postgres, redis — they're pulled from Docker Hub)
        const buildServices = SERVICES.join(' ');

        console.log('\n==============================================');
        console.log('  BUILDING IMAGES LOCALLY');
        console.log('==============================================\n');

        // Build local images for the VPS compose file
        await runCommand('docker', [
            'compose', '-f', COMPOSE_FILE,
            '--env-file', envFile,
            'build', buildServices,
        ]);

        console.log('\n==============================================');
        console.log('  PRUNING BUILD CACHE');
        console.log('==============================================\n');
        await runCommand('docker', ['builder', 'prune', '-f']);

        const images = SERVICES.map(s => `${s}:latest`);
        console.log('\n==============================================');
        console.log('  EXPORTING IMAGES (compressed)');
        console.log('==============================================\n');

        // Export with gzip compression (saves ~50-60% disk space)
        const imageList = images.join(' ');
        await runShell(`docker save ${imageList} | gzip > ${IMAGES_TAR}`);

        const sizeMB = (fs.statSync(IMAGES_TAR).size / (1024 * 1024)).toFixed(2);
        console.log(`\n  Images exported: ${IMAGES_TAR} (${sizeMB} MB)`);

        console.log('\n==============================================');
        console.log('  REMOVING LOCAL IMAGES');
        console.log('==============================================\n');
        // Remove built images to free disk space
        await runCommand('docker', ['rmi', ...images]);
        await runCommand('docker', ['system', 'prune', '-f']);

        console.log('\n==============================================');
        console.log('  SENDING FILES TO VPS');
        console.log('==============================================\n');
        console.log('(Password will be requested multiple times)\n');

        await runCommand('ssh', [
            `${REMOTE_USER}@${REMOTE_HOST}`,
            `mkdir -p ${REMOTE_DIR}`,
        ]);

        // Send env file and compose file (needed for docker compose up)
        console.log('\n  Sending .env and compose file...');
        await runCommand('scp', [envFile, `${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/.env`]);
        await runCommand('scp', [COMPOSE_FILE, `${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/${COMPOSE_FILE}`]);

        // Send images tar
        console.log('  Sending images...');
        await runCommand('scp', [
            IMAGES_TAR,
            `${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/${IMAGES_TAR}`,
        ]);

        console.log('\n==============================================');
        console.log('  LOADING IMAGES ON VPS & RESTARTING');
        console.log('==============================================\n');
        console.log('(Password will be requested 1x)\n');

        await runCommand('ssh', [
            `${REMOTE_USER}@${REMOTE_HOST}`,
            `"cd ${REMOTE_DIR} && docker load -i ${IMAGES_TAR} && rm -f ${IMAGES_TAR} && docker compose -f ${COMPOSE_FILE} down --remove-orphans 2>/dev/null || true && docker compose -f ${COMPOSE_FILE} up -d --force-recreate && sleep 10 && docker compose -f ${COMPOSE_FILE} ps && docker compose -f ${COMPOSE_FILE} logs --tail 15"`,
        ]);

        // Cleanup local tar
        console.log('\nCleaning up local images tar...');
        try { fs.unlinkSync(IMAGES_TAR); } catch (_) {}

        console.log('\n=== Deploy complete! ===');

    } catch (err) {
        console.error('\nError:', err.message);
        try { fs.unlinkSync(IMAGES_TAR); } catch (_) {}
        process.exit(1);
    }
}

main();
