import React from 'react';
import ReactDOM from 'react-dom/client';

// Импортируем каждый нужный вес шрифта Inter отдельно:
import '@fontsource/inter/400.css'; // font-normal
import '@fontsource/inter/500.css'; // font-medium
import '@fontsource/inter/600.css'; // font-semibold
import '@fontsource/inter/700.css'; // font-bold
import '@fontsource/inter/900.css'; // font-black

import App from './App.jsx';
import './assets/global.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);