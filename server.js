require('dotenv').config();
const path    = require('path');
const express = require('express');
const cors    = require('cors');
const net     = require('net');
const { Client } = require('ssh2');
const { Pool }   = require('pg');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // Servir el index.html

let pool;

// 🚨 DETECTAR SI ESTAMOS EN EL VPS O EN LOCAL
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

if (IS_PRODUCTION) {
    console.log('🚀 Entorno de PRODUCCIÓN detectado. Conectando directo a PostgreSQL...');

    // En el VPS la conexión es directa a localhost
    pool = new Pool({
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        host: '127.0.0.1',
        port: parseInt(process.env.DB_PORT || 5432),
        max: 20,
        idleTimeoutMillis: 30000,
        ssl: false
    });

    // Validar conexión inmediata
    pool.query('SELECT NOW()', (err) => {
        if (err) console.error('❌ Error directo en Postgres (Prod):', err.message);
        else console.log('✅ Conectado a la BD "db_ven" en producción.');
    });

    // Arrancar Express directamente (escucha en TODAS las interfaces)
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Servidor en producción activo en http://0.0.0.0:${PORT}`));

} else {
    // 🔐 ENTORNO LOCAL (Mantiene tu lógica de túnel SSH2 intacta)
    console.log('🔐 Entorno LOCAL detectado. Iniciando emulación de túnel SSH...');
    const sshClient = new Client();
    const LOCAL_PORT = 54335;

    const localServer = net.createServer((localSocket) => {
        sshClient.forwardOut('127.0.0.1', LOCAL_PORT, '127.0.0.1', parseInt(process.env.DB_PORT || 5432), (err, stream) => {
            if (err) return localSocket.end();
            localSocket.pipe(stream).pipe(localSocket);
        });
    });

    sshClient.on('ready', () => {
        localServer.listen(LOCAL_PORT, '127.0.0.1', () => {
            pool = new Pool({
                user: process.env.DB_USER,
                password: process.env.DB_PASSWORD,
                database: process.env.DB_NAME,
                host: '127.0.0.1',
                port: LOCAL_PORT,
                max: 20,
                idleTimeoutMillis: 30000,
                ssl: false
            });

            pool.query('SELECT NOW()', (err) => {
                if (err) {
                    console.error('❌ Error en Postgres a través del túnel SSH (Local):', err.message);
                } else {
                    console.log('✅ Conectado a la BD "db_ven" a través del túnel SSH.');
                }
            });

            const PORT = process.env.PORT || 3000;
            app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Servidor local activo en http://0.0.0.0:${PORT} (accesible en la red local)`));
        });
    });

    sshClient.on('error', (err) => {
        console.error('⚠️  Error en túnel SSH (el servidor HTTP sigue activo):', err.message);
    });

    sshClient.on('close', () => {
        console.warn('⚠️  Conexión SSH cerrada. La BD no estará disponible hasta reconectar.');
    });

    sshClient.connect({
        host: process.env.SSH_HOST,
        port: parseInt(process.env.SSH_PORT || 22),
        username: process.env.SSH_USER,
        password: process.env.SSH_PASSWORD
    });
}
// =======================================================================
// MIDDLEWARE DE DIAGNÓSTICO (muestra cada petición en consola)
// =======================================================================
app.use((req, res, next) => {
    console.log(`📡 [${new Date().toISOString()}] ${req.method} ${req.path}  ← desde ${req.ip}`);
    next();
});

// =======================================================================
// ENDPOINTS DE LA API
// =======================================================================

app.get('/api/reportes', async (req, res) => {
    if (!pool) return res.status(503).json({ error: 'Servicio temporalmente no disponible.' });
    const sql = `
        SELECT r.*, 
               COALESCE(json_agg(i.*) FILTER (WHERE i.id IS NOT NULL), '[]') as insumos
        FROM reportes r
        LEFT JOIN inventario_insumos i ON r.id = i.reporte_id
        GROUP BY r.id
        ORDER BY r.reportado_en_cliente DESC;
    `;
    try {
        const { rows } = await pool.query(sql);
        res.status(200).json(rows);
    } catch (err) {
        console.error('❌ Error en GET /api/reportes:', err.message);
        res.status(500).json({ error: 'Error al consultar el mapa de contingencia.' });
    }
});

app.post('/api/reportes', async (req, res) => {
    if (!pool) return res.status(503).json({ error: 'Servicio temporalmente no disponible.' });
    const { id, categoria, nombre_lugar, descripcion, latitud, longitud, reportado_en_cliente, insumos } = req.body;

    if (!id || !categoria || !nombre_lugar || !latitud || !longitud || !reportado_en_cliente) {
        return res.status(400).json({ error: 'Faltan parámetros críticos obligatorios.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const insPoint = `
            INSERT INTO reportes (id, categoria, nombre_lugar, descripcion, latitud, longitud, reportado_en_cliente)
            VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING;
        `;
        await client.query(insPoint, [id, categoria, nombre_lugar, descripcion, latitud, longitud, reportado_en_cliente]);

        if (categoria === 'acopio' && Array.isArray(insumos) && insumos.length > 0) {
            const insItem = `
                INSERT INTO inventario_insumos (reporte_id, item_nombre, cantidad, unidad)
                VALUES ($1, $2, $3, $4);
            `;
            for (const item of insumos) {
                await client.query(insItem, [id, item.item_nombre, item.cantidad, item.unidad]);
            }
        }

        await client.query('COMMIT');
        res.status(201).json({ estatus: 'exito', id });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Error detectado en la transacción POST /api/reportes:', err.message);
        res.status(500).json({ error: 'Fallo crítico en la transacción de guardado.', detalle: err.message });
    } finally {
        client.release();
    }
});

// =======================================================================
// RUTA CATCH-ALL — Sirve index.html para cualquier ruta desconocida
// =======================================================================
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});