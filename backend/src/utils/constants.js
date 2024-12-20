import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const PORT = process.env.PORT || 3000;

export const PATHS = {
  MEDIA: path.resolve(__dirname, '../../media'),
  TMP: path.resolve(__dirname, '../../tmp'),
};
