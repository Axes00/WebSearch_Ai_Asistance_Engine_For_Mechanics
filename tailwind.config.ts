import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{ts,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Engineering / technical identity
        ink: {
          DEFAULT: "#0B1220",
          soft: "#111827",
          muted: "#1F2937",
        },
        steel: {
          50: "#F6F8FB",
          100: "#EAEFF6",
          200: "#D2DCEA",
          300: "#A8B7CE",
          400: "#7C8DA8",
          500: "#556680",
          600: "#3E4C63",
          700: "#2D384B",
          800: "#1F2836",
          900: "#131A25",
        },
        deepblue: {
          DEFAULT: "#0F2A5E",
          dark: "#0A1E47",
          light: "#1E3F86",
        },
        cyan: {
          accent: "#42A8C7",
          soft: "#7FC6DC",
        },
        paper: {
          DEFAULT: "#F8F9FB",
          warm: "#FBF8F2",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(15, 23, 42, 0.04), 0 4px 12px rgba(15, 23, 42, 0.06)",
        cardHover: "0 2px 4px rgba(15, 23, 42, 0.06), 0 10px 28px rgba(15, 23, 42, 0.12)",
        glass: "0 1px 0 rgba(255,255,255,0.05) inset, 0 10px 30px rgba(10,30,71,0.12)",
      },
      backgroundImage: {
        "grid-subtle":
          "linear-gradient(rgba(15, 42, 94, 0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(15, 42, 94, 0.04) 1px, transparent 1px)",
      },
      backgroundSize: {
        "grid-32": "32px 32px",
      },
      borderRadius: {
        xl2: "1.25rem",
      },
    },
  },
  plugins: [],
};

export default config;
