import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const config = {
  plugins: {
    tailwindcss: {
      config: resolve(__dirname, 'client/tailwind.config.ts'),
    },
    autoprefixer: {},
  },
};

export default config;
