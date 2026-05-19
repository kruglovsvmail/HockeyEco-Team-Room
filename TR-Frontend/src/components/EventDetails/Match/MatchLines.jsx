import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getImageUrl, getAuthHeaders } from '../../../utils/helpers';
import { BottomSheet } from '../../../ui/BottomSheet';
import { ButtonLP } from '../../../ui/Button-LP';
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

export const MatchLines = ({ event }) => {
  const [attendees, setAttendees] = useState([]);
  const [draftLines, setDraftLines] = useState([]);
  const [isPublished, setIsPublished] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isPublishing, setIsPublishing] = useState(false);
  const [hasManageAccess, setHasManageAccess] = useState(false);

  const [currentSlide, setCurrentSlide] = useState(0);
  const [activeSelection, setActiveSelection] = useState(null);

  const { user, checkAccess, selectedTeam } = useAccess();
  const carouselRef = useRef(null);
  
  const cacheKey = `draft_lines_${event?.event_id}_${event?.my_team_id}`;

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
          setDraftLines(JSON.parse(cached));
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
          if (existingPlayer) {
             setDraftLines(prev => prev.filter(l => l.player_id !== existingPlayer.player_id));
          }
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
          lines: draftLines.map(l => ({ player_id: l.player_id, line_number: l.line_number, position_in_line: l.position_in_line }))
        })
      });
      const data = await res.json();
      if (data.success) {
        setIsPublished(true);
        setIsEditMode(false);
        setActiveSelection(null);
        localStorage.removeItem(cacheKey);
      }
    } catch (err) {
      console.error('Ошибка публикации:', err);
    } finally {
      setIsPublishing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-32 text-[11px] font-black text-content-muted uppercase tracking-widest bg-surface-level2/30 rounded-2xl border border-surface-border/50 border-dashed">
        Загрузка состава...
      </div>
    );
  }

  if (!isPublished && !hasManageAccess) {
    return (
      <div className="flex flex-col justify-center items-center h-48 bg-surface-level1 rounded-[24px] border border-surface-border/30 shadow-sm p-6 text-center gap-3">
        <div className="w-12 h-12 bg-surface-level2/50 rounded-full flex items-center justify-center">
           <svg className="w-6 h-6 text-content-muted/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
           </svg>
        </div>
        <div>
          <h3 className="text-sm font-black text-content-main uppercase tracking-wider mb-1">Состав скрыт</h3>
          <p className="text-[11px] text-content-muted">Тренерский штаб формирует звенья на матч</p>
        </div>
      </div>
    );
  }

  const unassignedPlayers = attendees.filter(a => !draftLines.some(l => String(l.player_id) === String(a.id)));

  const renderSlot = (lineNum, pos, labelText = null) => {
    const player = draftLines.find(l => l.line_number === lineNum && l.position_in_line === pos);
    const isSelected = activeSelection?.type === 'slot' && activeSelection?.line === lineNum && activeSelection?.pos === pos;

    return (
      <div 
        key={`${lineNum}-${pos}`}
        onClick={() => handleSlotClick(lineNum, pos)}
        className={clsx(
          "flex flex-col items-center w-[100px] relative transition-opacity duration-200 shrink-0",
          isEditMode ? "cursor-pointer" : "pointer-events-none",
          (isEditMode && !player && !isSelected) ? "opacity-70 hover:opacity-100" : "opacity-100"
        )}
      >
        <div className={clsx(
          "w-16 h-16 rounded-2xl bg-brand-glow flex items-center justify-center relative transition-all duration-200 shrink-0 box-border z-0",
          isSelected ? "ring-2 ring-brand scale-110" : "",
          !player && "border-[1px]",
          player && "shadow-lg border border-surface-border bg-surface-level3"
        )}>
          {player ? (
            <>
              <div className="w-full h-full rounded-3xl overflow-hidden">
                {player.avatar_url ? (
                   <img src={getImageUrl(player.avatar_url)} alt="" className="w-full h-full object-cover pointer-events-none" />
                ) : (
                   <div className="w-full h-full bg-brand text-brand flex items-center justify-center text-[12px] font-bold pointer-events-none">
                     {getInitials(player.first_name, player.last_name)}
                   </div>
                )}
              </div>
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
      <h3 className="text-[13px] font-black text-content-muted uppercase tracking-widest mb-8">
        Пятерка #{lineNum}
      </h3>
      <div className="flex justify-center gap-3 w-full mb-3">
        {renderSlot(lineNum, 'LW')}
        {renderSlot(lineNum, 'C')}
        {renderSlot(lineNum, 'RW')}
      </div>
      <div className="flex justify-center gap-8 w-full">
        {renderSlot(lineNum, 'LD')}
        {renderSlot(lineNum, 'RD')}
      </div>
    </div>
  );

  const renderGoaliesBlock = () => (
    <div className="w-full flex flex-col items-center pb-6">
       <h3 className="text-[13px] font-black text-content-muted uppercase tracking-widest mb-8">
          Вратари
       </h3>
       <div className="flex justify-center gap-3 w-full">
          {renderSlot(5, 'G', 'Осн.')}
          {renderSlot(6, 'G', 'Зап.')}
          {renderSlot(7, 'G', 'Рез.')}
       </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-5 mt-4 ">
      
      <style>
        {`
          .custom-scrollbar::-webkit-scrollbar { height: 4px; }
          .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
          .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(150, 150, 150, 0.2); border-radius: 10px; }
          
          /* Магия схлапывания работает благодаря min-h-0 на вложенном блоке */
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
        `}
      </style>
      
      <div className="flex justify-between items-end ">
        <span className="text-[10px] font-black text-content-muted uppercase tracking-widest">
          {isEditMode ? 'Формирование' : 'Пятерки на матч'}
        </span>
        {hasManageAccess && (
          <button
            onClick={() => {
              if (isEditMode) {
                setIsEditMode(false);
                setActiveSelection(null);
                loadInitialData(); 
              } else {
                setIsEditMode(true);
              }
            }}
            className="text-[11px] font-bold text-brand uppercase tracking-wider active:opacity-70 transition-opacity"
          >
            {isEditMode ? 'Отмена' : 'Редактировать'}
          </button>
        )}
      </div>

      {/* ИЗМЕНЕНО: Сначала растягиваем на весь экран, затем применяем grid-схлапывание */}
      <div className="w-screen relative left-[50%] right-[50%] -ml-[50vw] -mr-[50vw] mb-1">
        <div className={clsx("grid-expand-transition", isEditMode && "expanded")}>
          {/* Слой с min-h-0 необходим для работы анимации grid-template-rows */}
          <div className="grid-expand-inner">
            <div className="bg-brand-glow border-y border-surface-border pt-4 h-[164px] flex flex-col w-full">
              <div className="px-4 flex justify-between items-center mb-5 w-full max-w-7xl mx-auto">
                <span className="text-[9px] font-semibold text-content-muted uppercase tracking-widest">
                  Доступные игроки ({unassignedPlayers.length})
                </span>
              </div>
              
              <div className="flex flex-col flex-wrap content-start overflow-x-auto overflow-y-hidden custom-scrollbar snap-x snap-mandatory px-4 gap-1 h-[120px] w-full max-w-7xl mx-auto">
                {unassignedPlayers.map((p) => {
                  const isSelected = activeSelection?.type === 'chip' && activeSelection?.id === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => handleChipClick(p.id)}
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
               <div key={`slide-${lineNum}`} className="min-w-full snap-center shrink-0">
                  {renderLineBlock(lineNum)}
               </div>
            ))}
            <div className="min-w-full snap-center shrink-0">
               {renderGoaliesBlock()}
            </div>
          </div>

          <div className="flex justify-center items-center gap-2">
            {[0, 1, 2, 3, 4].map((index) => (
              <button
                key={`dot-${index}`}
                onClick={() => scrollToSlide(index)}
                className="p-1.5 -m-1.5 focus:outline-none" 
              >
                <div
                  className={clsx(
                    "h-2 rounded-full transition-all duration-300 ease-out opacity-80",
                    currentSlide === index ? "w-10 bg-surface-level1" : "w-2 border border-surface-level1 bg-surface-border hover:bg-surface-border/80"
                  )}
                />
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-6 w-full mt-2">
          {[1, 2, 3, 4].map(lineNum => renderLineBlock(lineNum))}
          {renderGoaliesBlock()}
        </div>
      )}

      {isEditMode && hasManageAccess && (
        <div className="pt-4">
          <ButtonLP onClick={handlePublish} isLoading={isPublishing}>
            Опубликовать состав
          </ButtonLP>
        </div>
      )}

    </div>
  );
};