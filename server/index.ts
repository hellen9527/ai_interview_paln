import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { createApp } from './app.js';

export { createApp } from './app.js';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const configuredPort = Number(process.env.PORT || 3001);
  const port =
    Number.isInteger(configuredPort) && configuredPort >= 1 && configuredPort <= 65535
      ? configuredPort
      : 3001;
  const server = createApp().listen(port, '127.0.0.1', () => {
    console.log(`Interview practice API: http://127.0.0.1:${port} (local only)`);
  });
  server.requestTimeout = 60_000;
  server.headersTimeout = 15_000;
  server.on('error', () => {
    console.error('API startup failed. Check whether the local port is already in use.');
    process.exitCode = 1;
  });
}
