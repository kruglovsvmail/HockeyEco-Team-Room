# ЭТАП 1: Сборка приложения
FROM node:20-alpine as build
WORKDIR /app

# Копируем зависимости и устанавливаем их
COPY package*.json ./
RUN npm ci

# Копируем исходный код и запускаем сборку
COPY . .
RUN npm run build

# ЭТАП 2: Раздача статики через Nginx
FROM nginx:alpine

# Копируем собранные файлы из первого этапа в директорию Nginx
COPY --from=build /app/dist /usr/share/nginx/html

# Копируем наш кастомный конфиг Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Открываем 80 порт
EXPOSE 80

# Запускаем Nginx
CMD ["nginx", "-g", "daemon off;"]