import path from "path";
import { fileURLToPath } from "url";

const configDir = path.dirname(fileURLToPath(import.meta.url));

export default {
  plugins: {
    tailwindcss: { config: path.join(configDir, "tailwind.config.ts") },
    autoprefixer: {},
  },
};
