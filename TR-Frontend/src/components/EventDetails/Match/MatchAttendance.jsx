import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getImageUrl, getAuthHeaders } from '../../../utils/helpers';
import { BottomSheet } from '../../../ui/BottomSheet';
import { ButtonLP } from '../../../ui/Button-LP';
import { SectionHeader } from '../../../ui/SectionHeader';
import { useAccess } from '../../../hooks/useAccess';
import { ROLES, PERMISSIONS } from '../../../utils/permissions';
import clsx from 'clsx';

const getInitials = (firstName, lastName) => {
  const f = firstName ? firstName.charAt(0).toUpperCase() : '';
  const l = lastName ? lastName.charAt(0).toUpperCase() : '';
  return `${l}${f}` || '?';
};

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

export const MatchAttendance = ({ event }) => {
  const [attendees, setAttendees] = useState([]);
  const [loading, setLoading] = useState(true);

  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [teamRoster, setTeamRoster] = useState([]);
  const [loadingRoster, setLoadingRoster] = useState(true);
  const [hasManageAccess, setHasManageAccess] = useState(false);
  
  const [isEditMode, setIsEditMode] = useState(false);
  const [userToRemove, setUserToRemove] = useState(null); 
  
  // Состояния для Оптимистичного UI и анимаций
  const [animatingInId, setAnimatingInId] = useState(null);
  const [animatingOutId, setAnimatingOutId] = useState(null);

  const pressTimer = useRef(null);

  const { user, checkAccess, selectedTeam } = useAccess();

  const tokenUser = getSafeUserFromToken();
  const activeUserId = user?.id || tokenUser?.id || tokenUser?.userId;

  const fetchAttendance = useCallback(async () => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const headers = getAuthHeaders();

      const res = await fetch(`${apiUrl}/api/events/${event.event_id}/attendance?eventType=${event.event_type}&teamId=${event.my_team_id}`, {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });

      if (!res.ok) throw new Error(`Ошибка сервера: ${res.status}`);
      const data = await res.json();

      if (data.success) {
        setAttendees(data.attendees);
      }
    } catch (err) {
      console.error('Ошибка при загрузке списка отметившихся:', err);
    } finally {
      setLoading(false);
    }
  }, [event.event_id, event.event_type, event.my_team_id]);

  useEffect(() => {
    if (event?.event_id) {
      fetchAttendance();
    }
  }, [fetchAttendance, event?.event_id]);

  useEffect(() => {
    const fetchSmartRosterAndAccess = async () => {
      setLoadingRoster(true);
      try {
        const apiUrl = import.meta.env.VITE_API_URL || '';
        
        const res = await fetch(`${apiUrl}/api/events/${event.event_id}/available-roster?teamId=${event.my_team_id}`, {
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' }
        });
        const data = await res.json();

        if (data.roster) {
          setTeamRoster(data.roster);
        }

        const activeGlobalRole = String(user?.global_role || user?.globalRole || tokenUser?.global_role || tokenUser?.globalRole || '').toLowerCase();

        let access = false;
        
        if (activeGlobalRole === (ROLES.GLOBAL_ADMIN || '').toLowerCase()) {
          access = true;
        } else if (selectedTeam && checkAccess('ATTENDANCE_MANAGE')) {
          access = true;
        } else if (data.staff && activeUserId) {
          const myStaffRecord = data.staff.find(s => String(s.user_id) === String(activeUserId));
          if (myStaffRecord && myStaffRecord.roles) {
            const myRoles = myStaffRecord.roles.split(',').map(r => r.trim().toLowerCase());
            const allowed = PERMISSIONS.ATTENDANCE_MANAGE || [];
            access = myRoles.some(r => allowed.includes(r.toLowerCase()));
          }
        }

        setHasManageAccess(access);

      } catch (err) {
        console.error('Ошибка загрузки умного ростера:', err);
      } finally {
        setLoadingRoster(false);
      }
    };

    if (event?.my_team_id && event?.event_id) {
      fetchSmartRosterAndAccess();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.my_team_id, event?.event_id]);

  // ОПТИМИСТИЧНОЕ ДОБАВЛЕНИЕ ИГРОКА
  const handleMarkUser = async (playerObj) => {
    // 1. Формируем объект для мгновенной отрисовки
    const newAttendee = {
      id: playerObj.user_id,
      first_name: playerObj.first_name,
      last_name: playerObj.last_name,
      team_photo: playerObj.team_photo,
      avatar_url: playerObj.avatar_url
    };

    // 2. Сразу обновляем UI и закрываем шторку
    setAttendees(prev => [...prev, newAttendee]);
    setAnimatingInId(newAttendee.id);
    setIsSheetOpen(false);

    // Снимаем класс анимации после ее завершения
    setTimeout(() => setAnimatingInId(null), 300);

    // 3. Отправляем запрос в фоне
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

      // Тихо обновляем данные для страховки
      fetchAttendance();
    } catch (err) {
      console.error('Ошибка при отметке игрока:', err);
      fetchAttendance(); // Откатываем UI в случае реальной ошибки сети
    }
  };

  // ОПТИМИСТИЧНОЕ УДАЛЕНИЕ ИГРОКА
  const confirmRemoveUser = async () => {
    if (!userToRemove) return;
    const targetUserId = userToRemove.id;
    
    // 1. Закрываем шторку и запускаем анимацию исчезновения
    setUserToRemove(null);
    setAnimatingOutId(targetUserId);

    // 2. Ждем окончания анимации (200ms), затем удаляем из локального массива
    setTimeout(async () => {
      setAttendees(prev => {
        const newAttendees = prev.filter(u => u.id !== targetUserId);
        // Если удалили последнего - выключаем режим редактирования
        if (newAttendees.length === 0) setIsEditMode(false);
        return newAttendees;
      });
      setAnimatingOutId(null);

      // 3. Отправляем запрос в фоне
      try {
        const apiUrl = import.meta.env.VITE_API_URL || '';
        await fetch(`${apiUrl}/api/events/${event.event_id}/attendance`, {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            isAttending: false,
            eventType: event.event_type,
            teamId: event.my_team_id,
            targetUserId: targetUserId
          })
        });
        
        // Тихо обновляем данные для страховки
        fetchAttendance(); 
      } catch (err) {
        console.error('Ошибка при удалении игрока:', err);
        fetchAttendance(); // Откатываем UI
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

  const availablePlayers = teamRoster.filter(
    player => !attendees.some(att => String(att.id) === String(player.user_id))
  );

  if (loading) {
    return (
      <div className="flex justify-center items-center h-32 text-[11px] font-black text-content-muted uppercase tracking-widest bg-surface-level2/30 rounded-2xl border border-surface-border/50 border-dashed">
        Загрузка списка...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 mt-4 pb-[10vh] min-h-[30vh]" onClick={handleContainerClick}>
      
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

          /* Оптимизированные анимации масштабирования с GPU-ускорением */
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

      <SectionHeader 
        title={`Отметились (${attendees.length})`}
        showAction={hasManageAccess}
        actionText={isEditMode ? 'Готово' : '+ Отметить'}
        onActionClick={(e) => {
          e.stopPropagation();
          if (isEditMode) setIsEditMode(false);
          else setIsSheetOpen(true);
        }}
        className="px-1"
      />

      <div className="px-1">
        {attendees.length > 0 ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-y-5 gap-x-2 justify-items-center">
            {attendees.map((attendeeUser, index) => {
              const photoUrl = attendeeUser.team_photo || attendeeUser.avatar_url;
              const canRemove = hasManageAccess || String(activeUserId) === String(attendeeUser.id);
              const isRemoving = attendeeUser.id === animatingOutId;
              const isEntering = attendeeUser.id === animatingInId;
              
              // Если элемент удаляется - не трясем его
              const jiggleClass = isEditMode && canRemove && !isRemoving ? `animate-jiggle jiggle-delay-${index % 3}` : '';

              return (
                <div 
                  key={attendeeUser.id} 
                  onPointerDown={handlePointerDown}
                  onPointerUp={cancelPress}
                  onPointerLeave={cancelPress}
                  onPointerMove={cancelPress}
                  onClick={(e) => { if (isEditMode) e.stopPropagation(); }}
                  className={`flex flex-col items-center gap-1.5 select-none w-full ${jiggleClass}`}
                >
                  <div className="relative">
                    {/* Применяем анимации к обертке аватара */}
                    <div className={clsx(
                      "w-16 h-16 shrink-0 rounded-2xl overflow-hidden bg-surface-level2 border border-surface-level2 shadow-sm origin-center",
                      isRemoving && "animate-slot-exit",
                      isEntering && "animate-slot-enter"
                    )}>
                      {photoUrl ? (
                        <img src={getImageUrl(photoUrl)} alt="Аватар" className="w-full h-full object-cover pointer-events-none" />
                      ) : (
                        <div className="w-full h-full bg-brand/10 text-brand flex items-center justify-center text-sm font-bold pointer-events-none">
                          {getInitials(attendeeUser.first_name, attendeeUser.last_name)}
                        </div>
                      )}
                    </div>
                    
                    {/* Прячем красный крестик сразу, как только нажали "Удалить" (isRemoving) */}
                    {isEditMode && canRemove && !isRemoving && (
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setUserToRemove(attendeeUser); 
                        }}
                        className="absolute -top-1.5 -right-1.5 w-[22px] h-[22px] bg-red-500 rounded-full flex items-center justify-center shadow-md z-10 hover:scale-110 active:scale-90 transition-transform"
                      >
                        <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* Имя тоже плавно исчезает за счет родительского контейнера или остается на 200мс — выглядит органично */}
                  <div className="w-full text-center px-0.5">
                    <span className="text-[13px] font-bold text-content-main leading-tight break-words block pointer-events-none">
                      {attendeeUser.last_name}
                    </span>
                    <span className="text-[11px] text-content-muted leading-tight break-words block pointer-events-none mt-0.5">
                      {attendeeUser.first_name}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex justify-center items-center h-20 text-[11px] font-black text-content-muted uppercase tracking-widest text-center">
            Пока никто не отметился
          </div>
        )}
      </div>

      <BottomSheet isOpen={isSheetOpen} onClose={() => setIsSheetOpen(false)}>
        <div className="flex flex-col gap-4">
          <h3 className="text-lg font-black text-content-main mb-2">Отметить игрока</h3>

          {loadingRoster ? (
            <div className="flex justify-center items-center h-24 text-[11px] font-black text-content-muted uppercase tracking-widest">
              Загрузка ростера...
            </div>
          ) : availablePlayers.length > 0 ? (
            <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto scrollbar-hide">
              {availablePlayers.map(player => {
                const photoUrl = player.team_photo || player.avatar_url;
                return (
                  <div key={player.user_id} className="flex items-center justify-between p-3 bg-surface-level2 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 shrink-0 rounded-xl overflow-hidden bg-surface-level1 border border-surface-border">
                        {photoUrl ? (
                          <img src={getImageUrl(photoUrl)} alt="Аватар" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-brand/10 flex items-center justify-center text-xs font-bold text-brand">
                            {getInitials(player.first_name, player.last_name)}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[12px] font-bold text-content-main">
                          {player.last_name} {player.first_name}
                        </span>
                        {player.jersey_number && (
                          <span className="text-[10px] text-content-muted leading-none mt-0.5">
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
                        onClick={() => handleMarkUser(player)} // Передаем полный объект игрока!
                        variant="primary"
                        className="!w-auto !py-1.5 !px-3 !text-[10px] ml-2 shrink-0"
                      >
                        Добавить
                      </ButtonLP>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex justify-center items-center h-24 text-[11px] font-black text-content-muted uppercase tracking-widest text-center">
              Все игроки состава уже отметились
            </div>
          )}
        </div>
      </BottomSheet>

      <BottomSheet isOpen={!!userToRemove} onClose={() => setUserToRemove(null)}>
        <div className="flex flex-col items-center text-center gap-4 py-2">
          <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mb-2">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </div>
          <h3 className="text-lg font-black text-content-main leading-tight">
            Удалить отметку?
          </h3>
          <p className="text-[13px] text-content-muted max-w-[250px]">
            Вы уверены, что хотите удалить игрока <span className="font-bold text-content-main">{userToRemove?.last_name}</span> из списка отметившихся?
          </p>
          <div className="flex gap-3 w-full mt-4">
            <ButtonLP variant="outline" onClick={() => setUserToRemove(null)} className="flex-1">
              Отмена
            </ButtonLP>
            <ButtonLP variant="primary" className="flex-1 !bg-red-500 hover:!bg-red-600 !border-red-500 !text-white" onClick={confirmRemoveUser}>
              Да, удалить
            </ButtonLP>
          </div>
        </div>
      </BottomSheet>

    </div>
  );
};