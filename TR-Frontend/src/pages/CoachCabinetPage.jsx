import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Icon } from '../ui/Icon';
import { Toast } from '../ui/Toast';
import { FadeIn } from '../ui/FadeIn';
import { PageLoader } from '../ui/Loader';
import { ConfirmSheet } from '../ui/ConfirmSheet';
import { getAuthHeaders } from '../utils/helpers';
import { ShareDrillSheet } from '../components/CoachCabinet/ShareDrillSheet';
import { RINK_TYPES } from '../components/TacticalBoard/boardModel';

// Кабинет тренера — личная библиотека упражнений.
//
// Раздел намеренно не привязан ни к команде, ни к клубу: тренер работает с разными
// составами и меняет клубы, а методика остаётся его собственной. Поэтому здесь нет
// ни выбора команды в сайдбаре, ни teamId в запросах.
//
// Раскладка повторяет «Настройки»: заголовок живёт в системной шапке, под ней полоса
// с названием подраздела, ниже контент. Подраздел пока один, поэтому вместо сегментного
// переключателя стоит статичная полоса — она занимает тот же слот, и появление второго
// подраздела не сдвинет вёрстку.

const API = import.meta.env.VITE_API_URL || '';

const rinkLabel = (rinkType) => RINK_TYPES.find(t => t.id === rinkType)?.label || 'Площадка';

// Русское склонение для счётчика кадров: «1 кадр», «2 кадра», «5 кадров»
const framesLabel = (count) => {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${count} кадров`;
  if (mod10 === 1) return `${count} кадр`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} кадра`;
  return `${count} кадров`;
};

export function CoachCabinetPage() {
  const { openPanel100, openRightPanel, registerHeaderEdit } = useOutletContext();

  const [drills, setDrills] = useState([]);
  const [loading, setLoading] = useState(true);

  const [shareTarget, setShareTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [toast, setToast] = useState({ isOpen: false, message: '', type: 'success' });
  const notify = useCallback((message, type = 'success') => {
    setToast({ isOpen: true, message, type });
  }, []);

  const loadDrills = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/drills`, { headers: getAuthHeaders() });
      const json = await res.json();
      if (json.success) setDrills(json.drills || []);
    } catch {
      notify('Не удалось загрузить библиотеку', 'danger');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => { loadDrills(); }, [loadDrills]);

  // Карандашик в системной шапке открывает настройки оформления раздела
  useEffect(() => {
    if (!registerHeaderEdit) return;
    registerHeaderEdit(() => openRightPanel('coachSettings', {}, 'Настройки раздела'));
    return () => registerHeaderEdit(null);
  }, [registerHeaderEdit, openRightPanel]);

  const openDrill = (drillId) => {
    openPanel100(
      'drillDetails',
      {
        drillId,
        onNotify: notify,
        onSaved: () => { notify('Упражнение сохранено'); loadDrills(); },
      },
      drillId ? 'Упражнение' : 'Новое упражнение'
    );
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch(`${API}/api/drills/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const json = await res.json();

      if (!json.success) {
        notify(json.error || 'Не удалось удалить упражнение', 'danger');
        return;
      }

      notify('Упражнение удалено');
      setDeleteTarget(null);
      loadDrills();
    } catch {
      notify('Не удалось удалить упражнение', 'danger');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <FadeIn className="flex flex-col h-full overflow-hidden">

      {/* Полоса подраздела — тот же слот, что у сегментного переключателя в Настройках */}
      <div className="px-4 pb-3 shrink-0 shadow-lg bg-surface-base">
        <div className="w-full p-1 bg-surface-level1 rounded-2xl border border-surface-border shadow-inner">
          <div className="w-full py-2 text-center text-[14px] font-bold uppercase tracking-wider text-content-main">
            Библиотека упражнений
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide px-3 pt-4 pb-28">
        {loading ? (
          <PageLoader />
        ) : drills.length === 0 ? (
          <FadeIn>
            <div className="flex flex-col items-center text-center gap-3 py-16 px-6">
              <Icon name="training_tactics" className="w-12 h-12 text-content-subtle opacity-40" />
              <p className="text-[14px] text-content-muted leading-snug max-w-[260px]">
                Здесь копятся ваши упражнения. Создайте первое — потом их можно будет
                добавлять в план любой тренировки.
              </p>
            </div>
          </FadeIn>
        ) : (
          <div className="flex flex-col gap-3">
            {drills.map(drill => (
              <div
                key={drill.id}
                className="flex items-center gap-3 p-3 rounded-2xl bg-surface-level1 border border-surface-border shadow-md"
              >
                <button
                  onClick={() => openDrill(drill.id)}
                  className="flex-1 min-w-0 flex flex-col items-start gap-1 text-left outline-none"
                >
                  <span className="text-[15px] font-bold text-content-main leading-tight line-clamp-2">
                    {drill.name}
                  </span>

                  <span className="text-[11px] font-semibold text-content-muted uppercase tracking-wider">
                    {drill.board_enabled === false
                      ? 'Без планшета'
                      : `${rinkLabel(drill.rink_type)} · ${framesLabel(drill.frames_count)}`}
                  </span>

                  {/* Отметка держится до первого сохранения получателем — дальше
                      упражнение считается его собственным */}
                  {drill.shared_from_name && (
                    <span className="text-[11px] font-semibold text-brand">
                      от {drill.shared_from_name}
                    </span>
                  )}
                </button>

                <div className="shrink-0 flex items-center gap-1">
                  <button
                    onClick={() => setShareTarget(drill)}
                    className="w-9 h-9 rounded-xl bg-surface-level2 text-content-muted flex items-center justify-center outline-none active:scale-95 transition-transform"
                    aria-label="Поделиться"
                  >
                    <Icon name="share" className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(drill)}
                    className="w-9 h-9 rounded-xl bg-surface-level2 text-content-muted flex items-center justify-center outline-none active:scale-95 transition-transform"
                    aria-label="Удалить"
                  >
                    <Icon name="delete" className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="fixed bottom-6 right-6 z-40">
        <button
          type="button"
          onClick={() => openDrill(null)}
          className="w-14 h-14 rounded-full bg-brand shadow-2xl text-white flex items-center justify-center transition-all active:scale-90 border border-white/10"
          aria-label="Создать упражнение"
        >
          <Icon name="plus" className="w-6 h-6 stroke-[3]" />
        </button>
      </div>

      <ShareDrillSheet
        drill={shareTarget}
        isOpen={!!shareTarget}
        onClose={() => setShareTarget(null)}
        onNotify={notify}
      />

      <ConfirmSheet
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        isLoading={isDeleting}
        title="Удалить упражнение?"
        description={
          `«${deleteTarget?.name || ''}» исчезнет из библиотеки. В планах прошедших ` +
          'тренировок останется название, но детали упражнения станут недоступны.'
        }
        confirmLabel="Удалить"
      />

      <Toast
        isOpen={toast.isOpen}
        message={toast.message}
        type={toast.type}
        onClose={() => setToast(prev => ({ ...prev, isOpen: false }))}
      />
    </FadeIn>
  );
}
