import dotenv from 'dotenv';
import logger from '../logger.js';
import ProcessTasks from './infrastructure/ProcessTasks.js';
import { getDbPool } from './database/dbConnection.js';
import type { Pool } from 'mysql2/promise';

dotenv.config();

let isRunning = true;
let currentCycle = 0;
const pool: Pool = getDbPool();

async function main(): Promise<void> {
  logger.info('Iniciando servicio PM2 en bucle infinito');

  while (isRunning) {
    try {
      currentCycle++;

      if (currentCycle % 100 === 0) {
        logger.info(`Ciclo ${currentCycle} - Servicio funcionando correctamente`);
      }

      const processTasks = ProcessTasks();
      await processTasks.execute();

      const minu2 = 60000 * 2;
      await new Promise<void>((resolve) => setTimeout(resolve, minu2));
    } catch (error) {
      logger.error('Error en el bucle principal:', error);

      const minu3 = 60000 * 3;
      await new Promise<void>((resolve) => setTimeout(resolve, minu3));
    }
  }
}

process.on('SIGINT', async () => {
  logger.info('Recibida señal SIGINT, cerrando servicio...');
  isRunning = false;

  await new Promise<void>((resolve) => setTimeout(resolve, 5000));

  if (pool) {
    await pool.end();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Recibida señal SIGTERM, cerrando servicio...');
  isRunning = false;

  await new Promise<void>((resolve) => setTimeout(resolve, 5000));

  if (pool) {
    await pool.end();
  }
  process.exit(0);
});

process.on('uncaughtException', (error: Error) => {
  logger.error('Error no capturado:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason: unknown) => {
  logger.error('Promesa rechazada no manejada:', reason);
  process.exit(1);
});

main().catch((error: Error) => {
  logger.error('Error fatal:', error);
  process.exit(1);
});