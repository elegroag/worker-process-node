const TaskManager = require('./TaskManager.js');
const fs = require('fs').promises;
const path = require('path');
const {
  Worker,
  isMainThread,
  parentPort,
  workerData,
} = require('worker_threads');

if (isMainThread) {
  // Ejecutar el Task Manager
  const taskManager = new TaskManager(3); // Máximo 3 workers
  taskManager.initialize().catch(console.error);
}
