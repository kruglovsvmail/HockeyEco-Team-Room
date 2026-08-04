import React, { useMemo } from 'react';
import clsx from 'clsx';
import { Table } from '../../ui/Table';
import { Avatar } from '../../ui/Avatar';
import { Icon } from '../../ui/Icon';
import { HintPopover } from '../../ui/HintPopover';
import { getContrastTextColor } from '../../utils/helpers';

// ─── Размеры игрового номера в таблице ростера ───────────────────────────────
// Правится в одном месте: JERSEY_NUMBER_SIZE — сами цифры, JERSEY_HASH_SIZE — решётка.
const JERSEY_NUMBER_SIZE = '18px';
const JERSEY_HASH_SIZE = '12px';

// Сортировка людей по алфавиту ФИО (Фамилия → Имя → Отчество), русская локаль.
export const sortPeopleByFullName = (people = []) =>
  [...people].sort((a, b) => {
    const key = (p) => `${p.last_name || ''} ${p.first_name || ''} ${p.middle_name || ''}`.trim();
    return key(a).localeCompare(key(b), 'ru');
  });

// Табличное отображение списка участников — альтернатива плиткам PersonGridCard.
// showBadges=true (вкладка «Ростер») добавляет колонки нашивки (C/A) и игрового номера.
// Долгое нажатие по строке (pressHandlers) включает режим правки — ровно так же,
// как долгий тап по плитке; в этом режиме появляется колонка с крестиком исключения.
export const PersonTableView = ({
  people = [],
  onPersonClick,
  showBadges = false,
  activeBrandColor,
  pressHandlers,           // хендлеры долгого нажатия (входа в режим правки)
  isEditMode = false,
  canExclude = false,      // показывать крестик исключения (режим правки + права роли)
  hasManageAccess = true,  // false → крестик потухший, с подсказкой про подписку
  onExcludeClick,
  animatingOutId
}) => {
  const badgeBgColor = activeBrandColor || 'var(--color-brand)';
  const badgeTextColorClass = getContrastTextColor(activeBrandColor);

  const sortedPeople = useMemo(() => sortPeopleByFullName(people), [people]);

  const columns = useMemo(() => {
    const cols = [];

    cols.push(
      {
        key: 'photo',
        title: 'Фото',
        width: '64px',
        align: 'center',
        render: (person) => (
          <div className="relative w-11 h-11 mx-auto pointer-events-none">
            <Avatar
              photoUrl={person.photo_url || person.avatar_url}
              firstName={person.first_name}
              lastName={person.last_name}
              className="w-11 h-11 rounded-xl bg-surface-level2 border border-surface-level2 shadow-sm"
            />
            {/* Нашивка капитана/ассистента поверх фото — как на плитке */}
            {showBadges && (person.is_captain || person.is_assistant) && (
              <div
                style={{ backgroundColor: badgeBgColor }}
                className={`absolute -top-1 -right-1.5 w-[20px] h-[20px] rounded-full shadow-sm flex items-center justify-center text-[10px] font-black z-10 ${badgeTextColorClass}`}
              >
                {person.is_captain ? 'К' : 'А'}
              </div>
            )}
          </div>
        )
      },
      {
        key: 'name',
        title: 'ФИО',
        width: 'auto',
        render: (person) => (
          <div className="flex flex-col pointer-events-none min-w-0">
            <span className="font-bold text-content-main leading-tight truncate">
              {person.last_name} {person.first_name}
            </span>
            {person.middle_name && (
              <span className="text-[12px] text-content-muted mt-0.5 truncate">{person.middle_name}</span>
            )}
          </div>
        )
      }
    );

    // Игровой номер — после ФИО. Решётка своим стилем: мельче и приглушённее
    // цифр (#34), выравнивание по базовой линии.
    if (showBadges) {
      cols.push({
        key: 'jersey_number',
        title: '№',
        width: '54px',
        align: 'right',
        render: (person) => (
          person.jersey_number == null ? null : (
            <span className="inline-flex items-baseline gap-[1px] pointer-events-none">
              <span
                className="font-bold text-content-subtle leading-none"
                style={{ fontSize: JERSEY_HASH_SIZE }}
              >
                #
              </span>
              <span
                className="font-bold tabular-nums leading-none ml-0.5"
                style={{ fontSize: JERSEY_NUMBER_SIZE, color: badgeBgColor }}
              >
                {person.jersey_number}
              </span>
            </span>
          )
        )
      });
    }

    // Колонка исключения появляется только в режиме правки
    if (canExclude) {
      cols.push({
        key: 'exclude',
        title: '',
        width: '38px',
        align: 'center',
        render: (person) => (
          hasManageAccess ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onExcludeClick?.(person);
              }}
              className="w-[22px] h-[22px] bg-red-500 rounded-full flex items-center justify-center shadow-md mx-auto hover:scale-110 active:scale-90 transition-transform cursor-pointer"
            >
              <Icon name="close" className="w-3 h-3 text-white" strokeWidth={3.5} />
            </button>
          ) : (
            <HintPopover status="no_subscription">
              <button
                type="button"
                className="w-[22px] h-[22px] bg-red-500 opacity-30 rounded-full flex items-center justify-center shadow-md mx-auto cursor-pointer"
              >
                <Icon name="close" className="w-3 h-3 text-white" strokeWidth={3.5} />
              </button>
            </HintPopover>
          )
        )
      });
    }

    return cols;
  }, [showBadges, canExclude, hasManageAccess, onExcludeClick, badgeBgColor, badgeTextColorClass]);

  // Долгое нажатие вешаем на всю строку. В режиме правки гасим всплытие клика,
  // чтобы тап по строке не закрывал режим (как и у плиток).
  const rowProps = (person) => ({
    ...(pressHandlers || {}),
    ...(isEditMode ? { onClick: (e) => e.stopPropagation() } : {}),
    className: clsx('select-none', person.member_id === animatingOutId && 'opacity-30')
  });

  return (
    <Table
      columns={columns}
      data={sortedPeople}
      rowKey="member_id"
      onRowClick={onPersonClick}
      rowProps={rowProps}
    />
  );
};
