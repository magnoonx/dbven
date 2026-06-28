require('dotenv').config();
const { Client } = require('pg');

const connectionString = process.env.DATABASE_URL;
const defaultConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 5000
};

if (!connectionString && !process.env.DB_USER) {
    console.error("❌ No se encontró una configuración de conexión válida en el archivo .env.");
    process.exit(1);
}

console.log('=== Iniciando Prueba de Conexión ===');
if (connectionString) {
    console.log(`Intentando conectar usando DATABASE_URL.`);
} else {
    console.log(`Intentando conectar a: ${defaultConfig.host} en el puerto ${defaultConfig.port}`);
    console.log(`Base de datos objetivo: ${defaultConfig.database}`);
}

const client = new Client(connectionString ? {
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000
} : defaultConfig);

client.connect()
    .then(async () => {
        console.log("\n✅ ¡CONEXIÓN EXITOSA CON EL SERVIDOR INTERNO!");

        // Ejecutamos una consulta básica de credenciales para comprobar autenticación
        const res = await client.query('SELECT current_user, current_database(), version();');
        console.log("\n--- Datos de Validación de PostgreSQL ---");
        console.log(`👤 Usuario Autenticado: ${res.rows[0].current_user}`);
        console.log(`🗄️ Base de Datos Activa: ${res.rows[0].current_database}`);
        console.log(`💻 Versión del Motor:   ${res.rows[0].version.split(',')[0]}`);

        await client.end();
        console.log("\n=======================================");
    })
    .catch(err => {
        console.log("\n❌ LA CONEXIÓN HA FALLADO");
        console.log("---------------------------------------");
        console.log(`Código de error de red: ${err.code}`);
        console.log(`Mensaje del sistema:    ${err.message}`);
        console.log("---------------------------------------");

        // Diagnóstico rápido según el código de error
        if (err.code === 'ETIMEDOUT') {
            console.log("💡 DIAGNÓSTICO: Es un problema de RED o FIREWALL. El servidor remoto no responde.");
            console.log("Tu contraseña podría estar bien, pero el puerto 5432 está bloqueado para tu IP externa,");
            console.log("o el VPS no tiene habilitadas las conexiones entrantes en el archivo 'pg_hba.conf'.");
        } else if (err.code === '28P01' || err.message.includes('password authentication failed')) {
            console.log("💡 DIAGNÓSTICO: ¡Problema de CREDENCIALES! Lograste llegar al servidor, pero");
            console.log("el usuario 'postgres' rechazó la contraseña provista en el archivo .env.");
        } else if (err.code === '3D000') {
            console.log("💡 DIAGNÓSTICO: Credenciales correctas, pero la base de datos 'db_ven' no existe.");
        }
        console.log("=======================================");
        process.exit(1);
    });