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

// Жесткая очистка кэша от любых вариантов русских букв с предохранителем
const sanitizePosition = (pos) => {
  const upperPos = String(pos).toUpperCase();
  const map = {
    'ЛН': 'LW', 'ЦН': 'C', 'ПН': 'RW',
    'ЛЗ': 'LD', 'ПЗ': 'RD', 'ВР': 'G',
    'НАП': 'LW', 'ЗАЩ': 'LD',
    'Ц': 'C', 'Л': 'LW', 'П': 'RW', 'В': 'G',
    'ОСН': 'G', 'ЗАП': 'G', 'РЕЗ': 'G'
  };
  
  const sanitized = map[upperPos] || upperPos;
  
  // Железный предохранитель для БД: если ключ всё равно кривой, ставим дефолт
  const validKeys = ['LW', 'C', 'RW', 'LD', 'RD', 'G'];
  return validKeys.includes(sanitized) ? sanitized : 'LW';
};

export const MatchLines = ({ event }) => {
  const [attendees, setAttendees] = useState([]);
  const [draftLines, setDraftLines] = useState([]);
  const [isPublished, setIsPublished] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isDeleteMode, setIsDeleteMode] = useState(false); 
  const [loading, setLoading] = useState(true);
  const [isPublishing, setIsPublishing] = useState(false);
  const [hasManageAccess, setHasManageAccess] = useState(false);

  const [currentSlide, setCurrentSlide] = useState(0);
  const [activeSelection, setActiveSelection] = useState(null);
  
  const [userInteracted, setUserInteracted] = useState(false);
  const [removingSlot, setRemovingSlot] = useState(null);

  const { user, checkAccess, selectedTeam } = useAccess();
  const carouselRef = useRef(null);
  const chipsScrollRef = useRef(null);
  const pressTimer = useRef(null);
  const longPressFired = useRef(false);
  
  const cacheKey = `draft_lines_${event?.event_id}_${event?.my_team_id}`;

  useEffect(() => {
    const el = chipsScrollRef.current;
    if (!el) return;

    const handleWheel = (e) => {
      if (e.deltaY !== 0) {
        e.preventDefault(); 
        el.scrollLeft += e.deltaY;
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [isEditMode]);

  const loadInitialData = useCallback(async () => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const headers = getAuthHeaders();

      const attRes = await fetch(`${apiUrl}/api/events/${event.event_id}/attendance?eventType=${event.event_type}&teamId=${event.my_team_id}`, {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
      const attData = await attRes.json();
      if (attData.success) {
        setAttendees(attData.attendees);
      }

      const linesRes = await fetch(`${apiUrl}/api/events/${event.event_id}/lines?teamId=${event.my_team_id}`, {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
      const linesData = await linesRes.json();

      const tokenUser = getSafeUserFromToken();
      const activeUserId = user?.id || tokenUser?.id || tokenUser?.userId;
      const activeGlobalRole = String(user?.global_role || user?.globalRole || tokenUser?.global_role || tokenUser?.globalRole || '').toLowerCase();

      const rosterRes = await fetch(`${apiUrl}/api/events/${event.event_id}/available-roster?teamId=${event.my_team_id}`, {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
      const rosterData = await rosterRes.json();

      let access = false;
      if (activeGlobalRole === (ROLES.GLOBAL_ADMIN || '').toLowerCase()) access = true;
      else if (selectedTeam && checkAccess('LINES_MANAGE')) access = true;
      else if (rosterData.staff && activeUserId) {
        const myStaffRecord = rosterData.staff.find(s => String(s.user_id) === String(activeUserId));
        if (myStaffRecord && myStaffRecord.roles) {
          const myRoles = myStaffRecord.roles.split(',').map(r => r.trim().toLowerCase());
          const allowed = PERMISSIONS.LINES_MANAGE || [];
          access = myRoles.some(r => allowed.includes(r.toLowerCase()));
        }
      }
      setHasManageAccess(access);

      if (linesData.success) {
        setIsPublished(linesData.isPublished);
        const cached = localStorage.getItem(cacheKey);
        if (access && cached) {
          try {
            const parsedCache = JSON.parse(cached);
            // Очищаем кэш от битых позиций
            const sanitizedCache = parsedCache.map(l => ({
              ...l,
              position_in_line: sanitizePosition(l.position_in_line)
            }));
            setDraftLines(sanitizedCache);
          } catch (e) {
            setDraftLines(linesData.lines || []);
          }
        } else {
          setDraftLines(linesData.lines || []);
        }
      }

    } catch (err) {
      console.error('Ошибка загрузки пятерок:', err);
    } finally {
      setLoading(false);
    }
  }, [event?.event_id, event?.event_type, event?.my_team_id, user, checkAccess, selectedTeam, cacheKey]);

  useEffect(() => {
    if (event?.event_id) loadInitialData();
  }, [loadInitialData, event?.event_id]);

  useEffect(() => {
    if (isEditMode && hasManageAccess) {
      localStorage.setItem(cacheKey, JSON.stringify(draftLines));
    }
  }, [draftLines, isEditMode, hasManageAccess, cacheKey]);

  const handleCarouselScroll = (e) => {
    if (!isEditMode) return;
    const container = e.target;
    const width = container.clientWidth;
    if (width > 0) {
      const slideIndex = Math.round(container.scrollLeft / width);
      if (slideIndex !== currentSlide) {
        setCurrentSlide(slideIndex);
      }
    }
  };

  const scrollToSlide = (index) => {
    if (carouselRef.current) {
      const width = carouselRef.current.clientWidth;
      carouselRef.current.scrollTo({
        left: width * index,
        behavior: 'smooth'
      });
      setCurrentSlide(index);
    }
  };

  const handleSlotClick = (lineNum, pos) => {
    if (!isEditMode) return;
    setUserInteracted(true); 
    
    const existingPlayerIndex = draftLines.findIndex(l => l.line_number === lineNum && l.position_in_line === pos);
    const existingPlayer = existingPlayerIndex !== -1 ? draftLines[existingPlayerIndex] : null;

    if (activeSelection) {
      if (activeSelection.type === 'chip') {
        const newPlayer = attendees.find(a => a.id === activeSelection.id);
        let newLines = [...draftLines];
        if (existingPlayer) newLines.splice(existingPlayerIndex, 1);
        newLines.push({ player_id: newPlayer.id, line_number: lineNum, position_in_line: pos, ...newPlayer });
        setDraftLines(newLines);
        setActiveSelection(null);
      } 
      else if (activeSelection.type === 'slot') {
        if (activeSelection.line === lineNum && activeSelection.pos === pos) {
          setActiveSelection(null);
        } else {
          const sourcePlayer = draftLines.find(l => l.line_number === activeSelection.line && l.position_in_line === activeSelection.pos);
          let newLines = draftLines.filter(l => 
            !(l.line_number === lineNum && l.position_in_line === pos) && 
            !(l.line_number === activeSelection.line && l.position_in_line === activeSelection.pos)
          );
          if (sourcePlayer) {
            newLines.push({ ...sourcePlayer, line_number: lineNum, position_in_line: pos });
          }
          if (existingPlayer) {
            newLines.push({ ...existingPlayer, line_number: activeSelection.line, position_in_line: activeSelection.pos });
          }
          setDraftLines(newLines);
          setActiveSelection(null);
        }
      }
    } else {
      setActiveSelection({ type: 'slot', line: lineNum, pos: pos });
    }
  };

  const handleChipClick = (playerId) => {
    if (!isEditMode) return;
    setUserInteracted(true);
    
    if (activeSelection) {
      if (activeSelection.type === 'slot') {
        const newPlayer = attendees.find(a => a.id === playerId);
        const existingPlayerIndex = draftLines.findIndex(l => l.line_number === activeSelection.line && l.position_in_line === activeSelection.pos);
        let newLines = [...draftLines];
        if (existingPlayerIndex !== -1) newLines.splice(existingPlayerIndex, 1);
        newLines.push({ player_id: newPlayer.id, line_number: activeSelection.line, position_in_line: activeSelection.pos, ...newPlayer });
        setDraftLines(newLines);
        setActiveSelection(null);
      } else if (activeSelection.type === 'chip' && activeSelection.id === playerId) {
        setActiveSelection(null);
      } else {
        setActiveSelection({ type: 'chip', id: playerId });
      }
    } else {
      setActiveSelection({ type: 'chip', id: playerId });
    }
  };

  const handleDeletePlayer = (lineNum, pos, e) => {
    e.stopPropagation();
    setUserInteracted(true);
    setRemovingSlot({ line: lineNum, pos: pos });
    setTimeout(() => {
      setDraftLines(prev => {
        const newLines = prev.filter(l => !(l.line_number === lineNum && l.position_in_line === pos));
        if (newLines.length === 0) setIsDeleteMode(false);
        return newLines;
      });
      setRemovingSlot(null);
    }, 200); 
  };

  const handlePointerDown = () => {
    if (!isEditMode || isDeleteMode) return;
    longPressFired.current = false;
    pressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      setIsDeleteMode(true);
      setActiveSelection(null);
      if (window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(50);
      }
    }, 500);
  };

  const cancelPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  };

  const handlePublish = async () => {
    setIsPublishing(true);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const headers = getAuthHeaders();
      const res = await fetch(`${apiUrl}/api/events/${event.event_id}/lines`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: event.my_team_id,
          lines: draftLines.map(l => ({ 
            player_id: l.player_id, 
            line_number: l.line_number, 
            position_in_line: sanitizePosition(l.position_in_line) 
          }))
        })
      });
      const data = await res.json();
      if (data.success) {
        setIsPublished(true);
        setIsEditMode(false);
        setIsDeleteMode(false);
        setActiveSelection(null);
        localStorage.removeItem(cacheKey);
      } else {
        console.error('Ошибка бэкенда:', data.error);
      }
    } catch (err) {
      console.error('Ошибка публикации:', err);
    } finally {
      setIsPublishing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-32 text-[11px] font-black text-content-muted uppercase tracking-widest">
        Загрузка состава...
      </div>
    );
  }

  if (!isPublished && !hasManageAccess) {
    return (
      <div className="flex flex-col justify-center items-center p-6 text-center gap-3">   
        <div>
          <h3 className="flex justify-center items-center h-24 text-[11px] font-black text-content-muted uppercase tracking-widest">Состав еще не сформирован</h3>
        </div>
      </div>
    );
  }

  const unassignedPlayers = attendees.filter(a => !draftLines.some(l => String(l.player_id) === String(a.id)));

  const renderSlot = (lineNum, pos, labelText = null) => {
    const player = draftLines.find(l => l.line_number === lineNum && l.position_in_line === pos);
    const isSelected = activeSelection?.type === 'slot' && activeSelection?.line === lineNum && activeSelection?.pos === pos;
    const isRemoving = removingSlot?.line === lineNum && removingSlot?.pos === pos;

    const playerImage = player?.team_photo || player?.avatar_url;

    const jiggleDelay = (lineNum + (pos === 'LW' ? 0 : pos === 'C' ? 1 : 2)) % 3;
    const jiggleClass = isDeleteMode && player && !isRemoving ? `animate-jiggle jiggle-delay-${jiggleDelay}` : '';

    return (
      <div 
        key={`${lineNum}-${pos}`}
        onPointerDown={handlePointerDown}
        onPointerUp={cancelPress}
        onPointerLeave={cancelPress}
        onPointerCancel={cancelPress}
        onClick={(e) => {
          if (longPressFired.current) {
            longPressFired.current = false;
            e.stopPropagation();
            return;
          }

          if (isDeleteMode) {
            if (player) {
              e.stopPropagation();
            } else {
              setIsDeleteMode(false);
              e.stopPropagation();
            }
            return;
          }
          
          handleSlotClick(lineNum, pos);
        }}
        className={clsx(
          "flex flex-col items-center w-[100px] relative transition-opacity duration-200 shrink-0",
          isEditMode ? "cursor-pointer" : "pointer-events-none",
          (isEditMode && !player && !isSelected && !isDeleteMode) ? "opacity-70 hover:opacity-100" : "opacity-100",
          jiggleClass
        )}
      >
        <div className={clsx(
          "w-16 h-16 rounded-2xl bg-brand-glow flex items-center justify-center relative transition-all duration-200 shrink-0 box-border z-0 origin-center",
          isSelected ? "ring-2 ring-brand scale-110" : "",
          !player && "",
          player && "shadow-lg border border-surface-border bg-surface-level3"
        )}>
          {player ? (
            <>
              <div 
                key={player.player_id}
                className={clsx(
                  "w-full h-full rounded-3xl overflow-hidden origin-center",
                  isRemoving ? "animate-slot-exit" : (userInteracted ? "animate-slot-enter" : "")
                )}
              >
                {playerImage ? (
                   <img src={getImageUrl(playerImage)} alt="" className="w-full h-full object-cover pointer-events-none" />
                ) : (
                   <div className="w-full h-full bg-surface-level2 text-content-main flex items-center justify-center text-[12px] font-bold pointer-events-none">
                     {getInitials(player.first_name, player.last_name)}
                   </div>
                )}
              </div>
              
              {isDeleteMode && !isRemoving && (
                <button 
                  onClick={(e) => handleDeletePlayer(lineNum, pos, e)}
                  className="absolute -top-1.5 -right-1.5 w-[22px] h-[22px] bg-red-500 rounded-full flex items-center justify-center shadow-md z-20 hover:scale-110 active:scale-90 transition-transform"
                >
                  <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}

              <div className="absolute -bottom-2 bg-surface-level2 rounded-md px-1.5 py-0.5 border border-surface-border shadow-sm z-10">
                <span className="text-[8px] font-black text-content-main uppercase tracking-widest leading-none block">
                  {labelText || pos}
                </span>
              </div>
            </>
          ) : (
            <span className="text-[14px] font-black text-content-muted uppercase tracking-widest select-none">
              {labelText || pos}
            </span>
          )}
        </div>
        <div className="w-full mt-3 flex items-center justify-center h-6 overflow-visible">
          {player ? (
            <span className="text-[12px] font-bold text-content-main leading-none w-full text-center pointer-events-none whitespace-nowrap mb-4">
              {player.last_name}
            </span>
          ) : (
            <span className="text-[10px] font-bold text-transparent leading-none select-none">_</span>
          )}
        </div>
      </div>
    );
  };

  const renderLineBlock = (lineNum) => (
    <div key={`line-${lineNum}`} className="w-full flex flex-col items-center pb-2">
      <h3 className="text-[20px] font-black text-content-muted uppercase tracking-widest mb-8">
        #{lineNum}
      </h3>
      <div className="flex justify-center gap-3 w-full mb-3">
        {renderSlot(lineNum, 'LW', 'ЛН')}
        {renderSlot(lineNum, 'C', 'ЦН')}
        {renderSlot(lineNum, 'RW', 'ПН')}
      </div>
      <div className="flex justify-center gap-8 w-full">
        {renderSlot(lineNum, 'LD', 'ЛЗ')}
        {renderSlot(lineNum, 'RD', 'ПЗ')}
      </div>
    </div>
  );

  const renderGoaliesBlock = () => (
    <div className="w-full flex flex-col items-center pb-6">
       <h3 className="text-[14px] font-black text-content-muted uppercase tracking-widest mb-8">
          Вратари
       </h3>
       <div className="flex justify-center gap-3 w-full">
          {renderSlot(5, 'G', 'Осн')}
          {renderSlot(6, 'G', 'Зап')}
          {renderSlot(7, 'G', 'Рез')}
       </div>
    </div>
  );

  return (
    <div 
      className="flex flex-col gap-4 mt-4" 
      onClick={() => { if (isDeleteMode) setIsDeleteMode(false); }}
    >
      
      <style>
        {`
          .custom-scrollbar::-webkit-scrollbar { height: 4px; }
          .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
          .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(150, 150, 150, 0.2); border-radius: 10px; }
          
          .grid-expand-transition {
            display: grid;
            grid-template-rows: 0fr;
            transition: grid-template-rows 0.3s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.2s ease-out;
            opacity: 0;
            pointer-events: none;
          }
          .grid-expand-transition.expanded { 
            grid-template-rows: 1fr; 
            opacity: 1; 
            pointer-events: auto;
          }
          .grid-expand-inner {
            min-height: 0;
            overflow: hidden;
          }

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

          @keyframes jiggle {
            0% { transform: rotate(-1.5deg); }
            50% { transform: rotate(1.5deg); }
            100% { transform: rotate(-1.5deg); }
          }
          .animate-jiggle { animation: jiggle 0.3s ease-in-out infinite; }
          .jiggle-delay-0 { animation-delay: 0s; }
          .jiggle-delay-1 { animation-delay: 0.1s; }
          .jiggle-delay-2 { animation-delay: 0.2s; }
        `}
      </style>
      
      <SectionHeader 
        title={isEditMode ? 'Формирование' : 'Пятерки на матч'}
        showAction={hasManageAccess}
        actionText={isEditMode ? 'Отмена' : 'Редактировать'}
        onActionClick={(e) => {
          e.stopPropagation();
          if (isEditMode) {
            setIsEditMode(false);
            setIsDeleteMode(false);
            setActiveSelection(null);
            loadInitialData(); 
          } else {
            setIsEditMode(true);
          }
        }}
        className="px-1"
      />

      <div className="-mx-4">
        <div className={clsx("grid-expand-transition", isEditMode && "expanded")}>
          <div className="grid-expand-inner">
            <div className="bg-brand-glow border-y border-surface-border pt-4 h-[164px] flex flex-col w-full">
              <div className="px-4 flex justify-between items-center mb-5 w-full">
                <span className="text-[9px] font-semibold text-content-muted uppercase tracking-widest">
                  Доступные игроки ({unassignedPlayers.length})
                </span>
              </div>
              
              <div 
                ref={chipsScrollRef}
                className="flex flex-col flex-wrap content-start overflow-x-auto overflow-y-hidden custom-scrollbar snap-x snap-mandatory px-4 gap-1 h-[120px] w-full"
              >
                {unassignedPlayers.map((p) => {
                  const isSelected = activeSelection?.type === 'chip' && activeSelection?.id === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={(e) => {
                        if (isDeleteMode) {
                          setIsDeleteMode(false);
                          e.stopPropagation();
                          return;
                        }
                        handleChipClick(p.id);
                      }}
                      className={clsx(
                        "px-3 py-1 rounded-full text-[12px] font-semibold transition-colors duration-150 shrink-0 select-none outline-none w-max snap-start border border-solid",
                        isSelected 
                          ? "bg-brand text-content-dark border-brand" 
                          : "bg-surface-level2 text-content-main border-surface-border hover:bg-surface-border"
                      )}
                    >
                      {p.last_name} {p.first_name?.[0]}.
                    </button>
                  );
                })}
                {unassignedPlayers.length === 0 && (
                  <span className="text-[11px] text-content-muted italic pl-1 w-full mt-2">
                    Все игроки распределены
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {isEditMode ? (
        <div className="relative w-full">
          <div 
            ref={carouselRef}
            onScroll={handleCarouselScroll}
            className="flex overflow-x-auto flex-nowrap snap-x snap-mandatory scrollbar-hide px-1 pt-2"
          >
            {[1, 2, 3, 4].map(lineNum => (
               <div key={`slide-${lineNum}`} className="min-w-full snap-center snap-always shrink-0">
                  {renderLineBlock(lineNum)}
               </div>
            ))}
            <div className="min-w-full snap-center snap-always shrink-0">
               {renderGoaliesBlock()}
            </div>
          </div>

          <div className="flex justify-center items-center gap-2">
            {[0, 1, 2, 3, 4].map((index) => (
              <button
                key={`dot-${index}`}
                onClick={(e) => {
                  e.stopPropagation();
                  scrollToSlide(index);
                }}
                className="p-1.5 -m-1.5 focus:outline-none" 
              >
                <div
                  className={clsx(
                    "h-2 rounded-full transition-all duration-300 ease-out opacity-80",
                    currentSlide === index ? "w-10 bg-surface-level1" : "w-2 border border-surface-level1 bg-surface-border hover:bg-surface-border"
                  )}
                />
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-6 w-full">
          {[1, 2, 3, 4].map(lineNum => (
            <div 
              key={`view-line-${lineNum}`} 
              className="bg-brand-glow rounded-3xl pt-4 pb-1 shadow-sm"
            >
              {renderLineBlock(lineNum)}
            </div>
          ))}
          <div className="bg-brand-glow rounded-3xl pt-4 pb-1 shadow-sm">
            {renderGoaliesBlock()}
          </div>
        </div>
      )}

      {isEditMode && hasManageAccess && (
        <div className="pt-8 pb-[5vh]">
          <ButtonLP onClick={(e) => {
            e.stopPropagation();
            handlePublish();
          }} isLoading={isPublishing}>
            Опубликовать состав
          </ButtonLP>
        </div>
      )}

    </div>
  );
};