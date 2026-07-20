import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#eeeefb",
          100: "#dcdcf6",
          400: "#8280dc",
          DEFAULT: "#5e5cd0",
          500: "#5e5cd0",
          600: "#4b49b4",
          700: "#3c3a90",
        },
        secondary: {
          50: "#f1f2f4",
          DEFAULT: "#6b7785",
          500: "#6b7785",
          600: "#565f6a",
        },
        success: {
          50: "#e9f7ee",
          DEFAULT: "#229741",
          500: "#229741",
          600: "#1c7c36",
        },
        danger: {
          50: "#fcecec",
          DEFAULT: "#de5a5a",
          500: "#de5a5a",
          600: "#c23f3f",
        },
        warning: {
          50: "#fdf3df",
          DEFAULT: "#eead20",
          500: "#eead20",
          600: "#c98f10",
        },
        info: {
          50: "#eaf4fe",
          DEFAULT: "#3d99f5",
          500: "#3d99f5",
          600: "#2a7fd6",
        },
        surface: "#f3f4f7",
        ink: {
          900: "#212631",
          800: "#2a303c",
          700: "#343b48",
          500: "#5c6472",
          400: "#8991a0",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(33 38 49 / 0.05), 0 1px 3px 0 rgb(33 38 49 / 0.06)",
      },
    },
  },
  plugins: [],
};

export default config;
