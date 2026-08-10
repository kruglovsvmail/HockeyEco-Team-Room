// Форматы, разрешённые для сканов документов (заявочные листы, медсправки,
// страховки, согласия).
//
// Список обязан совпадать с белым списком mime-типов в TR-Backend/config/upload.js:
// то, что не входит в него, сервер отобьёт уже после отправки, и пользователь
// увидит отказ вместо загрузки. Раньше accept задавался в каждой форме отдельно
// и успел разъехаться — где-то не было WebP, где-то Excel, а здесь стоял
// image/*, пропускавший HEIC и SVG, которых сервер не принимает.
//
// Перечисляем и расширения, и mime-типы: Windows в диалоге выбора надёжнее
// фильтрует по расширению, macOS и Linux — по типу.
export const DOCUMENT_ACCEPT = [
  '.jpg', '.jpeg', '.png', '.webp', '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
].join(',');

// Подпись для интерфейса — чтобы список форматов в тексте не разошёлся с accept
export const DOCUMENT_ACCEPT_HINT = 'JPG, PNG, WebP, PDF, DOC, DOCX, XLS, XLSX';
