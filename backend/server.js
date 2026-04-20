require('dotenv').config();
const express = require('express');
const sql = require('mssql');
const { Pool: PgPool } = require('pg');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 4006;

// --- Auth ---
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const activeSessions = new Set();

function requireAuth(req, res, next) {
    if (!ADMIN_PASSWORD) return next(); // auth disabled if no password set
    const token = req.headers['x-auth-token'] || req.query.token;
    if (token && activeSessions.has(token)) return next();
    return res.status(401).json({ error: 'Unauthorized' });
}

app.use(cors());
app.use(express.json());

// DB Configuration from local .env
let dbConfig = {
    type: process.env.DB_TYPE || 'mssql', // 'mssql' or 'postgres'
    port: process.env.DB_PORT || '',
    user: process.env.DB_USER || '',
    password: process.env.DB_PASSWORD || '',
    server: process.env.DB_SERVER || '',
    database: process.env.DB_NAME || '',
    options: {
        encrypt: true,
        trustServerCertificate: true,
    },
};

let activeDbAdapter = null;

// The DB Abstraction Layer
class DBAdapter {
    constructor(pool, type) {
        this.pool = pool;
        this.type = type;
    }

    async rawQuery(queryText) {
        if (this.type === 'postgres') {
            const res = await this.pool.query(queryText);
            const rows = res.rows || [];
            return { rows, columns: rows.length > 0 ? Object.keys(rows[0]) : [] };
        } else {
            const res = await this.pool.request().query(queryText);
            const rows = res.recordset || [];
            return { rows, columns: rows.length > 0 ? Object.keys(rows[0]) : [] };
        }
    }

    async getTables() {
        if (this.type === 'postgres') {
            const res = await this.pool.query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_SCHEMA = 'public'");
            return res.rows.map(r => r.table_name).sort();
        } else {
            const res = await this.pool.request().query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'");
            return res.recordset.map(r => r.TABLE_NAME).sort();
        }
    }

    async getColumns(tableName) {
        if (this.type === 'postgres') {
            const res = await this.pool.query('SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position', [tableName.toLowerCase()]);
            return res.rows.map(c => c.column_name);
        } else {
            const res = await this.pool.request().input('tableName', sql.NVarChar, tableName).query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @tableName ORDER BY ORDINAL_POSITION`);
            return res.recordset.map(c => c.COLUMN_NAME);
        }
    }

    async getPrimaryKey(tableName) {
        if (this.type === 'postgres') {
            const query = `
                SELECT a.attname AS "COLUMN_NAME" 
                FROM pg_index i 
                JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey) 
                WHERE i.indrelid = $1::regclass AND i.indisprimary
            `;
            try {
                const res = await this.pool.query(query, [tableName.toLowerCase()]);
                return res.rows.length > 0 ? res.rows[0].COLUMN_NAME : null;
            } catch (e) { return null; }
        } else {
            const query = `
                SELECT COLUMN_NAME
                FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
                WHERE OBJECTPROPERTY(OBJECT_ID(CONSTRAINT_SCHEMA + '.' + CONSTRAINT_NAME), 'IsPrimaryKey') = 1
                AND TABLE_NAME = @tableName
            `;
            const res = await this.pool.request().input('tableName', sql.NVarChar, tableName).query(query);
            return res.recordset.length > 0 ? res.recordset[0].COLUMN_NAME : null;
        }
    }

    async getTotalRows(tableName) {
        if (this.type === 'postgres') {
            const res = await this.pool.query(`SELECT COUNT(*) as total FROM "${tableName}"`);
            return parseInt(res.rows[0].total);
        } else {
            const res = await this.pool.request().query(`SELECT COUNT(*) as total FROM [${tableName}]`);
            return parseInt(res.recordset[0].total);
        }
    }

    async getPaginatedRows(tableName, sortCol, offset, pageSize) {
        if (this.type === 'postgres') {
            const query = `SELECT * FROM "${tableName}" ORDER BY "${sortCol}" DESC LIMIT $1 OFFSET $2`;
            const res = await this.pool.query(query, [pageSize, offset]);
            return res.rows;
        } else {
            const query = `SELECT * FROM [${tableName}] ORDER BY [${sortCol}] DESC OFFSET ${offset} ROWS FETCH NEXT ${pageSize} ROWS ONLY`;
            const res = await this.pool.request().query(query);
            return res.recordset;
        }
    }

    async deleteRow(tableName, primaryKey, pkValue) {
        if (this.type === 'postgres') {
            await this.pool.query(`DELETE FROM "${tableName}" WHERE "${primaryKey}" = $1`, [pkValue]);
        } else {
            await this.pool.request().input('pkValue', pkValue).query(`DELETE FROM [${tableName}] WHERE [${primaryKey}] = @pkValue`);
        }
    }

    async truncateTable(tableName) {
        if (this.type === 'postgres') {
            await this.pool.query(`TRUNCATE TABLE "${tableName}" CASCADE`);
        } else {
            await this.pool.request().query(`TRUNCATE TABLE [${tableName}]`);
        }
    }

    async updateRow(tableName, primaryKey, pkValue, updates) {
        let cols = [];
        let params = [];
        let index = 1;

        if (this.type === 'postgres') {
            Object.entries(updates).forEach(([key, value]) => {
                if (key === primaryKey) return;
                cols.push(`"${key}" = $${index++}`);
                params.push(value);
            });
            params.push(pkValue);
            await this.pool.query(`UPDATE "${tableName}" SET ${cols.join(', ')} WHERE "${primaryKey}" = $${index}`, params);
        } else {
            const req = this.pool.request();
            req.input('pkValue', pkValue);
            Object.entries(updates).forEach(([key, value], i) => {
                if (key === primaryKey) return;
                const pName = `val${i}`;
                cols.push(`[${key}] = @${pName}`);
                req.input(pName, value);
            });
            await req.query(`UPDATE [${tableName}] SET ${cols.join(', ')} WHERE [${primaryKey}] = @pkValue`);
        }
    }

    async getSchemaInfo(tableName) {
        if (this.type === 'postgres') {
            const colQuery = `
                SELECT
                    c.column_name, c.data_type, c.character_maximum_length,
                    c.numeric_precision, c.numeric_scale,
                    c.is_nullable, c.column_default,
                    CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_primary_key
                FROM information_schema.columns c
                LEFT JOIN (
                    SELECT ku.column_name
                    FROM information_schema.table_constraints tc
                    JOIN information_schema.key_column_usage ku ON tc.constraint_name = ku.constraint_name AND tc.table_schema = ku.table_schema
                    WHERE tc.table_name = $1 AND tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public'
                ) pk ON c.column_name = pk.column_name
                WHERE c.table_name = $1 AND c.table_schema = 'public'
                ORDER BY c.ordinal_position
            `;
            const fkQuery = `
                SELECT
                    kcu.column_name,
                    ccu.table_name AS foreign_table,
                    ccu.column_name AS foreign_column
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
                WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = $1 AND tc.table_schema = 'public'
            `;
            const idxQuery = `
                SELECT i.relname as index_name,
                       array_agg(a.attname ORDER BY x.ord) as columns,
                       ix.indisunique as is_unique,
                       ix.indisprimary as is_primary
                FROM pg_class t
                JOIN pg_index ix ON t.oid = ix.indrelid
                JOIN pg_class i ON i.oid = ix.indexrelid
                JOIN (SELECT unnest(indkey) as col, generate_subscripts(indkey, 1) as ord, indexrelid FROM pg_index) x ON x.indexrelid = ix.indexrelid
                JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = x.col
                WHERE t.relkind = 'r' AND t.relname = $1
                GROUP BY i.relname, ix.indisunique, ix.indisprimary
            `;
            const [cols, fks, idxs] = await Promise.all([
                this.pool.query(colQuery, [tableName.toLowerCase()]),
                this.pool.query(fkQuery, [tableName.toLowerCase()]),
                this.pool.query(idxQuery, [tableName.toLowerCase()])
            ]);
            const fkMap = {};
            fks.rows.forEach(fk => { fkMap[fk.column_name] = { table: fk.foreign_table, column: fk.foreign_column }; });
            return {
                columns: cols.rows.map(c => ({
                    name: c.column_name,
                    type: c.character_maximum_length ? `${c.data_type}(${c.character_maximum_length})` : c.numeric_precision ? `${c.data_type}(${c.numeric_precision}${c.numeric_scale ? ',' + c.numeric_scale : ''})` : c.data_type,
                    nullable: c.is_nullable === 'YES',
                    default: c.column_default,
                    isPrimaryKey: c.is_primary_key,
                    foreignKey: fkMap[c.column_name] || null
                })),
                indexes: idxs.rows.map(i => ({ name: i.index_name, columns: i.columns, isUnique: i.is_unique, isPrimary: i.is_primary }))
            };
        } else {
            const colQuery = `
                SELECT
                    c.COLUMN_NAME as column_name, c.DATA_TYPE as data_type,
                    c.CHARACTER_MAXIMUM_LENGTH as character_maximum_length,
                    c.NUMERIC_PRECISION as numeric_precision, c.NUMERIC_SCALE as numeric_scale,
                    c.IS_NULLABLE as is_nullable, c.COLUMN_DEFAULT as column_default,
                    CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END as is_primary_key
                FROM INFORMATION_SCHEMA.COLUMNS c
                LEFT JOIN (
                    SELECT ku.COLUMN_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
                    JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
                    WHERE tc.TABLE_NAME = @tableName AND tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
                ) pk ON c.COLUMN_NAME = pk.COLUMN_NAME
                WHERE c.TABLE_NAME = @tableName
                ORDER BY c.ORDINAL_POSITION
            `;
            const fkQuery = `
                SELECT kcu.COLUMN_NAME as column_name, ccu.TABLE_NAME as foreign_table, ccu.COLUMN_NAME as foreign_column
                FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
                JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
                JOIN INFORMATION_SCHEMA.CONSTRAINT_COLUMN_USAGE ccu ON ccu.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
                WHERE tc.CONSTRAINT_TYPE = 'FOREIGN KEY' AND tc.TABLE_NAME = @tableName
            `;
            const idxQuery = `
                SELECT i.name as index_name, c.name as column_name, i.is_unique, i.is_primary_key
                FROM sys.indexes i
                JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
                JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
                JOIN sys.tables t ON i.object_id = t.object_id
                WHERE t.name = @tableName
                ORDER BY i.name, ic.key_ordinal
            `;
            const req1 = this.pool.request().input('tableName', sql.NVarChar, tableName);
            const req2 = this.pool.request().input('tableName', sql.NVarChar, tableName);
            const req3 = this.pool.request().input('tableName', sql.NVarChar, tableName);
            const [cols, fks, idxRaw] = await Promise.all([req1.query(colQuery), req2.query(fkQuery), req3.query(idxQuery)]);
            const fkMap = {};
            fks.recordset.forEach(fk => { fkMap[fk.column_name] = { table: fk.foreign_table, column: fk.foreign_column }; });
            const idxMap = {};
            idxRaw.recordset.forEach(r => {
                if (!idxMap[r.index_name]) idxMap[r.index_name] = { name: r.index_name, columns: [], isUnique: !!r.is_unique, isPrimary: !!r.is_primary_key };
                idxMap[r.index_name].columns.push(r.column_name);
            });
            return {
                columns: cols.recordset.map(c => ({
                    name: c.column_name,
                    type: c.character_maximum_length ? `${c.data_type}(${c.character_maximum_length})` : c.numeric_precision ? `${c.data_type}(${c.numeric_precision}${c.numeric_scale ? ',' + c.numeric_scale : ''})` : c.data_type,
                    nullable: c.is_nullable === 'YES',
                    default: c.column_default,
                    isPrimaryKey: !!c.is_primary_key,
                    foreignKey: fkMap[c.column_name] || null
                })),
                indexes: Object.values(idxMap)
            };
        }
    }

    async createRow(tableName, data) {
        let cols = [];
        if (this.type === 'postgres') {
            let place = [];
            let params = [];
            let index = 1;
            Object.entries(data).forEach(([key, value]) => {
                cols.push(`"${key}"`);
                place.push(`$${index++}`);
                params.push(value);
            });
            await this.pool.query(`INSERT INTO "${tableName}" (${cols.join(', ')}) VALUES (${place.join(', ')})`, params);
        } else {
            const req = this.pool.request();
            let place = [];
            Object.entries(data).forEach(([key, value], i) => {
                const pName = `val${i}`;
                cols.push(`[${key}]`);
                place.push(`@${pName}`);
                req.input(pName, value);
            });
            await req.query(`INSERT INTO [${tableName}] (${cols.join(', ')}) VALUES (${place.join(', ')})`);
        }
    }
}

async function getDb() {
    if (!activeDbAdapter) throw new Error("Database not connected. Please configure via UI.");
    return activeDbAdapter;
}

async function connectToDatabase(config) {
    if (activeDbAdapter && activeDbAdapter.pool) {
        try {
            if (activeDbAdapter.type === 'postgres') await activeDbAdapter.pool.end();
            else await activeDbAdapter.pool.close();
        } catch(e) {}
        activeDbAdapter = null;
    }
    
    dbConfig = { ...dbConfig, ...config };
    
    if (!dbConfig.server || !dbConfig.user) {
        throw new Error("Database not configured. Please configure via UI.");
    }

    try {
        if (dbConfig.type === 'postgres') {
            const pool = new PgPool({
                user: dbConfig.user,
                password: dbConfig.password,
                host: dbConfig.server,
                database: dbConfig.database,
                port: parseInt(dbConfig.port) || 5432,
                ssl: (dbConfig.server.includes('localhost') || dbConfig.server.includes('127.0.0.1')) ? false : { rejectUnauthorized: false }
            });
            await pool.query('SELECT NOW()'); // Test connection
            activeDbAdapter = new DBAdapter(pool, 'postgres');
        } else {
            const pool = await new sql.ConnectionPool({
                user: dbConfig.user,
                password: dbConfig.password,
                server: dbConfig.server,
                database: dbConfig.database,
                port: parseInt(dbConfig.port) || 1433,
                options: dbConfig.options
            }).connect();
            activeDbAdapter = new DBAdapter(pool, 'mssql');
        }
        
        console.log(`✅ Connected to ${dbConfig.type.toUpperCase()} Database`);
        io.emit('db_connected', true);
        return activeDbAdapter;
    } catch(err) {
        console.log(`❌ ${dbConfig.type.toUpperCase()} Database Connection Failed: `, err.message);
        activeDbAdapter = null;
        io.emit('db_error', err.message);
        throw err;
    }
}

// Initial connection attempt
connectToDatabase(dbConfig).catch(() => {});

// Auth endpoints (public)
app.post('/api/auth/login', (req, res) => {
    const { password } = req.body;
    if (!ADMIN_PASSWORD) return res.json({ token: null, authRequired: false });
    if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Invalid password' });
    const token = crypto.randomBytes(32).toString('hex');
    activeSessions.add(token);
    res.json({ token });
});

app.post('/api/auth/logout', (req, res) => {
    const token = req.headers['x-auth-token'];
    if (token) activeSessions.delete(token);
    res.json({ success: true });
});

app.get('/api/auth/status', (req, res) => {
    if (!ADMIN_PASSWORD) return res.json({ authRequired: false });
    const token = req.headers['x-auth-token'] || req.query.token;
    res.json({ authRequired: true, authenticated: !!(token && activeSessions.has(token)) });
});

// Admin Endpoints for Database Config
app.post('/api/config', requireAuth, async (req, res) => {
    try {
        const { type, port, server, database, user, password } = req.body;
        
        // Test connection first
        await connectToDatabase({ type, port, server, database, user, password });
        
        // Write to .env
        const envPath = path.join(__dirname, '.env');
        let envContent = '';
        if (fs.existsSync(envPath)) {
            envContent = fs.readFileSync(envPath, 'utf8');
        }
        
        const updateEnv = (key, val) => {
            const regex = new RegExp(`^${key}=.*`, 'm');
            if (regex.test(envContent)) {
                envContent = envContent.replace(regex, `${key}=${val}`);
            } else {
                envContent += `\n${key}=${val}`;
            }
        };
        
        updateEnv('DB_TYPE', type || 'mssql');
        updateEnv('DB_PORT', port || '');
        updateEnv('DB_SERVER', server);
        updateEnv('DB_NAME', database);
        updateEnv('DB_USER', user);
        updateEnv('DB_PASSWORD', password);
        
        fs.writeFileSync(envPath, envContent.trim() + '\n');
        
        res.json({ success: true, message: 'Connected and saved successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Connection failed: ' + err.message });
    }
});

app.get('/api/config', requireAuth, (req, res) => {
    res.json({
        type: dbConfig.type || 'mssql',
        port: dbConfig.port || '',
        server: dbConfig.server || '',
        database: dbConfig.database || '',
        user: dbConfig.user || '',
        isConfigured: !!(dbConfig.server && dbConfig.user)
    });
});

app.post('/api/disconnect', requireAuth, async (req, res) => {
    try {
        if (activeDbAdapter) {
            try {
                if (activeDbAdapter.type === 'postgres') await activeDbAdapter.pool.end();
                else await activeDbAdapter.pool.close();
            } catch(e) {}
            activeDbAdapter = null;
        }
        io.emit('db_error', 'Database disconnected manually.');
        res.json({ success: true, message: 'Disconnected successfully.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to disconnect: ' + err.message });
    }
});

const activeSubscriptions = new Map(); // Map<socketId, { tableName, page, pageSize }>

io.on('connection', (socket) => {
    console.log(`🔌 Client connected: ${socket.id}`);
    
    socket.on('get_tables', async () => {
        try {
            const db = await getDb();
            const tables = await db.getTables();
            socket.emit('tables_list', tables);
        } catch (err) {
            console.error('Failed to fetch tables:', err.message);
            socket.emit('error', 'Failed to fetch tables: ' + err.message);
        }
    });

    socket.on('subscribe', (config) => {
        const { tableName, page = 1, pageSize = 50 } = typeof config === 'string' ? { tableName: config } : config;
        
        Array.from(socket.rooms).forEach(room => {
            if (room !== socket.id) socket.leave(room);
        });

        const roomName = `${tableName}_p${page}_s${pageSize}`;
        socket.join(roomName);
        
        activeSubscriptions.set(socket.id, { tableName, page, pageSize, roomName });
        console.log(`📡 Client ${socket.id} watching ${tableName} (Page ${page}, Size ${pageSize})`);
        
        fetchAndBroadcastTable(tableName, page, pageSize, roomName);
    });

    socket.on('run_query', async (rawQuery) => {
        try {
            console.log(`🔍 Executing Raw Query from ${socket.id}: ${rawQuery.length > 100 ? rawQuery.substring(0, 100) + '...' : rawQuery}`);
            const db = await getDb();
            const { rows, columns } = await db.rawQuery(rawQuery);
            
            socket.emit('query_result', {
                rows: rows.map(row => {
                    const newRow = { ...row };
                    for (const key in newRow) {
                        if (Buffer.isBuffer(newRow[key])) {
                            newRow[key] = `<Binary: ${newRow[key].length}B>`;
                        } else if (newRow[key] instanceof Date) {
                            newRow[key] = newRow[key].toISOString();
                        }
                    }
                    return newRow;
                }),
                columns,
                executedAt: new Date().toISOString()
            });
        } catch (err) {
            console.error('❌ Raw Query Failed:', err.message);
            socket.emit('error', 'SQL Lab Error: ' + err.message);
        }
    });

    socket.on('delete_row', async ({ tableName, primaryKey, pkValue }) => {
        try {
            console.log(`🗑️ Deleting from ${tableName} where ${primaryKey} = ${pkValue}`);
            const db = await getDb();
            await db.deleteRow(tableName, primaryKey, pkValue);
            
            socket.emit('crud_success', { action: 'delete', tableName });
            const sub = Array.from(activeSubscriptions.values()).find(s => s.tableName === tableName);
            if (sub) fetchAndBroadcastTable(sub.tableName, sub.page, sub.pageSize, sub.roomName);
        } catch (err) {
            console.error('❌ Delete Failed:', err.message);
            socket.emit('error', 'Delete Error: ' + err.message);
        }
    });
    
    socket.on('truncate_table', async ({ tableName }) => {
        try {
            console.log(`🧨 Purging all rows from ${tableName}`);
            const db = await getDb();
            await db.truncateTable(tableName);
            
            socket.emit('crud_success', { action: 'truncate', tableName });
            
            const sub = Array.from(activeSubscriptions.values()).find(s => s.tableName === tableName);
            if (sub) fetchAndBroadcastTable(sub.tableName, sub.page, sub.pageSize, sub.roomName);
        } catch (err) {
            console.error('❌ Truncate Failed:', err.message);
            socket.emit('error', 'Purge Error: ' + err.message);
        }
    });

    socket.on('update_row', async ({ tableName, primaryKey, pkValue, updates }) => {
        try {
            console.log(`📝 Updating ${tableName} where ${primaryKey} = ${pkValue}`);
            const db = await getDb();
            await db.updateRow(tableName, primaryKey, pkValue, updates);
            
            socket.emit('crud_success', { action: 'update', tableName });
            const sub = Array.from(activeSubscriptions.values()).find(s => s.tableName === tableName);
            if (sub) fetchAndBroadcastTable(sub.tableName, sub.page, sub.pageSize, sub.roomName);
        } catch (err) {
            console.error('❌ Update Failed:', err.message);
            socket.emit('error', 'Update Error: ' + err.message);
        }
    });

    socket.on('create_row', async ({ tableName, data }) => {
        try {
            console.log(`➕ Creating new record in ${tableName}`);
            const db = await getDb();
            await db.createRow(tableName, data);
            
            socket.emit('crud_success', { action: 'create', tableName });
            const sub = Array.from(activeSubscriptions.values()).find(s => s.tableName === tableName);
            if (sub) fetchAndBroadcastTable(sub.tableName, sub.page, sub.pageSize, sub.roomName);
        } catch (err) {
            console.error('❌ Create Failed:', err.message);
            socket.emit('error', 'Create Error: ' + err.message);
        }
    });

    socket.on('disconnect', () => {
        activeSubscriptions.delete(socket.id);
        console.log(`🔌 Client disconnected: ${socket.id}`);
    });
});

async function fetchAndBroadcastTable(tableName, page, pageSize, roomName) {
    try {
        const db = await getDb();
        const offset = (page - 1) * pageSize;

        // 1. Get column metadata
        const columns = await db.getColumns(tableName);

        // 2. Get total row count
        const totalRows = await db.getTotalRows(tableName);

        // 3. Get paginated rows
        const timestampCol = columns.find(c => {
            const lc = c.toLowerCase();
            return lc.includes('created') || lc.includes('updated') || lc.includes('timestamp') || lc.includes('time') || lc.includes('date') || lc === 'dt';
        });
        const idCol = columns.find(c => {
            const lc = c.toLowerCase();
            return lc === 'id' || lc === 'uid' || lc.endsWith('_id');
        });

        let sortCol = timestampCol || idCol || columns[0] || 'id'; // fallback
        
        const rows = await db.getPaginatedRows(tableName, sortCol, offset, pageSize);
        
        // 4. Sanitize data
        const sanitizedRows = rows.map(row => {
            const newRow = { ...row };
            for (const key in newRow) {
                if (Buffer.isBuffer(newRow[key])) {
                    newRow[key] = `<Binary Data: ${newRow[key].length} bytes>`;
                } else if (newRow[key] instanceof Date) {
                    newRow[key] = newRow[key].toISOString();
                }
            }
            return newRow;
        });
        
        io.to(roomName).emit('table_update', { 
            rows: sanitizedRows, 
            columns, 
            tableName,
            pagination: {
                totalRows,
                currentPage: page,
                pageSize,
                totalPages: Math.ceil(totalRows / pageSize)
            }
        });
        console.log(`[Viewer-WS] Broadcasted ${sanitizedRows.length} rows to room ${roomName}`);
    } catch (error) {
        console.error(`Error querying ${tableName}:`, error.message);
        io.to(roomName).emit('error', `Table [${tableName}]: ${error.message}`);
    }
}

// Server-side continuous loop for active subscriptions
setInterval(() => {
    if (activeSubscriptions.size === 0) return;

    const uniqueSubs = new Map();
    activeSubscriptions.forEach((sub, socketId) => {
        const socket = io.sockets.sockets.get(socketId);
        if (!socket) {
            activeSubscriptions.delete(socketId);
            return;
        }

        const key = sub.roomName;
        if (!uniqueSubs.has(key)) {
            uniqueSubs.set(key, sub);
        }
    });

    uniqueSubs.forEach(sub => {
        const room = io.sockets.adapter.rooms.get(sub.roomName);
        if (room && room.size > 0) {
            fetchAndBroadcastTable(sub.tableName, sub.page, sub.pageSize, sub.roomName);
        }
    });
}, 5000);

const staticPath = path.join(__dirname, '../frontend/dist');

app.get('/api/tables', requireAuth, async (req, res) => {
    try {
        const db = await getDb();
        const tables = await db.getTables();
        res.json(tables);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/primary-key/:tableName', requireAuth, async (req, res) => {
    try {
        const db = await getDb();
        let pk = await db.getPrimaryKey(req.params.tableName);
        
        if (!pk) {
            // Fallback: search for columns like 'id', 'ID', etc.
            const columns = await db.getColumns(req.params.tableName);
            const colsLower = columns.map(c => c.toLowerCase());
            const idCol = columns.find((c, idx) => colsLower[idx] === 'id' || colsLower[idx] === 'uid' || colsLower[idx].endsWith('_id'));
            pk = idCol || null;
        }
        res.json({ primaryKey: pk });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/column-types/:tableName', requireAuth, async (req, res) => {
    try {
        const db = await getDb();
        const tableName = req.params.tableName;
        if (db.type === 'postgres') {
            const res2 = await db.pool.query(
                `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public' ORDER BY ordinal_position`,
                [tableName.toLowerCase()]
            );
            const map = {};
            res2.rows.forEach(r => { map[r.column_name] = r.data_type; });
            res.json(map);
        } else {
            const r = await db.pool.request().input('t', sql.NVarChar, tableName)
                .query(`SELECT COLUMN_NAME as column_name, DATA_TYPE as data_type FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @t ORDER BY ORDINAL_POSITION`);
            const map = {};
            r.recordset.forEach(row => { map[row.column_name] = row.data_type; });
            res.json(map);
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/schema/:tableName', requireAuth, async (req, res) => {
    try {
        const db = await getDb();
        const schema = await db.getSchemaInfo(req.params.tableName);
        res.json(schema);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Saved connection profiles
const CONNECTIONS_FILE = path.join(__dirname, 'connections.json');

function loadConnections() {
    if (!fs.existsSync(CONNECTIONS_FILE)) return [];
    try { return JSON.parse(fs.readFileSync(CONNECTIONS_FILE, 'utf8')); } catch { return []; }
}

function saveConnections(conns) {
    fs.writeFileSync(CONNECTIONS_FILE, JSON.stringify(conns, null, 2));
}

app.get('/api/connections', requireAuth, (req, res) => {
    res.json(loadConnections());
});

app.post('/api/connections', requireAuth, (req, res) => {
    const { name, type, server, port, database, user, password } = req.body;
    if (!name || !server || !user) return res.status(400).json({ error: 'name, server, user are required' });
    const conns = loadConnections();
    const existing = conns.findIndex(c => c.name === name);
    const entry = { name, type: type || 'mssql', server, port, database, user, password };
    if (existing >= 0) conns[existing] = entry; else conns.push(entry);
    saveConnections(conns);
    res.json({ success: true });
});

app.delete('/api/connections/:name', requireAuth, (req, res) => {
    const conns = loadConnections().filter(c => c.name !== req.params.name);
    saveConnections(conns);
    res.json({ success: true });
});

// Serve static files from the frontend build (after API routes to prevent shadowing)
app.use(express.static(staticPath));

app.all('*', (req, res) => {
    if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Endpoint not found' });
    res.sendFile(path.join(staticPath, 'index.html'));
});

server.listen(PORT, () => {
    console.log(`🚀 Live WebSocket DB Viewer Suite running at http://localhost:${PORT}`);
});
