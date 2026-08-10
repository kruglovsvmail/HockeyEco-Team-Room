import multer from 'multer';

// Храним в памяти, но теперь мы строго ограничили размер!
const storage = multer.memoryStorage();

// Фильтр форматов
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'image/jpeg', 
    'image/png', 
    'image/webp',
    'application/pdf', 
    'application/msword', // .doc
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'application/vnd.ms-excel', // .xls
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' // .xlsx
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    // Выкидываем кастомную ошибку
    cb(new Error('INVALID_FILE_TYPE'), false);
  }
};

const upload = multer({
  storage,
  limits: {
    // 30 МБ. Сканы документов намеренно не сжимаются ни на клиенте, ни на
    // сервере (в S3 файл уходит как есть): фото заявочного листа должно
    // оставаться читаемым, а пережатие первым делом съедает мелкий текст.
    // Прежнее значение 5 * 2500 * 2500 давало те же ~29,8 МБ, но комментарий
    // рядом обещал 5 МБ — цифра выглядела опечаткой и могла быть "исправлена".
    fileSize: 30 * 1024 * 1024,
  },
  fileFilter
});

export default upload;