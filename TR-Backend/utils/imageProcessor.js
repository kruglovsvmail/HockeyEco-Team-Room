import sharp from 'sharp';

// Обработка аватарки перед заливкой в S3:
//  - авто-поворот по EXIF (фото с телефона часто «лежат на боку»);
//  - вписываем в 400×400 с сохранением пропорций, без апскейла мелких картинок;
//  - конвертируем в WebP (компактный формат) с разумным качеством.
// Возвращает готовый Buffer (image/webp).
export const processAvatar = async (buffer) => {
  return sharp(buffer)
    .rotate()
    .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
};
