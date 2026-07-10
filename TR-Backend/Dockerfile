# Используем легковесный образ Node.js
FROM node:20-slim

# Переключаем зеркала Debian на Яндекс (чтобы избежать зависаний сети)
RUN sed -i 's/deb.debian.org/mirror.yandex.ru/g' /etc/apt/sources.list.d/debian.sources || true

# Обновляем пакеты и устанавливаем Chromium, а также Python и инструменты сборки (g++, make) для bcrypt
RUN apt-get update -o Acquire::ForceIPv4=true && apt-get install -y \
    chromium \
    fonts-liberation \
    libnss3 \
    libatk-bridge2.0-0 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    libglib2.0-0 \
    libgbm1 \
    libasound2 \
    python3 \
    make \
    g++ \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Заставляем Puppeteer использовать системный Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Создаем рабочую папку
WORKDIR /app

# Сначала копируем только файлы зависимостей
COPY package*.json ./

# Ретраи на сетевые обрывы (та же нестабильность сети, что иногда рвёт git clone к GitHub,
# периодически роняет npm install с "Exit handler never called!" — известный баг npm при
# обрыве соединения). После установки — жёсткая проверка, что express реально резолвится:
# без неё npm иногда возвращает успешный код выхода даже после сбоя, и битый node_modules
# молча уезжает в прод (ровно это уже случилось один раз).
RUN npm config set fetch-retries 5 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm install && \
    node -e "require.resolve('express')"

# Копируем весь остальной код бэкенда
COPY . .

# Открываем порт 3002
EXPOSE 3002

# Запускаем сервер
CMD ["node", "server.js"]