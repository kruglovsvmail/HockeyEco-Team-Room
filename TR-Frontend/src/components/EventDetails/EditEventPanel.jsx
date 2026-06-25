import React, { useState, useMemo, useEffect, useCallback } from 'react';
import clsx from 'clsx';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

import { getAuthHeaders } from '../../utils/helpers';
import { useAccess } from '../../hooks/useAccess';
import { computeEventEditAccess } from './computeEventEditAccess';

import { Icon } from '../../ui/Icon';
import { HintPopover } from '../../ui/HintPopover';
import { TextInputLP, NativeDateInputLP, NativeTimeInputLP } from '../../ui/Input-LP';
import { ButtonLP } from '../../ui/Button-LP';
import { Toast } from '../../ui/Toast';
import { ConfirmSheet } from '../../ui/ConfirmSheet';
import { ArenaSelector } from '../Manager/ArenaSelector';

dayjs.extend(utc);
dayjs.extend(timezone);

// =========================================================================
// Универсальный блок-обёртка
// =========================================================================
const EventBlock = ({
  title, icon,
  hasRole, hasSubscription,
  popoverStatus = 'no_subscription',
  isEditing, isSaving,
  activeBrandColor,
  onToggleEdit,
  children
}) => {
  const accentColor = activeBrandColor || 'var(--color-brand)';
  if (!hasRole) return null;

  return (
    <div className="flex flex-col p-4 bg-surface-level1 border border-surface-border rounded-2xl shadow-sm mb-3 relative">
      {isSaving && (
        <div className="absolute inset-0 bg-surface-base/40 backdrop-blur-[1px] z-20 flex items-center justify-center rounded-2xl">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-level1 border border-surface-border rounded-xl shadow-md">
            <div className="w-3.5 h-3.5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: accentColor, borderTopColor: 'transparent' }} />
            <span className="text-[10px] font-bold uppercase tracking-wider text-content-muted">Сохранение...</span>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-3 border-b border-surface-border pb-1.5">
        <div className="flex items-center gap-2">
          {icon && <Icon name={icon} className="w-3.5 h-3.5" style={{ color: accentColor }} />}
          <span className="text-[10px] font-black uppercase text-content-main tracking-widest">{title}</span>
        </div>
        {onToggleEdit && (
          hasSubscription ? (
            <button
              onClick={onToggleEdit}
              className="transition-colors p-0.5 hover:opacity-80 outline-none cursor-pointer flex items-center justify-center"
              style={{ color: accentColor }}
            >
              <Icon name={isEditing ? 'close' : 'edit'} className="w-4 h-4" />
            </button>
          ) : (
            <HintPopover status={popoverStatus}>
              <div className="transition-colors p-0.5 opacity-30 flex items-center justify-center cursor-pointer" style={{ color: accentColor }}>
                <Icon name="edit" className="w-4 h-4" />
              </div>
            </HintPopover>
          )
        )}
      </div>

      <div className="flex flex-col">{children}</div>
    </div>
  );
};

// Текст подсказки в HintPopover
const HintText = ({ text }) => (
  <p className="text-[14px] font-semibold text-content-main text-center leading-snug">{text}</p>
);

// Обёртка для заблокированного поля редактирования.
// Сохраняет визуальную форму активного контрола (input/кнопка) и просто тушит её,
// клик по любому месту вызывает HintPopover с пояснением.
// [&_*]:pointer-events-none — отключает все события у потомков,
// чтобы клик гарантированно дошёл до wrapper-div и сработал HintPopover.
const LockedField = ({ hint, children }) => (
  <HintPopover customContent={<HintText text={hint} />}>
    <div className="cursor-pointer opacity-40 [&_*]:pointer-events-none select-none">
      {children}
    </div>
  </HintPopover>
);

// =========================================================================
// Главный компонент панели редактирования
// =========================================================================
export const EditEventPanel = ({ data, onClose }) => {
  const { event: initialEvent, user, selectedTeam, onEventUpdate, onEventDeleted } = data || {};
  const [event, setEvent] = useState(initialEvent);

  useEffect(() => { setEvent(initialEvent); }, [initialEvent?.event_id]);

  const isColorsEnabled = localStorage.getItem('tr_use_team_colors') !== 'false';
  const hasTeamColor = isColorsEnabled && !!event?.team_color;
  const activeBrandColor = hasTeamColor ? event.team_color : 'var(--color-brand)';

  const { checkAccess } = useAccess(user, selectedTeam);
  const { blocks } = useMemo(
    () => computeEventEditAccess(event, user, selectedTeam, checkAccess),
    [event, user, selectedTeam, checkAccess]
  );

  const eventType = event?.event_type;
  const isMatch = eventType === 'match';
  const isTraining = eventType?.includes('training');
  const isMeeting = eventType?.includes('meeting');

  const apiBase = isMatch ? '/api/matches' : isTraining ? '/api/trainings' : '/api/meetings';
  const eventId = event?.event_id || event?.id;
  const teamId = event?.my_team_id;
  const arenaTz = event?.arena_timezone || 'UTC';
  const targetDate = event?.event_date || event?.game_date;

  // Локальные правила «доступности» полей для матча (вытесняют изменения регламента лиги/инициатора)
  const matchScheduleLocked = useMemo(() => {
    if (!isMatch) return { date: false, time: false, arena: false, jersey: false };
    const isDateDisabled = event?.game_type === 'official' || event?.game_type === 'friendly_pwa';
    const isTimeDisabled = event?.game_type === 'official' ||
      (event?.game_type === 'friendly_pwa' && (
        Number(event?.initiator_team_id) !== Number(event?.my_team_id) ||
        event?.status !== 'pending'
      ));
    return {
      date: isDateDisabled,
      time: isTimeDisabled,
      arena: isTimeDisabled,
      jersey: isTimeDisabled
    };
  }, [event, isMatch]);

  const isMediaDisabled = isMatch && (
    event?.game_type === 'official' ||
    (event?.game_type === 'friendly_pwa' && Number(event?.initiator_team_id) !== Number(event?.my_team_id))
  );

  // Доступность удаления матча по типу.
  // ВАЖНО: для friendly_pwa удаления тут НЕТ — отмена идёт через карточку календаря
  // (кнопка «Отменить» → status=cancelled, автоудаление после game_date).
  // Здесь оставляем только внешние товарищеские и матчи внешних турниров.
  const canDeleteMatchByRule = isMatch && (
    event?.game_type === 'friendly_ext' ||
    event?.game_type === 'tournament_ext'
  );

  // -----------------------------------------------------------------------
  // Состояния редактирования
  // -----------------------------------------------------------------------
  const [editingBlock, setEditingBlock] = useState(null);
  const [savingBlock, setSavingBlock] = useState(null);
  const [toast, setToast] = useState({ isOpen: false, message: '', type: 'success' });
  const triggerToast = (message, type = 'success') => setToast({ isOpen: true, message, type });
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  // Schedule form
  const [gameDate, setGameDate] = useState('');
  const [gameTime, setGameTime] = useState('');
  const [selectedArenaId, setSelectedArenaId] = useState(null);
  const [selectedArenaName, setSelectedArenaName] = useState('');
  const [customTimezone, setCustomTimezone] = useState(null);
  const [locationUrl, setLocationUrl] = useState('');
  const [arenaSelectorOpen, setArenaSelectorOpen] = useState(false);

  // Finances form
  const [playerFee, setPlayerFee] = useState('');
  const [homeJersey, setHomeJersey] = useState('light');
  const [awayJersey, setAwayJersey] = useState('dark');

  // Media form
  const [ytUrl, setYtUrl] = useState('');
  const [vkUrl, setVkUrl] = useState('');

  // Подгружаем поля формы при открытии/смене блока редактирования
  useEffect(() => {
    if (!event) return;
    setGameDate(targetDate ? dayjs.utc(targetDate).tz(arenaTz).format('YYYY-MM-DD') : '');
    setGameTime(targetDate ? dayjs.utc(targetDate).tz(arenaTz).format('HH:mm') : '');
    setSelectedArenaId(event.arena_id ?? null);
    setSelectedArenaName(event.arena_name || '');
    setCustomTimezone(event.arena_timezone || null);
    setLocationUrl(event.location_url || '');

    const fee = event.my_fee;
    setPlayerFee(fee === null || fee === undefined ? '' : String(Math.round(Number(fee))));
    setHomeJersey(event.home_jersey_type || event.home_jersey || 'light');
    setAwayJersey(event.away_jersey_type || event.away_jersey || 'dark');

    setYtUrl(event.video_yt_url || '');
    setVkUrl(event.video_vk_url || '');
  }, [event, targetDate, arenaTz]);

  // Применяем патч к event локально и сообщаем наружу (в TeamLayout/sessionStorage)
  const applyPatch = (patch) => {
    setEvent(prev => ({ ...prev, ...patch }));
    if (onEventUpdate) onEventUpdate(patch);
    window.dispatchEvent(new CustomEvent('tr-events-updated'));
  };

  // -----------------------------------------------------------------------
  // Сохранения по блокам
  // -----------------------------------------------------------------------
  const saveSchedule = async () => {
    setSavingBlock('schedule');
    try {
      // Для тренировок/собраний CHECK-constraint требует: если arena_id NULL — обе колонки
      // location и location_url должны быть NOT NULL (пустая строка допустима).
      const useManualLocation = !selectedArenaId;
      const body = isMatch
        ? {
            date: gameDate, time: gameTime, arena_id: selectedArenaId,
            teamId, custom_timezone: customTimezone,
            location: selectedArenaId ? null : selectedArenaName,
            location_url: locationUrl,
          }
        : {
            teamId, eventType,
            date: gameDate, time: gameTime,
            arena_id: selectedArenaId || null,
            location: useManualLocation ? (selectedArenaName || '') : null,
            location_url: useManualLocation ? (locationUrl || '') : null,
            custom_timezone: customTimezone || null,
          };

      const res = await fetch(`${import.meta.env.VITE_API_URL}${apiBase}/${eventId}/schedule`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        triggerToast(errData.error || 'Не удалось сохранить расписание', 'danger');
        return;
      }

      const newDateIso = dayjs.tz(`${gameDate} ${gameTime}`, customTimezone || arenaTz).utc().format();
      applyPatch({
        event_date: newDateIso,
        game_date: newDateIso,
        arena_id: selectedArenaId,
        arena_name: selectedArenaName,
        arena_timezone: customTimezone || arenaTz,
        custom_timezone: customTimezone,
        location_url: locationUrl,
      });
      triggerToast('Расписание сохранено', 'success');
      setEditingBlock(null);
    } catch (err) {
      console.error(err);
      triggerToast('Ошибка соединения с сервером', 'danger');
    } finally {
      setSavingBlock(null);
    }
  };

  const saveFinances = async () => {
    setSavingBlock('finances');
    try {
      const body = isMatch
        ? {
            player_fee: playerFee === '' ? null : Number(playerFee),
            home_jersey_type: homeJersey,
            away_jersey_type: awayJersey,
            teamId,
          }
        : {
            teamId, eventType,
            player_fee: playerFee === '' ? null : Number(playerFee),
          };

      const res = await fetch(`${import.meta.env.VITE_API_URL}${apiBase}/${eventId}/finances`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        triggerToast(errData.error || 'Не удалось сохранить финансы', 'danger');
        return;
      }

      applyPatch({
        my_fee: playerFee === '' ? null : Number(playerFee),
        ...(isMatch ? { home_jersey_type: homeJersey, away_jersey_type: awayJersey } : {}),
      });
      triggerToast('Финансы сохранены', 'success');
      setEditingBlock(null);
    } catch (err) {
      console.error(err);
      triggerToast('Ошибка соединения с сервером', 'danger');
    } finally {
      setSavingBlock(null);
    }
  };

  const saveMedia = async () => {
    setSavingBlock('media');
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/matches/${eventId}/media`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_yt_url: ytUrl, video_vk_url: vkUrl, teamId }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        triggerToast(errData.error || 'Не удалось сохранить трансляции', 'danger');
        return;
      }
      applyPatch({ video_yt_url: ytUrl, video_vk_url: vkUrl });
      triggerToast('Ссылки сохранены', 'success');
      setEditingBlock(null);
    } catch (err) {
      console.error(err);
      triggerToast('Ошибка соединения с сервером', 'danger');
    } finally {
      setSavingBlock(null);
    }
  };

  const deleteEvent = async () => {
    setSavingBlock('delete');
    try {
      const url = isMatch
        ? `${import.meta.env.VITE_API_URL}${apiBase}/${eventId}?teamId=${teamId}`
        : `${import.meta.env.VITE_API_URL}${apiBase}/${eventId}?teamId=${teamId}&eventType=${eventType}`;
      const res = await fetch(url, { method: 'DELETE', headers: getAuthHeaders() });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        triggerToast(errData.error || 'Не удалось удалить', 'danger');
        return;
      }
      window.dispatchEvent(new CustomEvent('tr-events-updated'));
      triggerToast('Событие удалено', 'success');
      setConfirmDeleteOpen(false);
      setTimeout(() => {
        if (onClose) onClose();
        // Уводим пользователя обратно на календарь — overlay-события без данных не имеет смысла
        if (onEventDeleted) onEventDeleted();
      }, 600);
    } catch (err) {
      console.error(err);
      triggerToast('Ошибка соединения с сервером', 'danger');
    } finally {
      setSavingBlock(null);
    }
  };

  if (!event) return null;

  // Тексты подсказок при заблокированных полях расписания матча
  const dateHint = event?.game_type === 'official'
    ? 'Запрещено менять дату официального матча лиги'
    : 'Запрещено менять дату товарищеского матча с соперником внутри приложения';
  const timeHint = event?.game_type === 'official'
    ? 'Запрещено менять время официального матча'
    : Number(event?.initiator_team_id) !== Number(event?.my_team_id)
      ? 'Только команда-инициатор может менять время начала'
      : 'Нельзя изменить время после подтверждения матча соперником';
  const arenaHint = event?.game_type === 'official'
    ? 'Локация официального матча регламентируется лигой'
    : 'Локация заблокирована (матч подтверждён или вы не команда-инициатор)';
  const jerseyHint = event?.game_type === 'official'
    ? 'Комплекты формы официального матча регламентируются лигой'
    : 'Форма заблокирована (матч подтверждён или вы не команда-инициатор)';
  const mediaHint = event?.game_type === 'official'
    ? 'В официальных матчах ссылки регламентируются лигой'
    : 'Медиа-ссылки PWA-встречи может менять только команда-инициатор';

  const allMatchScheduleDisabled = isMatch &&
    matchScheduleLocked.date && matchScheduleLocked.time && matchScheduleLocked.arena;

  const eventDateObj = targetDate ? dayjs.utc(targetDate).tz(arenaTz) : null;
  const dateDisplay = eventDateObj ? eventDateObj.format('DD.MM.YYYY') : '—';
  const timeDisplay = eventDateObj ? eventDateObj.format('HH:mm') : '—:——';

  // Подэкран: выбор арены/локации заменяет содержимое всей панели
  if (arenaSelectorOpen) {
    return (
      <div className="h-full w-full flex flex-col bg-surface-level2 overflow-hidden">
        <div className="flex items-center gap-3 px-4 h-[52px] shrink-0 border-b border-surface-border">
          <button
            type="button"
            onClick={() => setArenaSelectorOpen(false)}
            className="p-1.5 -ml-1 text-content-muted hover:text-brand transition-colors outline-none cursor-pointer active:scale-95 flex items-center"
          >
            <Icon name="chevron_left" className="w-6 h-6 text-content-main" />
          </button>
          <span className="text-[14px] font-black uppercase tracking-widest text-content-main">Выбор локации</span>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          <ArenaSelector data={{
            teamId,
            currentTeamColor: activeBrandColor,
            selectedArenaId,
            selectedArenaName,
            locationUrl,
            onSelect: (arena) => {
              setSelectedArenaId(arena.id);
              setSelectedArenaName(arena.name);
              if (arena.custom_timezone) setCustomTimezone(arena.custom_timezone);
              if (arena.location_url) setLocationUrl(arena.location_url);
              setArenaSelectorOpen(false);
            }
          }} />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col bg-surface-level2 overflow-y-auto scrollbar-hide p-4 pb-10">

      {/* ───────────── БЛОК: РАСПИСАНИЕ ───────────── */}
      {blocks.schedule?.hasRole && (
        <EventBlock
          title="Расписание"
          icon="calendar"
          hasRole={blocks.schedule.hasRole}
          hasSubscription={blocks.schedule.hasSubscription}
          isEditing={editingBlock === 'schedule'}
          isSaving={savingBlock === 'schedule'}
          activeBrandColor={activeBrandColor}
          onToggleEdit={() => setEditingBlock(prev => prev === 'schedule' ? null : 'schedule')}
        >
          {editingBlock === 'schedule' ? (
            <div className="flex flex-col gap-4 pt-1">
              <div className="grid grid-cols-2 gap-3">
                {/* Дата */}
                <div className="flex w-[114px] flex-col ">
                  <span className={clsx('text-[10px] text-content-muted uppercase tracking-widest font-bold', isMatch && matchScheduleLocked.date && 'opacity-40')}>Дата</span>
                  {isMatch && matchScheduleLocked.date ? (
                    <LockedField hint={dateHint}>
                      <NativeDateInputLP value={gameDate} onChange={() => {}} disabled activeColor={activeBrandColor} />
                    </LockedField>
                  ) : (
                    <NativeDateInputLP value={gameDate} onChange={setGameDate} disabled={savingBlock === 'schedule'} activeColor={activeBrandColor} />
                  )}
                </div>

                {/* Время */}
                <div className="flex flex-col ml-5 ">
                  <span className={clsx('text-[10px] text-content-muted uppercase tracking-widest font-bold', isMatch && matchScheduleLocked.time && 'opacity-40')}>Время</span>
                  {isMatch && matchScheduleLocked.time ? (
                    <LockedField hint={timeHint}>
                      <NativeTimeInputLP value={gameTime} onChange={() => {}} disabled activeColor={activeBrandColor} />
                    </LockedField>
                  ) : (
                    <NativeTimeInputLP value={gameTime} onChange={setGameTime} disabled={savingBlock === 'schedule'} activeColor={activeBrandColor} />
                  )}
                </div>
              </div>

              {/* Локация */}
              <div className="flex flex-col gap-1.5">
                <span className={clsx('text-[10px] text-content-muted uppercase tracking-widest font-bold', isMatch && matchScheduleLocked.arena && 'opacity-40')}>Локация</span>
                {isMatch && matchScheduleLocked.arena ? (
                  <LockedField hint={arenaHint}>
                    <button type="button"
                      className="w-full p-4 bg-surface-level2 border border-surface-border rounded-2xl text-left flex items-center justify-between outline-none">
                      <span className="text-[14px] font-bold text-content-main truncate pr-2">{selectedArenaName || 'Не назначена'}</span>
                      <Icon name="chevron_right" className="w-4 h-4 text-content-subtle shrink-0" />
                    </button>
                  </LockedField>
                ) : (
                  <button type="button" onClick={() => setArenaSelectorOpen(true)}
                    className="w-full p-4 bg-surface-level2 border border-surface-border hover:border-brand/40 rounded-2xl text-left flex items-center justify-between outline-none transition-all active:scale-[0.99] cursor-pointer">
                    <span className="text-[14px] font-bold text-content-main truncate pr-2">{selectedArenaName || 'Выбрать локацию'}</span>
                    <Icon name="chevron_right" className="w-4 h-4 text-content-subtle shrink-0" />
                  </button>
                )}
              </div>

              <ButtonLP
                variant="primary"
                onClick={saveSchedule}
                disabled={savingBlock === 'schedule' || allMatchScheduleDisabled}
                activeColor={activeBrandColor}
                className="w-full flex items-center justify-center gap-2 mt-4 py-2.5"
              >
                <span>Сохранить</span>
              </ButtonLP>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <InfoRow label="Дата" value={dateDisplay} />
              <InfoRow label="Время" value={timeDisplay} />
              <InfoRow label="Локация" value={event.arena_name || '—'} />
            </div>
          )}
        </EventBlock>
      )}

      {/* ───────────── БЛОК: ФИНАНСЫ ───────────── */}
      {blocks.finances?.hasRole && (
        <EventBlock
          title={isMatch ? 'Взнос и форма' : 'Взнос'}
          icon={isMatch ? 'jersey' : 'currency'}
          hasRole={blocks.finances.hasRole}
          hasSubscription={blocks.finances.hasSubscription}
          isEditing={editingBlock === 'finances'}
          isSaving={savingBlock === 'finances'}
          activeBrandColor={activeBrandColor}
          onToggleEdit={() => setEditingBlock(prev => prev === 'finances' ? null : 'finances')}
        >
          {editingBlock === 'finances' ? (
            <div className="flex flex-col gap-4 pt-1">
              <TextInputLP
                label="Стоимость взноса с игрока (₽)"
                placeholder="Введите сумму..."
                type="number"
                value={playerFee}
                onChange={setPlayerFee}
                disabled={savingBlock === 'finances'}
                activeColor={activeBrandColor}
              />

              {isMatch && (
                <>
                  {/* Форма хозяев */}
                  <div className="flex flex-col gap-2">
                    <span className={clsx('text-[10px] text-content-muted font-bold uppercase tracking-wider', matchScheduleLocked.jersey && 'opacity-40')}>Форма ХОЗЯЕВА</span>
                    <div className="flex gap-2">
                      {['light', 'dark'].map(type => {
                        const label = type === 'light' ? 'Светлая' : 'Тёмная';
                        const isActive = homeJersey === type;
                        return matchScheduleLocked.jersey ? (
                          <HintPopover key={type} customContent={<HintText text={jerseyHint} />} className="flex-1">
                            <div className={clsx('w-full py-2 rounded-xl border text-[14px] font-bold text-center opacity-30 cursor-pointer select-none',
                              isActive ? 'bg-surface-level3' : 'bg-surface-level1 border-surface-border text-content-subtle')}
                              style={isActive ? { borderColor: activeBrandColor, color: activeBrandColor } : {}}>{label}</div>
                          </HintPopover>
                        ) : (
                          <button key={type} type="button" disabled={savingBlock === 'finances'} onClick={() => setHomeJersey(type)}
                            className={clsx('flex-1 py-2 rounded-xl border text-[14px] font-bold transition-all outline-none',
                              isActive ? 'bg-surface-level3' : 'bg-surface-level1 border-surface-border text-content-subtle')}
                            style={isActive ? { borderColor: activeBrandColor, color: activeBrandColor } : {}}>{label}</button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Форма гостей */}
                  <div className="flex flex-col gap-2">
                    <span className={clsx('text-[10px] text-content-muted font-bold uppercase tracking-wider', matchScheduleLocked.jersey && 'opacity-40')}>Форма ГОСТИ</span>
                    <div className="flex gap-2">
                      {['light', 'dark'].map(type => {
                        const label = type === 'light' ? 'Светлая' : 'Тёмная';
                        const isActive = awayJersey === type;
                        return matchScheduleLocked.jersey ? (
                          <HintPopover key={type} customContent={<HintText text={jerseyHint} />} className="flex-1">
                            <div className={clsx('w-full py-2 rounded-xl border text-[14px] font-bold text-center opacity-30 cursor-pointer select-none',
                              isActive ? 'bg-surface-level3' : 'bg-surface-level1 border-surface-border text-content-subtle')}
                              style={isActive ? { borderColor: activeBrandColor, color: activeBrandColor } : {}}>{label}</div>
                          </HintPopover>
                        ) : (
                          <button key={type} type="button" disabled={savingBlock === 'finances'} onClick={() => setAwayJersey(type)}
                            className={clsx('flex-1 py-2 rounded-xl border text-[14px] font-bold transition-all outline-none',
                              isActive ? 'bg-surface-level3' : 'bg-surface-level1 border-surface-border text-content-subtle')}
                            style={isActive ? { borderColor: activeBrandColor, color: activeBrandColor } : {}}>{label}</button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}

              <ButtonLP
                variant="primary"
                onClick={saveFinances}
                disabled={savingBlock === 'finances'}
                activeColor={activeBrandColor}
                className="w-full flex items-center justify-center gap-2 mt-4 py-2.5"
              >
                <span>Сохранить</span>
              </ButtonLP>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <InfoRow
                label="Взнос"
                value={event.my_fee === null || event.my_fee === undefined
                  ? 'Не назначен'
                  : Number(event.my_fee) === 0 ? 'Бесплатно' : `${Number(event.my_fee).toLocaleString('ru-RU')} ₽`}
              />
              {isMatch && (
                <>
                  <InfoRow label="Форма хозяев" value={(event.home_jersey_type || event.home_jersey) === 'dark' ? 'Тёмная' : 'Светлая'} />
                  <InfoRow label="Форма гостей" value={(event.away_jersey_type || event.away_jersey) === 'dark' ? 'Тёмная' : 'Светлая'} />
                </>
              )}
            </div>
          )}
        </EventBlock>
      )}

      {/* ───────────── БЛОК: ТРАНСЛЯЦИИ (только match) ───────────── */}
      {isMatch && blocks.media?.hasRole && (
        <EventBlock
          title="Ссылки трансляций"
          icon="live_stream"
          hasRole={blocks.media.hasRole}
          hasSubscription={blocks.media.hasSubscription}
          isEditing={editingBlock === 'media'}
          isSaving={savingBlock === 'media'}
          activeBrandColor={activeBrandColor}
          onToggleEdit={() => setEditingBlock(prev => prev === 'media' ? null : 'media')}
        >
          {editingBlock === 'media' ? (
            <div className={clsx('flex flex-col gap-4 transition-opacity duration-200', isMediaDisabled && 'opacity-30 pointer-events-none')}>
              {isMediaDisabled && (
                <HintPopover customContent={<HintText text={mediaHint} />}>
                  <div className="text-[10px] text-content-muted text-center py-1 cursor-pointer">Редактирование заблокировано</div>
                </HintPopover>
              )}
              <TextInputLP
                label="Ссылка 1 (YouTube)"
                placeholder="https://youtube.com/live/..."
                value={ytUrl}
                onChange={setYtUrl}
                disabled={isMediaDisabled || savingBlock === 'media'}
                activeColor={activeBrandColor}
              />
              <TextInputLP
                label="Ссылка 2 (VK Видео)"
                placeholder="https://vk.com/video..."
                value={vkUrl}
                onChange={setVkUrl}
                disabled={isMediaDisabled || savingBlock === 'media'}
                activeColor={activeBrandColor}
              />
              <ButtonLP
                variant="primary"
                onClick={saveMedia}
                disabled={isMediaDisabled || savingBlock === 'media'}
                activeColor={activeBrandColor}
                className="w-full flex items-center justify-center gap-2 mt-4 py-2.5"
              >
                <span>Сохранить</span>
              </ButtonLP>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <InfoRow label="Трансляция 1" value={event.video_yt_url ? 'Есть ссылка' : 'Нет ссылки'} />
              <InfoRow label="Трансляция 2" value={event.video_vk_url ? 'Есть ссылка' : 'Нет ссылки'} />
            </div>
          )}
        </EventBlock>
      )}

      {/* ───────────── БЛОК: УДАЛЕНИЕ ───────────── */}
      {blocks.delete?.hasRole && (isMatch ? canDeleteMatchByRule : true) && (
        <div className="mt-3">
          {blocks.delete.hasSubscription ? (
            <ButtonLP
              variant="outline"
              disabled={savingBlock === 'delete'}
              onClick={() => setConfirmDeleteOpen(true)}
              className="w-full py-3 text-danger normal-case font-bold text-[14px] rounded-2xl active:scale-[0.98] flex items-center justify-center gap-2"
            >
              {savingBlock === 'delete' ? 'Удаление...' : `Удалить ${isMatch ? 'матч' : isTraining ? 'тренировку' : 'собрание'}`}
            </ButtonLP>
          ) : (
            <HintPopover status="no_subscription" className="w-full block">
              <div className="w-full py-3 text-center normal-case font-bold text-[14px] rounded-2xl opacity-40 cursor-pointer border border-surface-border">
                Удалить {isMatch ? 'матч' : isTraining ? 'тренировку' : 'собрание'}
              </div>
            </HintPopover>
          )}
        </div>
      )}

      <ConfirmSheet
        isOpen={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        onConfirm={deleteEvent}
        isLoading={savingBlock === 'delete'}
        title={`Удалить ${isMatch ? 'матч' : isTraining ? 'тренировку' : 'собрание'}?`}
        description={<>Это действие необратимо. {isMatch ? 'Матч' : isTraining ? 'Тренировка' : 'Собрание'} будет удалено из календаря безвозвратно.</>}
        confirmLabel="Да, удалить"
        variant="danger"
      />

      <Toast
        isOpen={toast.isOpen}
        message={toast.message}
        type={toast.type}
        onClose={() => setToast(prev => ({ ...prev, isOpen: false }))}
        activeColor={activeBrandColor}
      />
    </div>
  );
};

// Внутренний хелпер вывода строки данных
const InfoRow = ({ label, value }) => (
  <div className="flex items-center justify-between py-1.5">
    <span className="text-[12px] font-bold text-content-muted uppercase tracking-wider">{label}</span>
    <span className="text-[14px] font-bold text-content-main text-right truncate ml-2">{value || '—'}</span>
  </div>
);
