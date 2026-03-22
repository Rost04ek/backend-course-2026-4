const http = require('http');
const fs = require('fs').promises;
const { program } = require('commander');
const { XMLBuilder } = require('fast-xml-parser');

program
  .requiredOption('-i, --input <path>', 'Iлях до файлу для читання')
  .requiredOption('-h, --host <host>', 'Aдреса сервера')
  .requiredOption('-p, --port <port>', 'Порт сервера');

program.configureOutput({
  outputError: (str, write) => {
    if (str.includes('-i, --input')) {
      write('Please, specify input file\n');
    } else {
      write(str);
    }
  }
});

program.parse(process.argv);
const options = program.opts();

async function checkFileExists(filePath) {
  try {
    await fs.access(filePath);
  } catch (error) {
    console.error('Cannot find input file');
    process.exit(1);
  }
}

async function startServer() {
  await checkFileExists(options.input);

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${options.host}:${options.port}`);
      
      // Параметри для Варіанту 2
      const showDate = url.searchParams.get('date') === 'true';
      const airtimeMinParam = url.searchParams.get('airtime_min');
      
      // Читаємо весь файл як один великий текст
      const rawData = await fs.readFile(options.input, 'utf-8');
      
      // РОЗБИРАЄМО ФОРМАТ NDJSON (кожен рядок - це окремий JSON)
      const jsonData = rawData
        .split('\n') // Розбиваємо текст на масив рядків
        .filter(line => line.trim() !== '') // Відкидаємо порожні рядки (наприклад, у кінці файлу)
        .map(line => JSON.parse(line)); // Парсимо кожен рядок як окремий об'єкт

      let processedData = jsonData;

      // Логіка фільтрації
      if (airtimeMinParam !== null) {
        const airtimeMin = parseFloat(airtimeMinParam);
        if (!isNaN(airtimeMin)) {
          processedData = processedData.filter(flight => parseFloat(flight.AIR_TIME) > airtimeMin);
        }
      }

      // Формування вихідних полів
      const finalData = processedData.map(flight => {
        const result = {};
        if (showDate) result.FL_DATE = flight.FL_DATE;
        if (airtimeMinParam !== null) result.AIR_TIME = flight.AIR_TIME;
        result.DISTANCE = flight.DISTANCE;
        return result;
      });

      // Формуємо XML
      const builder = new XMLBuilder({
        format: true,
        ignoreAttributes: false
      });

      const xmlObj = {
        flights: {
          flight: finalData
        }
      };
      
      const xmlContent = builder.build(xmlObj);

      res.writeHead(200, { 'Content-Type': 'application/xml' });
      res.end(xmlContent);

    } catch (error) {
      console.error("Помилка обробки запиту:", error);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
    }
  });

  server.listen(options.port, options.host, () => {
    console.log(`Сервер запущено на http://${options.host}:${options.port}`);
  });
}

startServer();