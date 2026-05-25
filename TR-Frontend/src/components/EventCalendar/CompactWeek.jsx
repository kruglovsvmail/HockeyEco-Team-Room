import React from 'react';
import { Icon } from '../../ui/Icon';
import dayjs from 'dayjs';

export const CompactWeek = React.memo(function CompactWeek({ 
  date, 
  onChangeDate, 
  onToggleExpand,
  offsetIndex = 0,   // Получаем индекс смещения из родителя
  isAnimating = false // Получаем статус анимации из родителя
}) {
  
  // Вспомогательная функция для генерации строки диапазона недели
  const formatTitle = (d) => {
    const startOfWeek = d.startOf('isoWeek');
    const endOfWeek = d.endOf('isoWeek');
    return `${startOfWeek.format('D MMM')} — ${endOfWeek.format('D MMM')}`;
  };

  // Вычисляем заголовки для трех виртуальных слайдов (прошлая, текущая и следующая недели)
  const currentTitle = formatTitle(date);
  const prevTitle = formatTitle(date.subtract(1, 'week'));
  const nextTitle = formatTitle(date.add(1, 'week'));

  const handlePrevWeek = (e) => {
    e.stopPropagation();
    onChangeDate(date.subtract(1, 'week'));
  };

  const handleNextWeek = (e) => {
    e.stopPropagation();
    onChangeDate(date.add(1, 'week'));
  };

  return (
    <div 
      className="flex items-center justify-between bg-surface-level1 shadow-lg rounded-3xl px-4 py-2.5 cursor-pointer select-none transition-colors"
      onClick={onToggleExpand}
    >
      {/* Левая стрелочка остается статичной */}
      <button 
        onClick={handlePrevWeek}
        className="p-1 text-content-main hover:text-brand transition-colors outline-none z-10"
      >
        <Icon name="chevron_left" className="w-5 h-5" />
      </button>

      {/* Контейнер для иконки и бегущей строки с датами */}
      <div className="flex items-center gap-2 overflow-hidden flex-1 justify-center mx-2">
        <Icon name="calendar" className="w-4 h-4 text-brand shrink-0" />
        
        {/* Ограничивающее окно фиксированной ширины для предотвращения дергания кнопок */}
        <div className="relative overflow-hidden w-[180px] h-5 flex items-center justify-center">
          {/* Трехколоночный трек, двигающийся зеркально карусели событий */}
          <div 
            className="w-[300%] flex items-start h-full absolute left-0 top-0"
            style={{
              transform: `translateX(calc(-33.33333% - ${offsetIndex * 33.33333}%))`,
              transition: isAnimating ? 'transform 250ms cubic-bezier(0.32, 0.72, 0, 1)' : 'none',
              willChange: 'transform'
            }}
          >
            {/* Слайд 1: Прошлая неделя */}
            <div className="w-1/3 shrink-0 text-center text-[15px] font-bold text-content-main capitalize truncate">
              {prevTitle}
            </div>
            {/* Слайд 2: Текущая неделя */}
            <div className="w-1/3 shrink-0 text-center text-[15px] font-bold text-content-main capitalize truncate">
              {currentTitle}
            </div>
            {/* Слайд 3: Следующая неделя */}
            <div className="w-1/3 shrink-0 text-center text-[15px] font-bold text-content-main capitalize truncate">
              {nextTitle}
            </div>
          </div>
        </div>
      </div>

      {/* Правая стрелочка остается статичной */}
      <button 
        onClick={handleNextWeek}
        className="p-1 text-content-main hover:text-brand transition-colors outline-none rotate-180 z-10"
      >
        <Icon name="chevron_left" className="w-5 h-5" />
      </button>
    </div>
  );
});