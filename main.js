const http = require('http');
const fs = require('fs').promises;
const { program } = require('commander');
const { XMLBuilder } = require('fast-xml-parser');

program
  .requiredOption('-i, --input <path>', 'Шлях до файлу для читання')
  .requiredOption('-h, --host <host>', 'Адреса сервера')
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

  const rawData = await fs.readFile(options.input, 'utf-8');
  const jsonData = rawData
    .split('\n')
    .filter(line => line.trim() !== '')
    .map(line => JSON.parse(line));

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${options.host}:${options.port}`);
      
      const showDate = url.searchParams.get('date') === 'true';
      const airtimeMinParam = url.searchParams.get('airtime_min');
      const limitParam = url.searchParams.get('limit');

      let limit = null;
      if (limitParam !== null) {
        limit = parseInt(limitParam, 10);
        if (!Number.isInteger(limit) || limit <= 0) {
          res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Invalid limit. Use a positive integer, for example: ?limit=100');
          return;
        }
      }

      let processedData = jsonData;

      if (airtimeMinParam !== null) {
        const airtimeMin = parseFloat(airtimeMinParam);
        if (!isNaN(airtimeMin)) {
          processedData = processedData.filter(flight => {
            if (flight.AIR_TIME === undefined || flight.AIR_TIME === null) return false;
            return parseFloat(flight.AIR_TIME) > airtimeMin;
          });
        }
      }

      if (limit !== null) {
        processedData = processedData.slice(0, limit);
      }

      const finalData = processedData.map(flight => {
        const result = {};
        if (showDate && flight.FL_DATE !== undefined) result.FL_DATE = flight.FL_DATE;
        if (airtimeMinParam !== null && flight.AIR_TIME !== undefined) result.AIR_TIME = flight.AIR_TIME;
        if (flight.DISTANCE !== undefined) result.DISTANCE = flight.DISTANCE;
        return result;
      });

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

      await fs.writeFile('output.xml', xmlContent, 'utf-8');

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