import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import { Icon } from '../ui/Icon';
import { ButtonLP } from '../ui/Button-LP';
import { getImageUrl, getPortalRoot } from '../utils/helpers';

dayjs.locale('ru');

const fullName = (p) => [p?.last_name, p?.first_name, p?.middle_name].filter(Boolean).join(' ').trim();

/**
 * Окно «лига добавила игрока в вашу команду». Лига в LMS вносит человека в заявку
 * по общей базе пользователей, и сервер сам вводит его в команду и её игровой состав —
 * без участия команды. Поэтому владелец и руководитель узнают об этом при первом
 * заходе: кто добавлен, в какую заявку и кто из сотрудников лиги это сделал.
 *
 * Устроено как окно обновления: закрывается только кнопкой, чтобы его прочитали.
 * Уведомлений может прийти несколько — TeamLayout показывает их по одному, в порядке
 * событий, и после каждого отмечает показанное на сервере.
 */
export function LeagueRosterNoticeModal({ notice, onClose }) {
  const [isClosing, setIsClosing] = useState(false);

  if (!notice) return null;

  const players = notice.players || [];
  const many = players.length > 1;
  const addedBy = fullName({
    last_name: notice.added_by_last_name,
    first_name: notice.added_by_first_name,
    middle_name: notice.added_by_middle_name,
  });

  // Кнопка не должна принять второй клик, пока следующее окно не сменило это
  const handleClose = () => {
    if (isClosing) return;
    setIsClosing(true);
    Promise.resolve(onClose?.()).finally(() => setIsClosing(false));
  };

  return createPortal(
    <div className="absolute inset-0 z-[340] flex items-center justify-center p-4 animate-fade-in pointer-events-auto">
      {/* Оверлей без onClick — окно закрывается только кнопкой */}
      <div className="absolute inset-0 bg-overlay backdrop-blur-md" />

      <div className="bg-surface-level1 border border-surface-border rounded-3xl w-full max-w-sm p-6 shadow-2xl relative z-10 flex flex-col gap-5 animate-scale-in text-left">

        <div className="flex items-center gap-3 border-b border-surface-level2 pb-3">
          <div className="w-10 h-10 rounded-xl bg-brand/10 text-brand flex items-center justify-center shrink-0 overflow-hidden">
            {notice.league_logo_url ? (
              <img src={getImageUrl(notice.league_logo_url)} alt="" className="w-full h-full object-contain p-1" />
            ) : (
              <Icon name="user_plus" className="w-5 h-5" strokeWidth={2.5} />
            )}
          </div>
          <div className="flex flex-col min-w-0">
            <h3 className="text-[14px] font-black text-content-main uppercase tracking-wider leading-none">
              {many ? 'Игроки от лиги' : 'Игрок от лиги'}
            </h3>
            <span className="text-[10px] font-bold text-content-muted uppercase tracking-widest mt-1 block truncate">
              {notice.league_name}
            </span>
          </div>
        </div>

        <p className="text-[14px] text-content-main font-medium leading-relaxed">
          Лига «{notice.league_name}» добавила в вашу команду «{notice.team_name}»{' '}
          {many ? (
            <>игроков, сразу включив их в заявку в дивизион «{notice.division_name}»:</>
          ) : (
            <>
              игрока <span className="font-black">{fullName(players[0])}</span>, сразу включив его
              в заявку в дивизион «{notice.division_name}».
            </>
          )}
        </p>

        {many && (
          <ul className="flex flex-col gap-1.5 pl-1 max-h-[30vh] overflow-y-auto scrollbar-hide">
            {players.map(p => (
              <li key={p.id} className="flex items-start gap-2 text-[14px] text-content-main font-bold leading-relaxed">
                <span className="text-brand shrink-0 mt-1.5 select-none text-[10px]">•</span>
                <span>{fullName(p)}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center gap-3 bg-surface-level2 border border-surface-border rounded-2xl px-4 py-3">
          <Icon name="users" className="w-4 h-4 text-content-muted shrink-0" strokeWidth={2.5} />
          <div className="flex flex-col min-w-0">
            <span className="text-[10px] font-bold text-content-muted uppercase tracking-widest">
              Добавил сотрудник лиги
            </span>
            <span className="text-[14px] font-black text-content-main leading-tight mt-0.5 truncate">
              {addedBy || 'Администрация лиги'}
            </span>
            <span className="text-[11px] font-medium text-content-muted mt-0.5">
              {dayjs(notice.created_at).format('D MMMM YYYY, HH:mm')}
            </span>
          </div>
        </div>

        <p className="text-[12px] text-content-muted font-medium leading-relaxed">
          {many ? 'Игроки уже в игровом составе команды' : 'Игрок уже в игровом составе команды'} — номер
          назначен первым свободным, амплуа можно поправить в разделе «Моя команда».
        </p>

        <div className="flex gap-3 w-full pt-4 border-t border-surface-level2">
          <ButtonLP
            variant="primary"
            onClick={handleClose}
            isLoading={isClosing}
            disabled={isClosing}
            className="flex-1 !h-11 !text-[10px] !font-black !uppercase !tracking-widest shadow-md"
          >
            Понятно
          </ButtonLP>
        </div>

      </div>
    </div>,
    getPortalRoot()
  );
}
