import dotenv from 'dotenv';
import mysql, { Pool } from 'mysql2/promise';
import logger from '../../logger.js';

dotenv.config();

const dbConfig = {
  host: process.env.DB_HOST || '',
  user: process.env.DB_USER || '',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'comfaca',
  connectTimeout: 10000,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

let dbPoolInstance: Database | null = null;

class Database {
  private pool: Pool;

  constructor() {
    if (dbPoolInstance) {
      return dbPoolInstance;
    }

    try {
      this.pool = mysql.createPool(dbConfig);
      logger.info('Pool de conexiones a MySQL inicializado (Singleton).');

      this.pool.getConnection()
        .then((connection) => {
          logger.info('Conexión a MySQL establecida exitosamente (desde Singleton).');
          connection.release();
        })
        .catch((err) => {
          logger.error('No se pudo establecer la conexión inicial a MySQL desde el pool (Singleton):', err);
        });

      // eslint-disable-next-line @typescript-eslint/no-this-alias
      dbPoolInstance = this;
    } catch (error) {
      const err = error as Error;
      logger.error('Error crítico creando el pool de conexiones a MySQL (Singleton):', err);
      throw new Error('Failed to initialize database pool: ' + err.message);
    }
  }

  getPool(): Pool {
    return this.pool;
  }

  async closePool(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      logger.info('Pool de conexiones a MySQL cerrado.');
      dbPoolInstance = null;
    }
  }
}

export const getDbPool = (): Pool => {
  if (!dbPoolInstance) {
    dbPoolInstance = new Database();
  }
  return dbPoolInstance.getPool();
};

export default getDbPool;