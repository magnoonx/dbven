/**
 * deploy.js — Script de despliegue SFTP
 * Lee la configuración de .antigravity/sftp.json y sube los archivos al servidor.
 * Uso: node deploy.js
 */

const fs   = require('fs');
const path = require('path');
const Client = require('ssh2').Client;

// ─── Configuración ────────────────────────────────────────────────────────────
const CONFIG_PATH = path.join(__dirname, '.antigravity', 'sftp.json');
const config      = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

// Archivos/carpetas a ignorar (patrones simples)
const IGNORE_LIST = [
    'node_modules',
    '.git',
    '.antigravity',
    'deploy.js',
    '.env',
    '.DS_Store',
    'Thumbs.db',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function shouldIgnore(name) {
    return IGNORE_LIST.some(p => name === p || name.startsWith(p));
}

function collectFiles(dir, base = '') {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files   = [];
    for (const entry of entries) {
        if (shouldIgnore(entry.name)) continue;
        const localPath  = path.join(dir, entry.name);
        const remotePath = base ? `${base}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
            files.push(...collectFiles(localPath, remotePath));
        } else {
            files.push({ local: localPath, remote: remotePath });
        }
    }
    return files;
}

// ─── Upload ───────────────────────────────────────────────────────────────────
async function ensureRemoteDir(sftp, remoteDir) {
    return new Promise((resolve, reject) => {
        sftp.mkdir(remoteDir, err => {
            // Ignorar error si el directorio ya existe (código 4)
            if (err && err.code !== 4) return reject(err);
            resolve();
        });
    });
}

async function uploadFile(sftp, localPath, remotePath) {
    return new Promise((resolve, reject) => {
        sftp.fastPut(localPath, remotePath, err => {
            if (err) return reject(err);
            resolve();
        });
    });
}

async function deploy(sftp) {
    const rootRemote = config.remotePath;
    const files      = collectFiles(__dirname);

    console.log(`\n📦 Archivos encontrados: ${files.length}`);
    console.log(`🎯 Destino: ${config.username}@${config.host}:${rootRemote}\n`);

    // Crear directorios remotos necesarios
    const dirs = new Set(
        files.map(f => path.dirname(`${rootRemote}/${f.remote}`).replace(/\\/g, '/'))
    );
    for (const dir of [...dirs].sort()) {
        try {
            await ensureRemoteDir(sftp, dir);
        } catch (e) { /* ya existe */ }
    }

    // Subir archivos
    let ok = 0, fail = 0;
    for (const { local, remote } of files) {
        const dest = `${rootRemote}/${remote}`.replace(/\\/g, '/');
        try {
            await uploadFile(sftp, local, dest);
            console.log(`  ✅ ${remote}`);
            ok++;
        } catch (err) {
            console.error(`  ❌ ${remote} — ${err.message}`);
            fail++;
        }
    }

    console.log(`\n─────────────────────────────────`);
    console.log(`✅ Subidos:  ${ok}`);
    if (fail) console.log(`❌ Fallidos: ${fail}`);
    console.log(`─────────────────────────────────\n`);
}

// ─── Conexión ─────────────────────────────────────────────────────────────────
const conn = new Client();

conn.on('ready', () => {
    console.log('🔗 Conexión SFTP establecida');
    conn.sftp((err, sftp) => {
        if (err) { console.error('Error abriendo SFTP:', err); conn.end(); return; }

        deploy(sftp)
            .then(() => { console.log('🚀 Despliegue completado!'); conn.end(); })
            .catch(err => { console.error('Error durante el deploy:', err); conn.end(); });
    });
}).on('error', err => {
    console.error('❌ Error de conexión:', err.message);
    console.error('   Verifica: host, puerto, usuario y contraseña en .antigravity/sftp.json');
}).connect({
    host:     config.host,
    port:     config.port || 22,
    username: config.username,
    password: config.password,
});
