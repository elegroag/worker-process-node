require('dotenv').config();
const mysql = require('mysql2/promise');
const logger = require('../../logger.js'); // Asume que este logger existe y funciona

// Configuración de la base de datos (se mantiene igual)
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'comfaca_giro_real',
    connectTimeout: 10000,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

// Variable para almacenar la única instancia del pool de conexiones
let dbPoolInstance = null;

/**
 * Clase Singleton para gestionar la conexión a la base de datos.
 */
class Database {
    constructor() {
        if (dbPoolInstance) {
            // Si ya existe una instancia, la retornamos para asegurar el Singleton
            return dbPoolInstance;
        }

        // Si no existe, creamos la nueva instancia del pool de conexiones
        try {
            this.pool = mysql.createPool(dbConfig);
            logger.info('Pool de conexiones a MySQL inicializado (Singleton).');

            // Opcional: Probar la conexión para un arranque más seguro
            this.pool.getConnection()
                .then(connection => {
                    logger.info('Conexión a MySQL establecida exitosamente (desde Singleton).');
                    connection.release();
                })
                .catch(err => {
                    logger.error('No se pudo establecer la conexión inicial a MySQL desde el pool (Singleton):', err);
                    // Considera una estrategia de reintento o terminar la aplicación aquí si la conexión es crítica
                });

            // Asignamos la nueva instancia a dbPoolInstance para futuras llamadas
            dbPoolInstance = this;

        } catch (error) {
            logger.error('Error crítico creando el pool de conexiones a MySQL (Singleton):', error);
            // Podrías lanzar el error o re-lanzar para que la aplicación lo maneje
            throw new Error('Failed to initialize database pool: ' + error.message);
        }
    }

    /**
     * Retorna el pool de conexiones.
     * @returns {mysql.Pool} La instancia del pool de conexiones.
     */
    getPool() {
        return this.pool;
    }

    /**
     * Cierra todas las conexiones en el pool.
     * Útil al apagar la aplicación.
     * @returns {Promise<void>} Una promesa que resuelve cuando el pool se ha cerrado.
     */
    async closePool() {
        if (this.pool) {
            await this.pool.end();
            logger.info('Pool de conexiones a MySQL cerrado.');
            dbPoolInstance = null; // Resetear la instancia al cerrar
        }
    }
}

// Exportar una función que retorne la única instancia del Singleton
module.exports = () => {
    if (!dbPoolInstance) {
        new Database();
    }
    return dbPoolInstance.getPool();
    //return dbPoolInstance;
};