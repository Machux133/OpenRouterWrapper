/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./index.html", // If this is your entry point
    // Add the specific path to your Chatbot component if it's not in src
    "./src/components/Chatbot.tsx", // Example path
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}