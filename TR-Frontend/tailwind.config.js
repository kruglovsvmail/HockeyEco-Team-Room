/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // Базовый шрифт всего приложения
        sans: ['Inter'],
      },
      colors: {
        // --- АКЦЕНТНЫЕ ЦВЕТА (БРЕНД) ---
        brand: { 
          DEFAULT: 'var(--color-brand)', 
          hover: 'var(--color-brand-hover)',   
          dark: 'var(--color-brand-dark)',    
          glow: 'var(--color-brand-glow)',
          opacity: 'var(--color-brand-opacity)',      
        },
        
        // --- СТАТИЧНЫЕ ПОВЕРХНОСТИ (ГЛОБАЛЬНЫЕ) ---
        surface: { 
          base: 'var(--color-surface-base)',    
          level1: 'var(--color-surface-level1)',  
          level2: 'var(--color-surface-level2)',  
          level3: 'var(--color-surface-level3)',  
          border: 'var(--color-surface-border)'
        },

        // --- ВСПЛЫВАЮЩИЕ ЭЛЕМЕНТЫ (ШТОРКИ, МОДАЛКИ) ---
        sheet: {
          bg: 'var(--color-sheet-bg)',      
          border: 'var(--color-sheet-border)',  
        },

        // --- ОВЕРЛЕИ (ЗАТЕМНЕНИЕ ФОНА) ---
        overlay: {
          DEFAULT: 'var(--color-overlay)', 
        },
        
        // --- ТИПОГРАФИКА И КОНТЕНТ ---
        content: { 
          DEFAULT: 'var(--color-content)',   
          main: 'var(--color-content-main)',      
          muted: 'var(--color-content-muted)',     
          subtle: 'var(--color-content-subtle)',
          dark: 'var(--color-content-dark)'     
        },

        // --- СИСТЕМНЫЕ СТАТУСЫ ---
        danger: { 
          DEFAULT: 'var(--color-danger)', 
          muted: 'var(--color-danger-muted)'         
        },

          // --- СИСТЕМНЫЕ СТАТУСЫ ---
        success: { 
          DEFAULT: 'var(--color-success)', 
          muted: 'var(--color-success-muted)'         
        },
          
      },

      // --- РАЗМЫТИЕ И СТЕКЛОМОРФИЗМ (BLUR) ---
      blur: {
        'ambient': 'var(--blur-ambient)',
      },
      backdropBlur: {
        'overlay': 'var(--backdrop-blur-overlay)',       
        'sheet': 'var(--backdrop-blur-sheet)',        
      },

      boxShadow: {
        'brand-glow': 'var(--shadow-brand-glow)', 
        'sheet-top': 'var(--shadow-sheet-top)',       
        
        'sm': 'var(--shadow-sm)',
        'DEFAULT': 'var(--shadow-default)',
        'md': 'var(--shadow-md)',
        'lg': 'var(--shadow-lg)',
        'xl': 'var(--shadow-xl)',
      },
      
      borderRadius: {
        'none': 'var(--radius-none)',
        'sm': 'var(--radius-sm)',  
        'DEFAULT': 'var(--radius-default)', 
        'md': 'var(--radius-md)',  
        'lg': 'var(--radius-lg)',    
        'xl': 'var(--radius-xl)',   
        '2xl': 'var(--radius-2xl)',     
        '3xl': 'var(--radius-3xl)',   
        'full': 'var(--radius-full)',
      },
    },
  },
  plugins: [],
}