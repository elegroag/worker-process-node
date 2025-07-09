const processTask = function (task) {
  switch (task.type) {
    case 'calculation':
      return processCalculation(task.data);

    case 'text_processing':
      return processText(task.data);

    case 'data_analysis':
      return processDataAnalysis(task.data);

    default:
      throw new Error(`Tipo de tarea no soportado: ${task.type}`);
  }
};

const processCalculation = function (data) {
  const { operation, number } = data;

  switch (operation) {
    case 'factorial':
      let factorial = 1;
      for (let i = 1; i <= number; i++) {
        factorial *= i;
      }
      return { operation, input: number, result: factorial };

    case 'fibonacci':
      const fib = (n) => (n <= 1 ? n : fib(n - 1) + fib(n - 2));
      return { operation, input: number, result: fib(number) };

    case 'prime_check':
      const isPrime = (n) => {
        if (n <= 1) return false;
        if (n <= 3) return true;
        if (n % 2 === 0 || n % 3 === 0) return false;
        for (let i = 5; i * i <= n; i += 6) {
          if (n % i === 0 || n % (i + 2) === 0) return false;
        }
        return true;
      };
      return { operation, input: number, result: isPrime(number) };

    default:
      throw new Error(`Operación no soportada: ${operation}`);
  }
};

const processText = function (data) {
  const { text, operation } = data;

  switch (operation) {
    case 'uppercase':
      return { operation, input: text, result: text.toUpperCase() };

    case 'reverse':
      return {
        operation,
        input: text,
        result: text.split('').reverse().join(''),
      };

    case 'word_count':
      const wordCount = text
        .split(/\s+/)
        .filter((word) => word.length > 0).length;
      return { operation, input: text, result: wordCount };

    default:
      throw new Error(`Operación de texto no soportada: ${operation}`);
  }
};

const processDataAnalysis = function (data) {
  const { numbers, operation } = data;

  switch (operation) {
    case 'statistics':
      const sum = numbers.reduce((a, b) => a + b, 0);
      const avg = sum / numbers.length;
      const min = Math.min(...numbers);
      const max = Math.max(...numbers);
      const sorted = [...numbers].sort((a, b) => a - b);
      const median =
        sorted.length % 2 === 0
          ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
          : sorted[Math.floor(sorted.length / 2)];

      return {
        operation,
        input: numbers,
        result: {
          sum,
          average: avg,
          min,
          max,
          median,
          count: numbers.length,
        },
      };

    default:
      throw new Error(`Operación de análisis no soportada: ${operation}`);
  }
};

module.exports = {
  processDataAnalysis: processDataAnalysis,
  processText: processText,
  processCalculation: processCalculation,
  processTask: processTask,
};
