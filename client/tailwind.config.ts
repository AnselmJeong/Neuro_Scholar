import type { Config } from "tailwindcss";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const config: Config = {
    darkMode: ["class"],
    content: [
    resolve(__dirname, "./app/**/*.{js,ts,jsx,tsx,mdx}"),
    resolve(__dirname, "./pages/**/*.{js,ts,jsx,tsx,mdx}"),
    resolve(__dirname, "./components/**/*.{js,ts,jsx,tsx,mdx}"),
    resolve(__dirname, "./src/**/*.{js,ts,jsx,tsx,mdx}"),
  ],
  theme: {
  	extend: {
  		colors: {
  			background: 'var(--background)',
  			foreground: 'var(--foreground)',
  			card: {
  				DEFAULT: 'var(--card)',
  				foreground: 'var(--card-foreground)'
  			},
  			popover: {
  				DEFAULT: 'var(--popover)',
  				foreground: 'var(--popover-foreground)'
  			},
  			primary: {
  				DEFAULT: 'var(--primary)',
  				foreground: 'var(--primary-foreground)'
  			},
  			secondary: {
  				DEFAULT: 'var(--secondary)',
  				foreground: 'var(--secondary-foreground)'
  			},
  			muted: {
  				DEFAULT: 'var(--muted)',
  				foreground: 'var(--muted-foreground)'
  			},
  			accent: {
  				DEFAULT: 'var(--accent)',
  				foreground: 'var(--accent-foreground)'
  			},
  			destructive: {
  				DEFAULT: 'var(--destructive)',
  				// foreground: 'var(--destructive-foreground)' // Not present in globals.css, commenting out
  			},
  			border: 'var(--border)',
  			input: 'var(--input)',
  			ring: 'var(--ring)',
  			chart: {
  				'1': 'var(--chart-1)',
  				'2': 'var(--chart-2)',
  				'3': 'var(--chart-3)',
  				'4': 'var(--chart-4)',
  				'5': 'var(--chart-5)'
  			},
            sidebar: {
                DEFAULT: 'var(--sidebar)',
                foreground: 'var(--sidebar-foreground)',
                primary: 'var(--sidebar-primary)',
                'primary-foreground': 'var(--sidebar-primary-foreground)',
                accent: 'var(--sidebar-accent)',
                'accent-foreground': 'var(--sidebar-accent-foreground)',
                border: 'var(--sidebar-border)',
                ring: 'var(--sidebar-ring)',
            }
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		outlineColor: {
  			ring: 'var(--ring)'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
};
export default config;
