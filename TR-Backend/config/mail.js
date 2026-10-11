import nodemailer from 'nodemailer';

// Почтовый сервер задаётся переменными, чтобы сменить почту без правки кода.
// Без MAIL_HOST остаётся Яндекс — так было до перехода на почту Timeweb.
// Порт 465 — сразу SSL, остальные (587) — STARTTLS.
const port = Number(process.env.MAIL_PORT) || 465;

const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST || 'smtp.yandex.ru',
  port,
  secure: port === 465,
  // По умолчанию nodemailer ждёт подключения 2 минуты, и человек столько же смотрит
  // на крутилку. Если порт закрыт, лучше сразу показать ошибку.
  connectionTimeout: 15000,
  greetingTimeout: 15000,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASSWORD
  }
});

// Отправитель обязан совпадать с ящиком, под которым входим: чужой адрес в From
// почтовый сервер отклонит или письмо уйдёт в спам.
export const mailFrom = (name) => `"${name}" <${process.env.MAIL_USER}>`;

export default transporter;
