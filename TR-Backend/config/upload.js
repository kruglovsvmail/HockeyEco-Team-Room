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
    fileSize: 5 * 2500 * 2500, // Лимит 5 МБ (Защита от падения сервера)
  },
  fileFilter
});

export default upload;