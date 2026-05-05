# === ЭТАП 1: Сборка проекта (используем стабильную 20 версию) ===
FROM node:20-slim AS builder

# Встраиваем наш "костыль" для обхода зависаний сети Timeweb
RUN sed -i 's/deb.debian.org/mirror.yandex.ru/g' /etc/apt/sources.list.d/debian.sources || true
RUN apt-get update -o Acquire::ForceIPv4=true && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Создаем рабочую директорию
WORKDIR /app

# Копируем файлы зависимостей и устанавливаем их
COPY package*.json ./
RUN npm install

# Копируем весь остальной код и запускаем сборку
COPY . .
RUN npm run build

# === ЭТАП 2: Раздача статики через Nginx ===
FROM nginx:alpine

# Удаляем дефолтную страницу Nginx
RUN rm -rf /usr/share/nginx/html/*

# Копируем готовую сборку из первого этапа (для Vite это обычно папка dist)
COPY --from=builder /app/dist /usr/share/nginx/html

# Прокидываем 80 порт
EXPOSE 80

# Запускаем Nginx
CMD ["nginx", "-g", "daemon off;"]