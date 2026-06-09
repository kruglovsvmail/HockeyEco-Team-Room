import React, { useState, useEffect, useMemo, useRef } from 'react';
import { getImageUrl, getAuthHeaders } from '../../../utils/helpers';
import { BottomSheet } from '../../../ui/BottomSheet';
import { ButtonLP } from '../../../ui/Button-LP';
import { SectionHeader } from '../../../ui/SectionHeader';
import { useAccess } from '../../../hooks/useAccess';
import { ROLES, PERMISSIONS } from '../../../utils/permissions';
import { Avatar } from '../../../ui/Avatar';
import { Icon } from '../../../ui/Icon';
import { ContainerContent } from '../../../ui/ContainerContent';
import { HintPopover } from '../../../ui/HintPopover';
import clsx from 'clsx';
import { PageLoader } from '../../../ui/Loader';
import { FadeIn } from '../../../ui/FadeIn';

const getSafeUserFromToken = () => {
  try {
    const auth = getAuthHeaders().Authorization;
    if (!auth) return null;
    const token = auth.replace('Bearer ', '');
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
};

export const MatchAttendance = ({ event, initialAttendees = [], initialTeamRoster = [], initialStaffMembers = [], initialDraftLines = [], refreshData }) => {
  const [attendees, setAttendees] = useState(initialAttendees);
  const [teamRoster, setTeamRoster] = useState(initialTeamRoster);
  const [hasManageAccess, setHasManageAccess] = useState(false);

  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [sheetFilterType, setSheetFilterType] = useState('skater'); // 'goalie' или 'skater'
  
  const [isEditMode, setIsEditMode] = useState(false);
  const [userToRemove, setUserToRemove] = useState(null); 
  
  const [animatingInId, setAnimatingInId] = useState(null);
  const [animatingOutId, setAnimatingOutId] = useState(null);
  const [savingPlayerId, setSavingPlayerId] = useState(null);

  const pressTimer = useRef(null);

  // СТАБИЛЬНОЕ ИЗВЛЕЧЕНИЕ ДАННЫХ АВТОРИЗАЦИИ ИЗ КЭША ДЛЯ ЗАЩИТЫ ОТ ПОТЕРИ КОНТЕКСТА OUTLET В ШТОРКЕ ГЕЙМ-ЦЕНТРА
  const localUser = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('teampwa_user') || localStorage.getItem('teampwa_cached_user'));
    } catch { return null; }
  }, []);

  const localTeam = useMemo(() => {
    try {
      if (!localUser || !event?.my_team_id) return null;
      return localUser.teams?.find(t => String(t.id) === String(event.my_team_id));
    } catch { return null; }
  }, [localUser, event?.my_team_id]);

  const { user, checkAccess, selectedTeam } = useAccess(localUser, localTeam);

  const tokenUser = getSafeUserFromToken();
  const activeUserId = user?.id || tokenUser?.id || tokenUser?.userId;

  // Динамическое определение флага включения цветов из localStorage (по дефолту true)
  const isColorsEnabled = localStorage.getItem('tr_use_team_colors') !== 'false';
  const hasTeamColor = isColorsEnabled && !!event?.team_color;
  const activeBrandColor = hasTeamColor ? event.team_color : 'var(--color-brand)';

  // Проверка наличия полной подписки (тарифа) на управление явками
  const hasAttendanceSubscription = checkAccess('ATTENDANCE_MANAGE', event?.my_team_id);

  // Реактивная синхронизация локального стейта с централизованным хранилищем родителя матча
  useEffect(() => {
    setAttendees(initialAttendees);
  }, [initialAttendees]);

  useEffect(() => {
    setTeamRoster(initialTeamRoster);
  }, [initialTeamRoster]);

  // Вычисление наличия роли менеджера/администратора/тренера (независимо от статуса подписки)
  const isAttendanceManagerRole = useMemo(() => {
    const activeGlobalRole = String(user?.global_role || user?.globalRole || tokenUser?.global_role || tokenUser?.globalRole || '').toLowerCase();
    if (activeGlobalRole === 'admin') return true;

    const allowedRoles = PERMISSIONS.ATTENDANCE_MANAGE?.allowedRoles || 
                         (Array.isArray(PERMISSIONS.ATTENDANCE_MANAGE) ? PERMISSIONS.ATTENDANCE_MANAGE : []);
    const allowedLow = allowedRoles.map(r => String(r).toLowerCase());

    if (selectedTeam?.user_role) {
      const teamRoles = selectedTeam.user_role.split(',').map(r => r.trim().toLowerCase());
      if (teamRoles.some(r => allowedLow.includes(r))) return true;
    }

    if (initialStaffMembers && activeUserId) {
      const myStaffRecord = initialStaffMembers.find(s => String(s.user_id) === String(activeUserId));
      if (myStaffRecord && myStaffRecord.roles) {
        const myRoles = myStaffRecord.roles.split(',').map(r => r.trim().toLowerCase());
        if (myRoles.some(r => allowedLow.includes(r))) return true;
      }
    }
    return false;
  }, [user, tokenUser, selectedTeam, initialStaffMembers, activeUserId]);

  // Синхронизируем вычисленную роль с оригинальным состоянием hasManageAccess
  useEffect(() => {
    setHasManageAccess(isAttendanceManagerRole);
  }, [isAttendanceManagerRole]);

  // Проверка: находится ли удаляемый пользователь в текущей формации пятерок
  const isPlayerInLines = useMemo(() => {
    if (!userToRemove) return false;
    return initialDraftLines.some(l => String(l.player_id) === String(userToRemove.id));
  }, [userToRemove, initialDraftLines]);

  const goalies = useMemo(() => {
    return attendees.filter(a => a.position === 'goalie' || a.position === 'G');
  }, [attendees]);

  const skaters = useMemo(() => {
    return attendees.filter(a => a.position !== 'goalie' && a.position !== 'G');
  }, [attendees]);

  const handleMarkUser = async (playerObj) => {
    setSavingPlayerId(playerObj.user_id);

    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      await fetch(`${apiUrl}/api/events/${event.event_id}/attendance`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isAttending: true,
          eventType: event.event_type,
          teamId: event.my_team_id,
          targetUserId: playerObj.user_id
        })
      });

      const newAttendee = {
        id: playerObj.user_id,
        first_name: playerObj.first_name,
        last_name: playerObj.last_name,
        team_photo: playerObj.team_photo,
        avatar_url: playerObj.avatar_url,
        position: playerObj.position,
        has_pay_tag: false
      };

      setAttendees(prev => [...prev, newAttendee]);
      setAnimatingInId(newAttendee.id);
      setTimeout(() => setAnimatingInId(null), 300);

      setIsSheetOpen(false);
      refreshData();
    } catch (err) {
      console.error('Ошибка при отметке игрока:', err);
      refreshData();
    } finally {
      setSavingPlayerId(null);
    }
  };

  const handleTogglePayTag = async (e, attendeeUser) => {
    e.stopPropagation();
    if (!hasManageAccess || !hasAttendanceSubscription) return;

    const targetNewState = !attendeeUser.has_pay_tag;

    setAttendees(prev => prev.map(u => {
      if (u.id === attendeeUser.id) {
        return { ...u, has_pay_tag: targetNewState };
      }
      return u;
    }));

    if (window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate(30);
    }

    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      await fetch(`${apiUrl}/api/events/${event.event_id}/attendance-tag`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: event.event_type,
          teamId: event.my_team_id,
          targetUserId: attendeeUser.id,
          hasPayTag: targetNewState
        })
      });
      refreshData();
    } catch (err) {
      console.error('Ошибка при изменении финансовой метки:', err);
      refreshData();
    }
  };

  const confirmRemoveUser = async () => {
    if (!userToRemove) return;
    const targetUserId = userToRemove.id;
    
    setUserToRemove(null);
    setAnimatingOutId(targetUserId);

    setTimeout(async () => {
      setAttendees(prev => {
        const newAttendees = prev.filter(u => u.id !== targetUserId);
        if (newAttendees.length === 0) setIsEditMode(false);
        return newAttendees;
      });
      setAnimatingOutId(null);

      try {
        const apiUrl = import.meta.env.VITE_API_URL || '';
        const headers = getAuthHeaders();

        // 1. Удаляем отметку о присутствии
        await fetch(`${apiUrl}/api/events/${event.event_id}/attendance`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            isAttending: false,
            eventType: event.event_type,
            teamId: event.my_team_id,
            targetUserId: targetUserId
          })
        });

        // 2. Если игрок был установлен в формацию звеньев — вычищаем его оттуда на сервере
        if (isPlayerInLines) {
          const updatedLines = initialDraftLines.filter(l => String(l.player_id) !== String(targetUserId));
          
          const positionMap = {
            'ЛН': 'LW', 'ЦН': 'C', 'ПН': 'RW',
            'ЛЗ': 'LD', 'ПЗ': 'RD', 'ВР': 'G',
            'НАП': 'LW', 'ЗАЩ': 'LD',
            'Ц': 'C', 'Л': 'LW', 'П': 'RW', 'В': 'G',
            'ОСН': 'G', 'ЗАП': 'G', 'РЕЗ': 'G'
          };

          // Передаем параметры в camelCase: { teamId, lines } согласно контроллеру
          await fetch(`${apiUrl}/api/events/${event.event_id}/lines`, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              teamId: event.my_team_id,
              lines: updatedLines.map(l => {
                const upperPos = String(l.position_in_line).toUpperCase();
                return {
                  player_id: l.player_id,
                  line_number: l.line_number,
                  position_in_line: positionMap[upperPos] || upperPos
                };
              })
            })
          });
        }

        refreshData(); 
      } catch (err) {
        console.error('Ошибка при удаления игрока и обновлении звеньев:', err);
        refreshData(); 
      }
    }, 200);
  };

  const handlePointerDown = () => {
    if (isEditMode) return;
    pressTimer.current = setTimeout(() => {
      setIsEditMode(true);
      if (window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(50);
      }
    }, 500);
  };

  const cancelPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  };

  const handleContainerClick = () => {
    if (isEditMode) setIsEditMode(false);
  };

  // Умный фильтр списка доступных игроков на основе выбранной шапки добавления
  const availablePlayers = teamRoster.filter(
    player => !attendees.some(att => String(att.id) === String(player.user_id)) &&
              (sheetFilterType === 'goalie'
                ? (player.position === 'goalie' || player.position === 'G')
                : (player.position !== 'goalie' && player.position !== 'G'))
  );

  const renderAttendeeCard = (attendeeUser, index) => {
    const photoUrl = attendeeUser.team_photo || attendeeUser.avatar_url;
    const canRemove = hasManageAccess || String(activeUserId) === String(attendeeUser.id);
    const isRemoving = attendeeUser.id === animatingOutId;
    const isEntering = attendeeUser.id === animatingInId;
    
    const jiggleClass = isEditMode && canRemove && !isRemoving ? `animate-jiggle jiggle-delay-${index % 3}` : '';

    const payTagStyle = attendeeUser.has_pay_tag && hasTeamColor 
      ? { 
          backgroundColor: activeBrandColor, 
          borderColor: activeBrandColor, 
          color: 'var(--color-content-dark)'
        } 
      : {};

    return (
      <div 
        key={attendeeUser.id} 
        onPointerDown={handlePointerDown}
        onPointerUp={cancelPress}
        onPointerLeave={cancelPress}
        onPointerCancel={cancelPress}
        onPointerMove={cancelPress}
        onClick={(e) => { if (isEditMode) e.stopPropagation(); }}
        className={clsx("flex flex-col items-center gap-1.5 select-none w-full text-center relative", jiggleClass)}
      >
        <div className="relative">
          <Avatar 
            photoUrl={photoUrl}
            firstName={attendeeUser.first_name}
            lastName={attendeeUser.last_name}
            className={clsx(
              "w-16 h-16 rounded-2xl bg-surface-level2 border border-surface-level2 shadow-sm origin-center",
              isRemoving && "animate-slot-exit",
              isEntering && "animate-slot-enter"
            )}
          />
          
          {/* КРЕСТИК ИСКЛЮЧЕНИЯ ИЗ ЯВОК С УЧЕТОМ ПОДПИСКИ */}
          {isEditMode && canRemove && !isRemoving && (
            hasAttendanceSubscription ? (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setUserToRemove(attendeeUser); 
                }}
                className="absolute -top-1.5 -right-1.5 w-[22px] h-[22px] bg-red-500 rounded-full flex items-center justify-center shadow-md z-10 hover:scale-110 active:scale-90 transition-transform cursor-pointer"
              >
                <Icon name="close" className="w-3 h-3 text-white" strokeWidth={3.5} />
              </button>
            ) : (
              <div className="absolute -top-1.5 -right-1.5 z-10">
                <HintPopover status="no_subscription">
                  <button 
                    type="button"
                    className="w-[22px] h-[22px] bg-red-500 opacity-30 rounded-full flex items-center justify-center shadow-md cursor-pointer"
                  >
                    <Icon name="close" className="w-3 h-3 text-white" strokeWidth={3.5} />
                  </button>
                </HintPopover>
              </div>
            )
          )}

          {/* ТУМБЛЕР ДОЛИ ОПЛАТЫ "₽" С УЧЕТОМ ПОДПИСКИ */}
          {(isEditMode && hasManageAccess) ? (
            hasAttendanceSubscription ? (
              <button
                onClick={(e) => handleTogglePayTag(e, attendeeUser)}
                style={payTagStyle}
                className={clsx(
                  "absolute -bottom-1.5 -left-1.5 w-[22px] h-[22px] rounded-full flex items-center justify-center text-[11px] font-black shadow-md z-10 transition-all transform hover:scale-110 active:scale-90 cursor-pointer",
                  attendeeUser.has_pay_tag && !hasTeamColor && "bg-brand text-white border border-brand",
                  !attendeeUser.has_pay_tag && "bg-surface-level3 text-content-muted border border-surface-border"
                )}
              >
                ₽
              </button>
            ) : (
              <div className="absolute -bottom-1.5 -left-1.5 z-10">
                <HintPopover status="no_subscription">
                  <button
                    type="button"
                    className="w-[22px] h-[22px] rounded-full flex items-center justify-center text-[11px] font-black shadow-md bg-surface-level3 text-content-muted opacity-30 border border-surface-border cursor-pointer"
                  >
                    ₽
                  </button>
                </HintPopover>
              </div>
            )
          ) : (
            attendeeUser.has_pay_tag && (
              <div 
                style={payTagStyle}
                className={clsx(
                  "absolute -bottom-1.5 -left-1.5 w-[22px] h-[22px] rounded-full flex items-center justify-center text-[11px] font-black shadow-sm border border-surface-level1 pointer-events-none",
                  !hasTeamColor && "bg-brand text-white"
                )}
              >
                ₽
              </div>
            )
          )}
        </div>

        <div className="w-full text-center px-0.5">
          <span className="text-[13px] font-bold text-content-main leading-tight break-words block pointer-events-none">
            {attendeeUser.last_name}
          </span>
          <span className="text-[11px] text-content-muted leading-tight break-words block pointer-events-none ">
            {attendeeUser.first_name}
          </span>
        </div>
      </div>
    );
  };

  // Кнопки добавления игроков в явки (теперь красиво затухают без подписки)
  const goalieAddButton = hasManageAccess && !isEditMode && (
    hasAttendanceSubscription ? (
      <button
        onClick={(e) => {
          e.stopPropagation();
          setSheetFilterType('goalie');
          setIsSheetOpen(true);
        }}
        style={{ color: activeBrandColor }}
        className="transition-colors active:scale-90 outline-none flex items-center justify-center hover:opacity-80 cursor-pointer"
      >
        <Icon name="user_plus" className="w-5 h-5" />
      </button>
    ) : (
      <HintPopover status="no_subscription">
        <button
          type="button"
          style={{ color: activeBrandColor }}
          className="transition-all opacity-30 outline-none flex items-center justify-center cursor-pointer"
        >
          <Icon name="user_plus" className="w-5 h-5" />
        </button>
      </HintPopover>
    )
  );

  const skaterAddButton = hasManageAccess && !isEditMode && (
    hasAttendanceSubscription ? (
      <button
        onClick={(e) => {
          e.stopPropagation();
          setSheetFilterType('skater');
          setIsSheetOpen(true);
        }}
        style={{ color: activeBrandColor }}
        className="transition-colors active:scale-90 outline-none flex items-center justify-center hover:opacity-80 cursor-pointer"
      >
        <Icon name="user_plus" className="w-5 h-5" />
      </button>
    ) : (
      <HintPopover status="no_subscription">
        <button
          type="button"
          style={{ color: activeBrandColor }}
          className="transition-all opacity-30 outline-none flex items-center justify-center cursor-pointer"
        >
          <Icon name="user_plus" className="w-5 h-5" />
        </button>
      </HintPopover>
    )
  );

  return (
    <FadeIn className="flex flex-col gap-2 pb-32 min-h-[30vh]">
      <div className="flex flex-col gap-2 w-full" onClick={handleContainerClick}>
        
        <style>
          {`
            @keyframes jiggle {
              0% { transform: rotate(-1.5deg); }
              50% { transform: rotate(1.5deg); }
              100% { transform: rotate(-1.5deg); }
            }
            .animate-jiggle { animation: jiggle 0.3s ease-in-out infinite; }
            .jiggle-delay-0 { animation-delay: 0s; }
            .jiggle-delay-1 { animation-delay: 0.1s; }
            .jiggle-delay-2 { animation-delay: 0.2s; }

            @keyframes slotEnter {
              0% { transform: scale(0.2) translateZ(0); opacity: 0; }
              100% { transform: scale(1) translateZ(0); opacity: 1; }
            }
            @keyframes slotExit {
              0% { transform: scale(1) translateZ(0); opacity: 1; }
              100% { transform: scale(0.2) translateZ(0); opacity: 0; }
            }
            .animate-slot-enter { 
              animation: slotEnter 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) both; 
              will-change: transform, opacity;
            }
            .animate-slot-exit { 
              animation: slotExit 0.2s cubic-bezier(0.6, -0.28, 0.735, 0.045) both; 
              will-change: transform, opacity;
            }
          `}
        </style>


        <div className="flex flex-col gap-3 w-full">
          {/* Контейнер вратарей */}
          <ContainerContent title="Вратари" count={goalies.length} action={goalieAddButton}>
            {goalies.length > 0 ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(94px,1fr))] gap-y-5 gap-x-2 justify-items-center mt-2">
                {goalies.map((attendeeUser, idx) => renderAttendeeCard(attendeeUser, idx))}
              </div>
            ) : (
              <div className="text-center py-6 text-[11px] font-bold uppercase tracking-widest text-content-subtle opacity-50 select-none">
                Вратари не отмечены
              </div>
            )}
          </ContainerContent>

          {/* Контейнер полевых игроков */}
          <ContainerContent title="Полевые игроки" count={skaters.length} action={skaterAddButton}>
            {skaters.length > 0 ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(94px,1fr))] gap-y-5 gap-x-2 justify-items-center mt-2">
                {skaters.map((attendeeUser, idx) => renderAttendeeCard(attendeeUser, idx))}
              </div>
            ) : (
              <div className="text-center py-6 text-[11px] font-bold uppercase tracking-widest text-content-subtle opacity-50 select-none">
                Полевые игроки не отмечены
              </div>
            )}
          </ContainerContent>
        </div>

        {/* ШТОРКА ОПРЕДЕЛЕНИЯ ПРИСУТСТВИЯ */}
        <BottomSheet isOpen={isSheetOpen} onClose={() => setIsSheetOpen(false)}>
          <div className="flex flex-col gap-4">
            <h3 className="text-lg font-black text-content-main mb-2">
              {sheetFilterType === 'goalie' ? 'Отметить вратаря' : 'Отметить полевого игрока'}
            </h3>

            {availablePlayers.length > 0 ? (
              <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto scrollbar-hide">
                {availablePlayers.map(player => {
                  const photoUrl = player.team_photo || player.avatar_url;
                  return (
                    <div key={player.user_id} className="flex items-center justify-between p-3 bg-surface-level2 rounded-xl">
                      <div className="flex items-center gap-3">
                        <Avatar 
                          photoUrl={photoUrl}
                          firstName={player.first_name}
                          lastName={player.last_name}
                          className="w-10 h-10 rounded-xl bg-surface-level1 border border-surface-border"
                        />
                        <div className="flex flex-col text-left">
                          <span className="text-[12px] font-bold text-content-main">
                            {player.last_name} {player.first_name}
                          </span>
                          {player.jersey_number && (
                            <span className="text-[10px] text-content-muted leading-none ">
                              #{player.jersey_number} • {player.position === 'goalie' ? 'Вратарь' : player.position === 'defense' ? 'Защитник' : 'Нападающий'}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      {player.is_disqualified ? (
                        <span className="text-[10px] font-black text-red-500 uppercase tracking-wider bg-red-500/10 border border-red-500/20 px-2.5 py-1.5 rounded-lg">
                          Дисквал.
                        </span>
                      ) : (
                        <ButtonLP
                          onClick={() => handleMarkUser(player)}
                          variant="primary"
                          className="!w-auto !py-1.5 !px-3 !text-[10px] ml-2 shrink-0 normal-case"
                          activeColor={hasTeamColor ? event.team_color : null}
                          isLoading={savingPlayerId === player.user_id}
                          disabled={savingPlayerId !== null}
                        >
                          Добавить
                        </ButtonLP>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex justify-center items-center h-24 text-[11px] font-black text-content-muted uppercase tracking-widest text-center py-4">
                {sheetFilterType === 'goalie' 
                  ? 'Все вратари состава уже отмечены' 
                  : 'Все полевые игроки состава уже отмечены'}
              </div>
            )}
          </div>
        </BottomSheet>

        {/* ШТОРКА ПОДТВЕРЖДЕНИЯ УДАЛЕНИЯ */}
        <BottomSheet isOpen={!!userToRemove} onClose={() => setUserToRemove(null)}>
          <div className="flex flex-col items-center text-center gap-4 py-2">
            <div className="w-16 h-16 bg-danger-muted text-danger rounded-full flex items-center justify-center mb-2">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <h3 className="text-lg font-black text-content-main leading-tight">
              Удалить отметку?
            </h3>
            <div className="text-[13px] text-content-muted max-w-[280px] flex flex-col gap-4">
              {isPlayerInLines && (
                <span className="text-danger font-semibold bg-danger-muted rounded-xl p-4 text-left block text-md leading-normal">
                  Внимание! При удалении игрок исчезнет из формации звена на матч.
                </span>
              )}
              <p>
                Вы уверены, что хотите удалить игрока <span className="font-bold text-content-main">{userToRemove?.last_name}</span> из списка отметившихся?
              </p>
            </div>
            <div className="flex gap-3 w-full ">
              <ButtonLP variant="outline" onClick={() => setUserToRemove(null)} className="flex-1">
                Отмена
              </ButtonLP>
              <ButtonLP variant="primary" className="flex-1 !bg-red-500 hover:!bg-red-600 !border-red-500 !text-white" activeColor={hasTeamColor ? event.team_color : null} onClick={confirmRemoveUser}>
                Да, удалить
              </ButtonLP>
            </div>
          </div>
        </BottomSheet>

      </div>
    </FadeIn>
  );
};