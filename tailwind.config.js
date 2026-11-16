/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ["Manrope", "ui-sans-serif", "system-ui", "sans-serif"] },
      colors: {
        brand: { DEFAULT: "#EE5A24", dark: "#D24A17", soft: "#FFF3EC", line: "#FBD9C6" },
        navy: { DEFAULT: "#14213D", 2: "#22315A", 3: "#5B6684" },
        paper: "#F5F6F8",
      },
      borderRadius: { xl2: "1.25rem" },
    },
  },
  plugins: [],
};
