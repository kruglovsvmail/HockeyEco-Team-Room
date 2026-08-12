import React, { useState, useEffect, useCallback, useMemo } from 'react';
import clsx from 'clsx';
import { Icon } from '../../../ui/Icon';
import { Toast } from '../../../ui/Toast';
import { FadeIn } from '../../../ui/FadeIn';
import { PageLoader } from '../../../ui/Loader';
import { BottomSheet } from '../../../ui/BottomSheet';
import { SectionHeader } from '../../../ui/SectionHeader';
import { getAuthHeaders } from '../../../utils/helpers';
import { BoardPlayer } from '../../TacticalBoard/BoardPlayer';

// Вкладка «План» карточки тренировки.
//
// План — это упорядоченный список упражнений из личной библиотеки тренера. Игроки видят
// его для того, чтобы приходить подготовленными и не тратить время на объяснения уже на
// льду, поэтому детали (описание и анимация) раскрываются прямо здесь.
//
// Два состояния, которые определяют поведение экрана:
//   • черновик — план собран, но не опубликован: виден только тренерскому составу;
//   • прошедшая тренировка — остаётся список названий, детали закрываются. Упражнение
//     с тех пор могли переделать, и показывать новую версию под старой датой нельзя.

const API = import.meta.env.VITE_API_URL || '';

export function TrainingPlan({ event }) {
  const eventClubId = event?.my_club_id || null;
  const isClubEvent = !!eventClubId;
  const scopeQuery = isClubEvent ? `clubId=${eventClubId}` : `teamId=${event?.my_team_id}`;

  const scopeBody = useMemo(() => ({
    teamId: isClubEvent ? null : event?.my_team_id,
    clubId: eventClubId,
    eventType: event?.event_type,
  }), [isClubEvent, event?.my_team_id, eventClubId, event?.event_type]);

  const [items, setItems] = useState([]);
  const [isPublished, setIsPublished] = useState(false);
  const [isPast, setIsPast] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [expandedId, setExpandedId] = useState(null);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [library, setLibrary] = useState([]);
  const [librarySearch, setLibrarySearch] = useState('');
  const [libraryLoading, setLibraryLoading] = useState(false);

  const [toast, setToast] = useState({ isOpen: false, message: '', type: 'success' });
  const notify = useCallback((message, type = 'success') => {
    setToast({ isOpen: true, message, type });
  }, []);

  const loadPlan = useCallback(async () => {
    if (!event?.event_id) return;
    try {
      const res = await fetch(
        `${API}/api/trainings/${event.event_id}/plan?eventType=${event.event_type}&${scopeQuery}`,
        { headers: getAuthHeaders() }
      );
      const json = await res.json();
      if (!json.success) return;

      setItems(json.items || []);
      setIsPublished(json.plan_published);
      setIsPast(json.is_past);
      setCanManage(json.can_manage);
    } catch {
      notify('Не удалось загрузить план', 'danger');
    } finally {
      setLoading(false);
    }
  }, [event?.event_id, event?.event_type, scopeQuery, notify]);

  useEffect(() => { loadPlan(); }, [loadPlan]);

  // Сохранение состава и порядка. Отправляем сразу после каждого изменения: план правят
  // редко, зато не остаётся ни «несохранённых изменений», ни отдельной кнопки.
  const persist = async (nextItems) => {
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/trainings/${event.event_id}/plan`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...scopeBody,
          items: nextItems.map(i => ({ id: i.id, drill_id: i.drill_id })),
        }),
      });
      const json = await res.json();

      if (!json.success) {
        notify(json.error || 'Не удалось сохранить план', 'danger');
        return;
      }
      await loadPlan();
    } catch {
      notify('Не удалось сохранить план', 'danger');
    } finally {
      setSaving(false);
    }
  };

  const move = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;

    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);
    persist(next);
  };

  const removeItem = (index) => {
    const next = items.filter((_, i) => i !== index);
    setItems(next);
    persist(next);
  };

  const togglePublished = async () => {
    const next = !isPublished;
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/trainings/${event.event_id}/plan/published`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...scopeBody, published: next }),
      });
      const json = await res.json();

      if (!json.success) {
        notify(json.error || 'Не удалось изменить публикацию', 'danger');
        return;
      }

      setIsPublished(next);
      notify(next ? 'План опубликован — команда его видит' : 'План скрыт от команды');
    } catch {
      notify('Не удалось изменить публикацию', 'danger');
    } finally {
      setSaving(false);
    }
  };

  // ── Библиотека упражнений ────────────────────────────────────────────────
  const loadLibrary = useCallback(async (search) => {
    setLibraryLoading(true);
    try {
      const params = new URLSearchParams();
      if (search?.trim()) params.set('search', search.trim());

      const res = await fetch(`${API}/api/drills?${params}`, { headers: getAuthHeaders() });
      const json = await res.json();
      if (json.success) setLibrary(json.drills || []);
    } catch {
      notify('Не удалось загрузить библиотеку', 'danger');
    } finally {
      setLibraryLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    if (!isLibraryOpen) return;
    const timer = setTimeout(() => loadLibrary(librarySearch), librarySearch ? 350 : 0);
    return () => clearTimeout(timer);
  }, [isLibraryOpen, librarySearch, loadLibrary]);

  const addDrill = (drill) => {
    // Новый пункт уходит без id — сервер сам вставит его и возьмёт название
    // из библиотеки, а не из того, что прислал клиент
    const next = [...items, { id: null, drill_id: drill.id, name: drill.name }];
    setItems(next);
    setIsLibraryOpen(false);
    persist(next);
  };

  if (loading) return <PageLoader />;

  // Игрок до публикации вообще ничего не видит: сервер в этом случае отдаёт пустой план
  if (!canManage && !isPublished) {
    return (
      <FadeIn>
        <div className="flex flex-col items-center text-center gap-3 py-16 px-8">
          <Icon name="training_tactics" className="w-12 h-12 text-content-subtle opacity-40" />
          <p className="text-[14px] text-content-muted leading-snug max-w-[280px]">
            План тренировки пока не опубликован
          </p>
        </div>
      </FadeIn>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-2">

      {/* ── Публикация. Флаг существует только ради черновика: пока тренер собирает
             тренировку, команде незачем видеть два упражнения из восьми ── */}
      {canManage && (
        <button
          onClick={togglePublished}
          disabled={saving}
          className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-surface-level1 border border-surface-border outline-none text-left disabled:opacity-60"
        >
          <div className="flex flex-col min-w-0">
            <span className="text-[14px] font-bold text-content-main">
              {isPublished ? 'План опубликован' : 'Черновик'}
            </span>
            <span className="text-[12px] text-content-muted leading-snug">
              {isPublished
                ? 'Команда видит план и может заранее разобрать упражнения'
                : 'План виден только тренерам'}
            </span>
          </div>
          <div className={clsx(
            'shrink-0 w-12 h-7 rounded-full p-1 transition-colors',
            isPublished ? 'bg-brand' : 'bg-surface-level2'
          )}>
            <div className={clsx(
              'w-5 h-5 rounded-full bg-white transition-transform',
              isPublished && 'translate-x-5'
            )} />
          </div>
        </button>
      )}

      {/* ── Пояснение к прошедшей тренировке ── */}
      {isPast && items.length > 0 && (
        <p className="text-[12px] text-content-muted leading-snug px-1">
          Тренировка прошла, детали упражнений недоступны
        </p>
      )}

      {canManage && (
        <SectionHeader
          title={`Упражнения (${items.length})`}
          actionText="+ Добавить"
          showAction
          onActionClick={() => setIsLibraryOpen(true)}
        />
      )}

      {items.length === 0 ? (
        <FadeIn>
          <div className="flex flex-col items-center text-center gap-3 py-14 px-8">
            <Icon name="training_tactics" className="w-12 h-12 text-content-subtle opacity-40" />
            <p className="text-[14px] text-content-muted leading-snug max-w-[280px]">
              {canManage
                ? 'План пуст. Добавьте упражнения из своей библиотеки — команда увидит их после публикации.'
                : 'В плане пока нет упражнений'}
            </p>
          </div>
        </FadeIn>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item, index) => {
            const isExpanded = expandedId === item.id;
            const canExpand = item.details_available;

            return (
              <div
                key={item.id}
                className="rounded-2xl bg-surface-level1 border border-surface-border overflow-hidden"
              >
                <div className="flex items-center gap-3 p-3">
                  <span className="shrink-0 w-7 h-7 rounded-lg bg-surface-level2 text-content-muted text-[13px] font-black flex items-center justify-center">
                    {index + 1}
                  </span>

                  <button
                    onClick={() => canExpand && setExpandedId(isExpanded ? null : item.id)}
                    disabled={!canExpand}
                    className="flex-1 min-w-0 flex items-center gap-2 text-left outline-none"
                  >
                    <span className="flex-1 text-[15px] font-bold text-content-main leading-tight">
                      {item.name}
                    </span>
                    {canExpand && (
                      <Icon
                        name="chevron"
                        className={clsx(
                          'w-4 h-4 shrink-0 text-content-muted transition-transform duration-300',
                          isExpanded && 'rotate-180'
                        )}
                      />
                    )}
                  </button>

                  {canManage && (
                    <div className="shrink-0 flex items-center gap-1">
                      <button
                        onClick={() => move(index, -1)}
                        disabled={index === 0 || saving}
                        className="w-8 h-8 rounded-lg bg-surface-level2 text-content-muted flex items-center justify-center outline-none disabled:opacity-30"
                        aria-label="Выше"
                      >
                        <Icon name="chevron" className="w-3.5 h-3.5 rotate-180" />
                      </button>
                      <button
                        onClick={() => move(index, 1)}
                        disabled={index === items.length - 1 || saving}
                        className="w-8 h-8 rounded-lg bg-surface-level2 text-content-muted flex items-center justify-center outline-none disabled:opacity-30"
                        aria-label="Ниже"
                      >
                        <Icon name="chevron" className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => removeItem(index)}
                        disabled={saving}
                        className="w-8 h-8 rounded-lg bg-surface-level2 text-content-muted flex items-center justify-center outline-none disabled:opacity-30"
                        aria-label="Убрать из плана"
                      >
                        <Icon name="close" className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Раскрытие: описание и анимация. Плавная высота через grid-строку —
                    тот же приём, что и в аккордеонах сайдбара */}
                <div className={clsx(
                  'grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
                  isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                )}>
                  <div className="overflow-hidden">
                    <div className="px-3 pb-3 flex flex-col gap-3">
                      {item.description && (
                        <p className="text-[14px] text-content-main leading-snug whitespace-pre-line">
                          {item.description}
                        </p>
                      )}

                      {/* Доска монтируется только в раскрытом пункте: анимация крутит
                          rAF, и держать её у восьми свёрнутых упражнений незачем */}
                      {isExpanded && item.board_json && (
                        <BoardPlayer scene={item.board_json} rinkType={item.rink_type} />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Шторка выбора упражнения из библиотеки ── */}
      <BottomSheet isOpen={isLibraryOpen} onClose={() => setIsLibraryOpen(false)}>
        <div className="flex flex-col gap-4 py-2">
          <h3 className="text-[18px] font-black text-content-main">Добавить упражнение</h3>

          <div className="relative">
            <Icon name="search" className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-content-subtle" />
            <input
              value={librarySearch}
              onChange={(e) => setLibrarySearch(e.target.value)}
              placeholder="Поиск по библиотеке"
              className="w-full pl-10 pr-3 py-3 rounded-xl bg-surface-level2 text-content-main text-[14px] outline-none border border-surface-border placeholder:text-content-subtle"
            />
          </div>

          <div className="max-h-[45vh] overflow-y-auto scrollbar-hide flex flex-col gap-2">
            {libraryLoading ? (
              <PageLoader />
            ) : library.length === 0 ? (
              <p className="text-[13px] text-content-muted text-center py-8 px-4 leading-snug">
                {librarySearch
                  ? 'По этому запросу ничего не нашлось'
                  : 'Библиотека пуста. Упражнения создаются в Кабинете тренера.'}
              </p>
            ) : (
              library.map(drill => (
                <button
                  key={drill.id}
                  onClick={() => addDrill(drill)}
                  className="flex flex-col items-start gap-0.5 p-3 rounded-xl bg-surface-level2 text-left outline-none active:scale-[0.99] transition-transform"
                >
                  <span className="text-[14px] font-bold text-content-main leading-tight">
                    {drill.name}
                  </span>
                  {drill.tags?.length > 0 && (
                    <span className="text-[11px] text-content-subtle truncate max-w-full">
                      {drill.tags.join(' · ')}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      </BottomSheet>

      <Toast
        isOpen={toast.isOpen}
        message={toast.message}
        type={toast.type}
        onClose={() => setToast(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
