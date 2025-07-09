const { parentPort, workerData } = require('worker_threads');
const {
  processDataAnalysis,
  processText,
  processCalculation,
  processTask,
} = require('./UseProcess.js');

// WORKER THREAD
const task = workerData;

// Simular procesamiento con diferentes tipos de tareas
try {
  // Simular trabajo pesado con delay aleatorio
  const delay = Math.random() * 1000 + 500; // 500-1500ms
  setTimeout(() => {
    const result = processTask(task);
    parentPort.postMessage(result);
  }, delay);
} catch (error) {
  parentPort.postMessage({ error: error.message });
}
