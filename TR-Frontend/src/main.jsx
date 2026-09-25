import React from 'react';
import ReactDOM from 'react-dom/client';

// Локальный переменный Manrope подключён в assets/global.css.

import App from './App.jsx';
import './assets/global.css';
// Кадрирование фото 3:4 в квадратных рамках — глобально, см. utils/photoCrop.js
import './utils/photoCrop.js';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
