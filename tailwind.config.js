/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./templates/**/*.html",
    "./static/**/*.js"
  ],
  theme: {
    extend: {
      fontFamily: { 
        sans: ['Poppins', 'sans-serif'] 
      },
      colors: {
        canvas: '#F4F7FE',        
        surface: '#FFFFFF',       
        textMain: '#2B3674',      
        textMuted: '#A3AED0',     
        brand: {
            DEFAULT: '#4318FF',   
            light: '#F4F1FF',     
        },
        accent: {
            mint: '#05CD99',      
            mintLight: '#E6FAF5',
            pink: '#FFCEE6',      
            orange: '#FFDCA8'     
        }
      },
      boxShadow: {
        soft: '0px 18px 40px rgba(112, 144, 176, 0.12)',
        card: '0px 10px 30px rgba(43, 54, 116, 0.04)'
      }
    }
  },
  plugins: [],
}