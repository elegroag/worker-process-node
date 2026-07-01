const logger = require('../logger.js');
require('dotenv').config();
const ProcessTasks = require('./infrastructure/ProcessTasks.js');
const getDbPool = require('./database/dbConnection.js');

let isRunning = true;
let currentCycle = 0;
let pool = getDbPool();

// Función principal del servicio - Bucle infinito
async function main() {
  logger.info('Iniciando servicio PM2 en bucle infinito');
  // Bucle infinito para consultar tareas
  while (isRunning) {
    try {
      currentCycle++;

      // Log cada 100 ciclos para confirmar que está funcionando
      if (currentCycle % 100 === 0) {
        logger.info(`Ciclo ${currentCycle} - Servicio funcionando correctamente`);
      }

      const processTasks = ProcessTasks();
      await processTasks.execute();

      // Esperar 2 minuto antes de la siguiente consulta
      const minu2 = 60000 * 2;
      await new Promise(resolve => setTimeout(resolve, minu2));

    } catch (error) {
      logger.error('Error en el bucle principal:', error);

      // Esperar 30 segundos antes de reintentar en caso de error
      const minu3 = 60000 * 3;
      await new Promise(resolve => setTimeout(resolve, minu3));
    }
  }
}

// Manejar cierre graceful
process.on('SIGINT', async () => {
  logger.info('Recibida señal SIGINT, cerrando servicio...');
  isRunning = false;

  // Dar tiempo para que termine el ciclo actual
  await new Promise(resolve => setTimeout(resolve, 5000));

  if (pool) {
    await pool.end();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Recibida señal SIGTERM, cerrando servicio...');
  isRunning = false;

  // Dar tiempo para que termine el ciclo actual
  await new Promise(resolve => setTimeout(resolve, 5000));

  if (pool) {
    await pool.end();
  }
  process.exit(0);
});

// Manejar errores no capturados
process.on('uncaughtException', (error) => {
  logger.error('Error no capturado:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Promesa rechazada no manejada:', reason);
  process.exit(1);
});

// Iniciar el servicio
main().catch((error) => {
  logger.error('Error fatal:', error);
  process.exit(1);
});