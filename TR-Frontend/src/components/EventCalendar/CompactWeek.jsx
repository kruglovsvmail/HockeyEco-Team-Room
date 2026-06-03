import React from 'react';
import { Icon } from '../../ui/Icon';
import dayjs from 'dayjs';

// Строгий список трехбуквенных названий месяцев для предотвращения точек и склонений
const RU_SHORT_MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

export const CompactWeek = React.memo(function CompactWeek({ 
  date, 
  onChangeDate, 
  onFilterClick,
  offsetIndex = 0,   // Получаем индекс смещения из родителя
  isAnimating = false // Получаем статус анимации из родителя
}) {
  
  // Вспомогательная функция для генерации строки диапазона недели с короткими 3-буквенными месяцами
  const formatTitle = (d) => {
    const startOfWeek = d.startOf('isoWeek');
    const endOfWeek = d.endOf('isoWeek');
    
    const startDay = startOfWeek.date();
    const startMonth = RU_SHORT_MONTHS[startOfWeek.month()];
    
    const endDay = endOfWeek.date();
    const endMonth = RU_SHORT_MONTHS[endOfWeek.month()];
    
    return `${startDay} ${startMonth} — ${endDay} ${endMonth}`;
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

  const openCalendar = (e) => {
    e.stopPropagation();
    window.dispatchEvent(new Event('open-calendar-sheet'));
  };

  return (
    <div className="flex items-center gap-2 w-full justify-between select-none">
      
      {/* БЛОК 1: Изолированный переключатель недель без лишней логики раскрытия */}
      <div className="flex flex-1 items-center justify-between bg-surface-level1 shadow-lg rounded-3xl px-2 py-2.5">
        <button 
          onClick={handlePrevWeek}
          className="p-1 text-content-main hover:text-brand transition-colors outline-none z-10"
        >
          <Icon name="chevron_left" className="w-5 h-5" />
        </button>

        {/* Ограничивающее окно фиксированной ширины без иконки календаря внутри */}
        <div className="flex items-center overflow-hidden flex-1 justify-center ">
          <div className="relative overflow-hidden w-[120px] h-5 flex items-center justify-center">
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
              <div className="w-1/3 shrink-0 text-center text-[14px] font-bold text-content-main capitalize truncate">
                {prevTitle}
              </div>
              {/* Слайд 2: Текущая неделя */}
              <div className="w-1/3 shrink-0 text-center text-[14px] font-bold text-content-main capitalize truncate">
                {currentTitle}
              </div>
              {/* Слайд 3: Следующая неделя */}
              <div className="w-1/3 shrink-0 text-center text-[14px] font-bold text-content-main capitalize truncate">
                {nextTitle}
              </div>
            </div>
          </div>
        </div>

        <button 
          onClick={handleNextWeek}
          className="p-1 text-content-main hover:text-brand transition-colors outline-none rotate-180 z-10"
        >
          <Icon name="chevron_left" className="w-5 h-5" />
        </button>
      </div>

      {/* БЛОК 2: Симметричный по высоте островок действий для календаря и фильтра */}
      <div className="flex items-center gap-2 bg-surface-level1 shadow-lg rounded-3xl px-5 py-2.5  shrink-0">
        <button 
          onClick={openCalendar}
          className="p-1 text-content-main hover:text-brand transition-colors outline-none flex items-center justify-center active:scale-95"
          aria-label="Открыть календарь"
        >
          <Icon name="calendar" className="w-5 h-5" />
        </button>
        <button 
          onClick={onFilterClick}
          className="p-1 text-content-main hover:text-brand transition-colors outline-none flex items-center justify-center active:scale-95"
          aria-label="Открыть фильтры"
        >
          <Icon name="filter" className="w-5 h-5" />
        </button>
      </div>

    </div>
  );
});