import React, { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { BottomSheet } from '../../../ui/BottomSheet';
import { ButtonLP } from '../../../ui/Button-LP';
import { CheckboxLP } from '../../../ui/Checkbox-LP';
import { Avatar } from '../../../ui/Avatar';
import { PageLoader } from '../../../ui/Loader';
import { DisqualificationBadge } from '../../../ui/DisqualificationBadge';
import { getAuthHeaders } from '../../../utils/helpers';

// Подписи ролей — и турнирных (заявка на сезон), и командных (штаб). В заявке главного
// тренера нет, он подаётся тренером; в штабе команды главный тренер — отдельная роль.
const ROLE_LABELS = {
  team_manager: 'Руководитель',
  team_admin: 'Администратор',
  head_coach: 'Главный тренер',
  coach: 'Тренер',
};

// Шторка отправки заявки на матч: кто из штаба едет на матч, руководитель выбирает
// руками, а не получает всех из заявки на сезон разом. Игроков она не трогает —
// их сервер собирает сам из расстановки или явки, как и раньше. Кнопка «Отправить»
// живёт здесь, а не на вкладке: без выбора представителей заявка не уходит.
//
// Кандидаты: в официальном матче — допущенные лигой представители из заявки на сезон,
// в товарищеском — штаб команды. Выбор по человеку: все его роли едут вместе.
// Без представителей отправить можно — это осознанный выбор, а не ошибка.
export function RosterStaffSheet({ isOpen, onClose, event, activeColor, isSubmitting, isPublished, onSubmit }) {
  const [candidates, setCandidates] = useState([]);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const isOfficial = event?.game_type === 'official';

  useEffect(() => {
    if (!isOpen || !event?.event_id || !event?.my_team_id) return;
    let cancelled = false;
    setIsLoading(true);
    setError('');
    (async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_URL || '';
        const res = await fetch(
          `${apiUrl}/api/matches/${event.event_id}/roster-staff?teamId=${event.my_team_id}`,
          { headers: getAuthHeaders() }
        );
        const data = await res.json();
        if (cancelled) return;
        if (data.success) {
          setCandidates(data.candidates || []);
          // При повторном открытии галочки стоят на тех, кого отправили в прошлый раз
          setSelectedIds(new Set((data.selected || []).map(Number)));
        } else {
          setError(data.error || 'Не удалось загрузить представителей');
        }
      } catch {
        if (!cancelled) setError('Не удалось загрузить представителей: сервер не отвечает');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, event?.event_id, event?.my_team_id]);

  const isBlocked = (person) => person.active_disqualifications?.length > 0;

  const toggle = (person) => {
    if (isBlocked(person) || isSubmitting) return;
    const id = Number(person.user_id);
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Наказание могло прилететь уже после прошлой отправки — такого из выбора вычёркиваем,
  // иначе сервер откажет всей заявке из-за галочки, которую руководитель не ставил.
  const submittableIds = useMemo(
    () => candidates.filter(c => selectedIds.has(Number(c.user_id)) && !isBlocked(c)).map(c => Number(c.user_id)),
    [candidates, selectedIds]
  );

  const rolesLabel = (person) =>
    (person.roles || []).map(r => ROLE_LABELS[r]).filter(Boolean).join(', ');

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      footer={(
        <ButtonLP
          onClick={() => onSubmit(submittableIds)}
          isLoading={isSubmitting}
          disabled={isLoading || isSubmitting}
          activeColor={activeColor}
          className="!h-12 !text-[14px]"
        >
          {isPublished ? 'Отправить заново' : 'Отправить'}
          {submittableIds.length > 0 ? ` (${submittableIds.length})` : ''}
        </ButtonLP>
      )}
    >
      <div className="flex flex-col gap-4 py-2 text-left">
        <div className="flex flex-col gap-1">
          <h3 className="text-[18px] font-black text-content-main">Представители на матч</h3>

        </div>

        {isLoading ? (
          <div className="py-8"><PageLoader /></div>
        ) : error ? (
          <div className="p-3 rounded-xl bg-danger-muted text-danger text-[14px] font-normal">{error}</div>
        ) : candidates.length === 0 ? (
          <div className="text-center py-6 text-[14px] font-bold text-content-muted opacity-60">
            {isOfficial
              ? 'В заявке на сезон нет допущенных представителей'
              : 'В штабе команды никого нет'}
          </div>
        ) : (
          <div className="flex flex-col gap-2 max-h-[50vh] overflow-y-auto scrollbar-hide">
            {candidates.map(person => {
              const blocked = isBlocked(person);
              const checked = selectedIds.has(Number(person.user_id));
              return (
                <div
                  key={person.user_id}
                  onClick={() => toggle(person)}
                  className={clsx(
                    "w-full py-3 px-4 border border-surface-border rounded-xl flex items-center justify-between bg-surface-level2 select-none transition-all",
                    blocked ? "opacity-50" : "cursor-pointer active:scale-[0.995]"
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar
                      photoUrl={person.team_photo || person.avatar_url}
                      firstName={person.first_name}
                      lastName={person.last_name}
                      className="w-10 h-10 rounded-xl"
                    />
                    <div className="flex flex-col min-w-0 text-left">
                      <span className="text-[14px] font-bold text-content-main truncate">
                        {person.last_name} {person.first_name}
                      </span>
                      <span className="text-[11px] mt-0.5 leading-tight truncate text-content-muted font-medium">
                        {rolesLabel(person) || 'Представитель'}
                      </span>
                    </div>
                  </div>
                  {blocked ? (
                    <DisqualificationBadge activeDisqualifications={person.active_disqualifications} className="ml-2 shrink-0" />
                  ) : (
                    // Клик обрабатывает строка целиком — чекбокс только показывает состояние
                    <div className="pointer-events-none shrink-0">
                      <CheckboxLP checked={checked} onChange={() => {}} activeColor={activeColor} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!isLoading && !error && (
          <span className="text-[11px] font-medium text-content-subtle leading-relaxed">
            Заявку можно отправить и без представителей. Состав игроков соберётся из расстановки, а если её нет — из отметившихся на матч.
          </span>
        )}
      </div>
    </BottomSheet>
  );
}
