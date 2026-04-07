import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiRouter } from './routes/api.js';

const app = express();
const port = Number(process.env.PORT ?? 4000);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json());
app.use('/api', apiRouter);

const clientDist = process.env.CLIENT_DIST_PATH
  ? path.resolve(__dirname, process.env.CLIENT_DIST_PATH)
  : path.resolve(__dirname, '../../client/dist');

app.use(express.static(clientDist));
app.get('*', (_, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.listen(port, () => {
  console.log(`Server started on http://localhost:${port}`);
});
