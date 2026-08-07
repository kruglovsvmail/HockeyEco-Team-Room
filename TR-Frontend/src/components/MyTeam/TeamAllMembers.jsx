import React, { useRef, useMemo } from 'react';
import { ContainerContent } from '../../ui/ContainerContent';
import { PersonGridCard } from './PersonGridCard';
import { PersonTableView } from './PersonTableView';
import { Icon } from '../../ui/Icon';
import { HintPopover } from '../../ui/HintPopover';
import { ViewModeToggle } from '../../ui/ViewModeToggle';
import clsx from 'clsx';
import { FadeIn } from '../../ui/FadeIn';

export const TeamAllMembers = ({
  members = [],
  onPersonClick,
  isEditMode,
  setIsEditMode,
  hasManageAccess,
  isManager, // Новый флаг административного статуса
  onExcludeClick,
  animatingOutId,
  onAddClick,
  activeBrandColor,
  viewMode = 'grid',        // 'grid' — плитка (по умолчанию), 'table' — таблица
  onViewModeChange,
  // Заголовки секций вынесены в пропсы: тот же список обслуживает и состав клуба
  title = 'Общий состав',
  archivedTitle = 'Ушедшие из команды',
  emptyLabel = 'Активные участники отсутствуют'
}) => {
  const pressTimer = useRef(null);
  const pressStartPos = useRef(null);

  const handlePointerDown = (e) => {
    if (isEditMode || !isManager) return;
    pressStartPos.current = { x: e.clientX, y: e.clientY };
    pressTimer.current = setTimeout(() => {
      setIsEditMode(true);
      if (window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(50);
      }
    }, 500);
  };

  // Отменяем долгое нажатие только при реальном смещении пальца (>10px),
  // чтобы микро-дрожание сенсора на некоторых телефонах не сбрасывало таймер
  const handlePointerMove = (e) => {
    if (!pressStartPos.current) return;
    if (Math.abs(e.clientX - pressStartPos.current.x) > 10 ||
        Math.abs(e.clientY - pressStartPos.current.y) > 10) {
      cancelPress();
    }
  };

  const cancelPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressStartPos.current = null;
  };

  // Тот же набор хендлеров долгого нажатия, что висит на плитке — для строк таблицы
  const pressHandlers = {
    onPointerDown: handlePointerDown,
    onPointerUp: cancelPress,
    onPointerLeave: cancelPress,
    onPointerCancel: cancelPress,
    onPointerMove: handlePointerMove
  };

  // Разделяем состав на действующих участников и ушедших (у которых left_at не NULL).
  // Ушедшие сортируются по дате ухода — самые свежие сверху.
  const { activeMembers, archivedMembers } = useMemo(() => {
    return {
      activeMembers: members.filter(m => !m.left_at),
      archivedMembers: members
        .filter(m => !!m.left_at)
        .sort((a, b) => String(b.left_at).localeCompare(String(a.left_at)))
    };
  }, [members]);

  // Переключатель плитка/таблица в шапке блока (состояние живёт в MyTeamPage и
  // сохраняется в localStorage устройства)
  const viewToggle = onViewModeChange ? (
    <ViewModeToggle value={viewMode} onChange={onViewModeChange} activeBrandColor={activeBrandColor} />
  ) : null;

  // Контекстная кнопка добавления хоккеиста в правый угол шапки общего состава
  let addButton = null;
  if (isManager && !isEditMode) {
    if (hasManageAccess) {
      addButton = (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAddClick();
          }}
          className="transition-colors active:scale-90 outline-none flex items-center justify-center text-content-muted hover:opacity-80 cursor-pointer"
          style={activeBrandColor ? { color: activeBrandColor } : {}}
        >
          <Icon name="user_plus" className="w-5 h-5" />
        </button>
      );
    } else {
      addButton = (
        <HintPopover status="no_subscription">
          <button
            type="button"
            className="transition-all opacity-30 outline-none flex items-center justify-center text-content-muted cursor-pointer"
            style={activeBrandColor ? { color: activeBrandColor } : {}}
          >
            <Icon name="user_plus" className="w-5 h-5" />
          </button>
        </HintPopover>
      );
    }
  }

  // Табличное отображение — тот же список, но строками (сортировка по алфавиту ФИО).
  // Ушедших не трогаем: ни долгого нажатия, ни крестика исключения.
  const renderTable = (itemsList, isArchiveGroup = false) => (
    <div className={clsx("mt-1", isArchiveGroup && "opacity-60")}>
      <PersonTableView
        people={itemsList}
        onPersonClick={isEditMode && !isArchiveGroup ? undefined : onPersonClick}
        showBadges={false}
        activeBrandColor={isArchiveGroup ? 'var(--color-content-subtle)' : activeBrandColor}
        pressHandlers={isArchiveGroup ? null : pressHandlers}
        isEditMode={isEditMode && !isArchiveGroup}
        canExclude={isEditMode && isManager && !isArchiveGroup}
        hasManageAccess={hasManageAccess}
        onExcludeClick={onExcludeClick}
        animatingOutId={animatingOutId}
      />
    </div>
  );

  const renderGrid = (itemsList, isArchiveGroup = false) => (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(94px,1fr))] gap-y-5 gap-x-2 justify-items-center mt-2">
      {itemsList.map((m, index) => {
        const isRemoving = m.member_id === animatingOutId;
        // Режим покачивания jiggle активен только для действующего состава руководителей
        const jiggleClass = isEditMode && isManager && !isRemoving && !isArchiveGroup
          ? `animate-jiggle jiggle-delay-${index % 3}` 
          : '';

        return (
          <FadeIn 
            key={m.member_id} 
            delay={index * 30} 
            duration={300} 
            className={clsx("w-full flex justify-center", isArchiveGroup && "opacity-60")}
          >
            <div
              onPointerDown={isArchiveGroup ? undefined : handlePointerDown}
              onPointerUp={cancelPress}
              onPointerLeave={cancelPress}
              onPointerCancel={cancelPress}
              onPointerMove={handlePointerMove}
              onClick={(e) => {
                if (isEditMode) e.stopPropagation();
              }}
              className={clsx(
                "relative select-none w-full text-center transition-all duration-200",
                jiggleClass,
                isRemoving && "animate-slot-exit"
              )}
            >
              <PersonGridCard
                person={m}
                /* Ушедших исключать уже нечем — их карточка открывается и в режиме правки */
                onClick={isEditMode && !isArchiveGroup ? undefined : onPersonClick}
                showBadges={false}
                activeBrandColor={isArchiveGroup ? 'var(--color-content-subtle)' : activeBrandColor}
              />
              
              {/* Кнопка исключения выводится только для активных участников */}
              {isEditMode && isManager && !isRemoving && !isArchiveGroup && (
                hasManageAccess ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onExcludeClick(m);
                    }}
                    className="absolute top-0 right-1/2 translate-x-10 -translate-y-1.5 w-[22px] h-[22px] bg-red-500 rounded-full flex items-center justify-center shadow-md z-30 hover:scale-110 active:scale-90 transition-transform cursor-pointer"
                  >
                    <Icon name="close" className="w-3 h-3 text-white" strokeWidth={3.5} />
                  </button>
                ) : (
                  <div className="absolute top-0 right-1/2 translate-x-10 -translate-y-1.5 z-30">
                    <HintPopover status="no_subscription">
                      <button
                        type="button"
                        className="w-[22px] h-[22px] bg-red-500 opacity-30 rounded-full flex items-center justify-center shadow-md transition-transform cursor-pointer"
                      >
                        <Icon name="close" className="w-3 h-3 text-white" strokeWidth={3.5} />
                      </button>
                    </HintPopover>
                  </div>
                )
              )}
            </div>
          </FadeIn>
        );
      })}
    </div>
  );

  const renderList = (itemsList, isArchiveGroup = false) => (
    viewMode === 'table' ? renderTable(itemsList, isArchiveGroup) : renderGrid(itemsList, isArchiveGroup)
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Секция действующего состава */}
      <ContainerContent title={title} count={activeMembers.length} titleAction={viewToggle} action={addButton}>
        {activeMembers.length > 0 ? (
          renderList(activeMembers, false)
        ) : (
          <div className="text-center py-6 text-[10px] font-bold uppercase tracking-widest text-content-subtle opacity-50 select-none">
            {emptyLabel}
          </div>
        )}
      </ContainerContent>

      {/* Секция ушедших участников — left_at заполнен (скрыта, если пуста).
          Карточка такого участника открывается только для чтения (UserDetails). */}
      {archivedMembers.length > 0 && (
        <ContainerContent title={archivedTitle} count={archivedMembers.length} titleAction={viewToggle}>
          {renderList(archivedMembers, true)}
        </ContainerContent>
      )}
    </div>
  );
};