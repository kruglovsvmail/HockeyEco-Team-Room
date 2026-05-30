import React, { useState, useEffect, useRef, Suspense, lazy, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import clsx from 'clsx';
import { getAuthHeaders, getImageUrl } from '../utils/helpers';
import { ChipTabs } from '../ui/ChipTabs';
import { useAccess } from '../hooks/useAccess';
import { BottomSheet } from '../ui/BottomSheet';
import { ButtonLP } from '../ui/Button-LP';
import { PhoneInputLP, TextInputLP } from '../ui/Input-LP';
import { Avatar } from '../ui/Avatar';
import { Icon } from '../ui/Icon';
import { useFocusRevalidate } from '../hooks/useFocusRevalidate';
import { PageLoader } from '../ui/Loader';
import { FadeIn } from '../ui/FadeIn';

const TeamAllMembers = lazy(() => import('../components/MyTeam/TeamAllMembers').then(m => ({ default: m.TeamAllMembers })));
const TeamRosterPlayers = lazy(() => import('../components/MyTeam/TeamRosterPlayers').then(m => ({ default: m.TeamRosterPlayers })));
const TeamStaffMembers = lazy(() => import('../components/MyTeam/TeamStaffMembers').then(m => ({ default: m.TeamStaffMembers })));

const TEAM_TABS = [
  { id: 'all', label: 'Состав' },
  { id: 'roster', label: 'Ростер' },
  { id: 'staff', label: 'Представители' }
];

export const MyTeamPage = () => {
  const { openRightPanel, selectedTeam, user } = useOutletContext();
  const selectedTeamId = selectedTeam?.id;

  // Ключ кэша для разграничения разных хоккейных команд
  const cacheKey = `tr_cached_team_${selectedTeamId}`;

  // Состояние готовности анимации перехода страницы (предотвращает лаги Main Thread)
  const [isPageReady, setIsPageReady] = useState(false);

  // Подтягиваем слепок игроков выбранной команды из памяти телефона за 0 миллисекунд
  const [teamData, setTeamData] = useState(() => {
    if (selectedTeamId) {
      const cached = localStorage.getItem(cacheKey);
      return cached ? JSON.parse(cached) : { members: [], roster: [], staff: [] };
    }
    return { members: [], roster: [], staff: [] };
  });

  // Извлекаем полные параметры команды из сохраненного локального кэша для мгновенной отрисовки
  const [activeTeamDetails, setActiveTeamDetails] = useState(() => {
    if (selectedTeamId) {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        return parsed.fullDetails || null;
      }
    }
    return null;
  });

  // Динамическое определение флага включения цветов из localStorage с приоритетом локально загруженных цветов из БД
  const isColorsEnabled = localStorage.getItem('tr_use_team_colors') !== 'false';
  const teamColorSource = activeTeamDetails?.color_home_1 || selectedTeam?.color_home_1;
  const hasTeamColor = isColorsEnabled && !!teamColorSource;
  const activeBrandColor = hasTeamColor ? teamColorSource : 'var(--color-brand)';

  const [activeTab, setActiveTab] = useState('all');

  // Лоадер активируется только если мы зашли в команду впервые и на устройстве нет её кэша
  const [isLoading, setIsLoading] = useState(() => {
    if (selectedTeamId) {
      return !localStorage.getItem(cacheKey);
    }
    return true;
  });
  
  // Режимы удаления и восстановления
  const [isEditMode, setIsEditMode] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState(null);
  const [animatingOutId, setAnimatingOutId] = useState(null);

  // СОСТОЯНИЯ ДЛЯ ШТОРКИ ДОБАВЛЕНИЯ В СОСТАВ
  const [isMemberSheetOpen, setIsMemberSheetOpen] = useState(false);
  const [searchPhone, setSearchPhone] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmittingMember, setIsSubmittingMember] = useState(false);

  // СОСТОЯНИЯ ДЛЯ ШТОРКИ ДОБАВЛЕНИЯ В РОСТЕР
  const [isRosterSheetOpen, setIsRosterSheetOpen] = useState(false);
  const [rosterStep, setRosterStep] = useState('list');
  const [selectedMemberForRoster, setSelectedMemberForRoster] = useState(null);
  const [rosterPosition, setRosterPosition] = useState('forward');
  const [rosterJerseyNumber, setRosterJerseyNumber] = useState('');
  const [isSubmittingRoster, setIsSubmittingRoster] = useState(false);

  // Сквозной расчет гранулярных прав в связке с In-Memory матрицей
  const { checkAccess } = useAccess(user, selectedTeam);
  
  // Вычисляем базовый статус: имеет ли текущий юзер вообще менеджерские роли в этой команде
  const teamRoles = selectedTeam?.user_role?.split(',').map(r => r.trim()) || [];
  const isTeamOwner = selectedTeam?.owner_id === user?.id;
  const isManagerOrCoach = isTeamOwner || teamRoles.some(r => ['team_manager', 'team_admin', 'head_coach', 'coach'].includes(r));

  // Гранулярный допуск по подписке для каждой вкладки отдельно
  const hasAllTabManageAccess = checkAccess('TEAM_MANAGE_TAB_ALL');
  const hasRosterTabManageAccess = checkAccess('TEAM_MANAGE_TAB_ROSTER');
  
  const rafRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const stickyHeaderRef = useRef(null);

  // Активация легкого отложенного рендеринга страницы при её монтировании
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsPageReady(true);
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  // Реактивная синхронизация стейта при быстром переключении команд в сайдбаре тренером
  useEffect(() => {
    if (!selectedTeamId) return;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      setTeamData(parsed);
      setActiveTeamDetails(parsed.fullDetails || null);
      setIsLoading(false);
    } else {
      setTeamData({ members: [], roster: [], staff: [] });
      setActiveTeamDetails(null);
      setIsLoading(true);
    }
  }, [selectedTeamId, cacheKey]);

  const fetchTeamData = useCallback(async () => {
    if (!selectedTeamId) return;
    
    if (teamData.members.length === 0 && teamData.roster.length === 0) {
      setIsLoading(true);
    }

    try {
      const headers = getAuthHeaders();
      
      const [detailsRes, myTeamsRes] = await Promise.all([
        fetch(`${import.meta.env.VITE_API_URL}/api/teams/${selectedTeamId}/details`, { headers }),
        fetch(`${import.meta.env.VITE_API_URL}/api/teams/my`, { headers })
      ]);

      if (detailsRes.ok && myTeamsRes.ok) {
        const detailsData = await detailsRes.json();
        const myTeamsData = await myTeamsRes.json();
        
        const currentFullTeamRow = myTeamsData.teams?.find(t => t.id === selectedTeamId);
        if (currentFullTeamRow) {
          setActiveTeamDetails(currentFullTeamRow);
        }
        
        setTeamData(detailsData);
        
        localStorage.setItem(cacheKey, JSON.stringify({
          ...detailsData,
          fullDetails: currentFullTeamRow
        }));
      }
    } catch (err) { 
      console.error('Ошибка сети при загрузке состава команды (работаем в офлайне):', err); 
    } finally { 
      setIsLoading(false); 
    }
  }, [selectedTeamId, cacheKey, teamData.members.length, teamData.roster.length]);

  useEffect(() => {
    fetchTeamData();
  }, [fetchTeamData]);

  useFocusRevalidate(fetchTeamData);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    setIsEditMode(false);
  }, [activeTab]);

  useEffect(() => {
    const clean = searchPhone.replace(/\D/g, '');
    if (clean.length === 10) {
      const delayDebounce = setTimeout(async () => {
        setIsSearching(true);
        setSearchResult(null);
        try {
          const res = await fetch(`${import.meta.env.VITE_API_URL}/api/teams/${selectedTeamId}/users/search?phone=${clean}`, {
            headers: getAuthHeaders()
          });
          if (res.ok) {
            setSearchResult(await res.json());
          }
        } catch (err) {
          console.error(err);
        } finally {
          setIsSearching(false);
        }
      }, 300);
      return () => clearTimeout(delayDebounce);
    } else {
      setSearchResult(null);
    }
  }, [searchPhone, selectedTeamId]);

  const confirmExcludeMember = async () => {
    if (!memberToRemove) return;
    const targetMemberId = memberToRemove.member_id;

    setMemberToRemove(null);
    setAnimatingOutId(targetMemberId);

    setTimeout(async () => {
      try {
        const endpointPath = activeTab === 'roster'
          ? `api/teams/${selectedTeamId}/roster/${targetMemberId}/exclude`
          : `api/teams/${selectedTeamId}/members/${targetMemberId}/exclude`;

        const res = await fetch(`${import.meta.env.VITE_API_URL}/${endpointPath}`, {
          method: 'POST',
          headers: getAuthHeaders()
        });

        if (res.ok) {
          setTeamData(prev => {
            let updated;
            if (activeTab === 'roster') {
              updated = {
                ...prev,
                roster: prev.roster.filter(p => p.member_id !== targetMemberId),
                members: prev.members.map(m => m.member_id === targetMemberId ? { ...m, position: null, jersey_number: null } : m),
                fullDetails: activeTeamDetails
              };
            } else {
              updated = {
                ...prev,
                members: prev.members.map(m => m.member_id === targetMemberId ? { ...m, left_at: new Date().toISOString() } : m),
                roster: prev.roster.filter(p => p.member_id !== targetMemberId),
                staff: prev.staff.filter(s => s.member_id !== targetMemberId),
                fullDetails: activeTeamDetails
              };
            }
            
            localStorage.setItem(cacheKey, JSON.stringify(updated));
            return updated;
          });
        }
      } catch (err) {
        console.error(err);
      } finally {
        setAnimatingOutId(null);
      }
    }, 200);
  };

  const handleAddMemberSubmit = async () => {
    if (!searchResult?.success || !searchResult?.user || searchResult.user.is_already_in_team) return;
    setIsSubmittingMember(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/teams/${selectedTeamId}/members`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: searchResult.user.id })
      });
      if (res.ok) {
        setIsMemberSheetOpen(false);
        await fetchTeamData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmittingMember(false);
    }
  };

  const handleAddRosterSubmit = async () => {
    if (!selectedMemberForRoster || !rosterJerseyNumber || jerseyNumberError) return;
    setIsSubmittingRoster(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/teams/${selectedTeamId}/roster`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId: selectedMemberForRoster.member_id,
          position: rosterPosition,
          jerseyNumber: parseInt(rosterJerseyNumber, 10)
        })
      });
      if (res.ok) {
        setIsRosterSheetOpen(false);
        await fetchTeamData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmittingRoster(false);
    }
  };

  const handleOpenRosterSheet = (position) => {
    setRosterPosition(position);
    setRosterStep('list');
    setSelectedMemberForRoster(null);
    setRosterJerseyNumber('');
    setIsRosterSheetOpen(true);
  };

  const playerWithSameNumber = teamData.roster?.find(p => String(p.jersey_number) === String(rosterJerseyNumber));
  const jerseyNumberError = playerWithSameNumber ? `Этот номер уже занят игроком ${playerWithSameNumber.last_name || playerWithSameNumber.lastName || ''}` : '';

  const membersAvailableForRoster = teamData.members?.filter(
    m => !m.left_at && !teamData.roster?.some(r => r.member_id === m.member_id)
  ) || [];

  const handleScroll = (e) => {
    const currentScroll = e.target.scrollTop;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      if (stickyHeaderRef.current) {
        const isStuck = currentScroll > 84;
        stickyHeaderRef.current.createdAt = isStuck; 
        if (isStuck) {
          stickyHeaderRef.current.classList.add('shadow-md', 'bg-surface-border');
          stickyHeaderRef.current.classList.remove('bg-transparent');
        } else {
          stickyHeaderRef.current.classList.remove('shadow-md', 'bg-surface-border');
          stickyHeaderRef.current.classList.add('bg-transparent');
        }
      }
    });
  };

  const handlePersonClick = useCallback((person) => {
    // ВАЖНОЕ ИСПРАВЛЕНИЕ: Передаем объекты авторизации (user, selectedTeam) внутрь панели, так как она живет вне Outlet
    openRightPanel('userDetails', { 
      ...person, 
      team_id: selectedTeamId,
      currentRoster: teamData.roster,
      onRefresh: fetchTeamData,
      activeBrandColor: hasTeamColor ? activeBrandColor : null,
      user,
      selectedTeam
    }, 'Профиль');
  }, [openRightPanel, selectedTeamId, teamData.roster, fetchTeamData, hasTeamColor, activeBrandColor, user, selectedTeam]);

  const handleExcludeClick = useCallback((member) => setMemberToRemove(member), []);
  const handleContainerClick = () => { if (isEditMode) setIsEditMode(false); };

  const tabIndex = TEAM_TABS.findIndex(t => t.id === activeTab);
  const translateX = `-${tabIndex * 33.333333}%`;

  if (!isPageReady) {
    return <PageLoader />;
  }

  return (
    <FadeIn className="h-full">
      <div 
        ref={scrollContainerRef}
        className="h-full overflow-y-auto scrollbar-hide bg-surface-border animate-fade-in relative z-10 snap-y snap-proximity"
        onScroll={handleScroll}
        onClick={handleContainerClick}
      >
        <style>
          {`
            @keyframes jiggle { 0% { transform: rotate(-1.5deg); } 50% { transform: rotate(1.5deg); } 100% { transform: rotate(-1.5deg); } }
            .animate-jiggle { animation: jiggle 0.3s ease-in-out infinite; }
            .jiggle-delay-0 { animation-delay: 0s; } .jiggle-delay-1 { animation-delay: 0.1s; } .jiggle-delay-2 { animation-delay: 0.2s; }
            @keyframes slotExit { 0% { transform: scale(1); opacity: 1; } 100% { transform: scale(0.2); opacity: 0; } }
            .animate-slot-exit { animation: slotExit 0.2s cubic-bezier(0.6, -0.28, 0.735, 0.045) both; }
          `}
        </style>

        {/* Шапка профиля команды */}
        <div className="bg-surface-base pt-4 px-5 pb-4 mb-2 mx-4 rounded-3xl flex items-center gap-4 shadow-lg shrink-0 border-b border-surface-level2 snap-start">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center overflow-hidden drop-shadow-sm shrink-0 ml-4">
            <img src={getImageUrl(activeTeamDetails?.logo_url || selectedTeam?.logo_url)} alt={activeTeamDetails?.name || selectedTeam?.name} className="w-full h-full object-contain p-1" />
          </div>
          <div className="flex flex-col min-w-0">
            <h2 className="text-[14px] font-black uppercase tracking-widest text-content-main leading-tight truncate">{activeTeamDetails?.name || selectedTeam?.name}</h2>
            <span className="text-[10px] font-black uppercase tracking-[0.2em] mt-1" style={{ color: activeBrandColor }}>
              Состав команды
            </span>
          </div>
        </div>

        <div ref={stickyHeaderRef} className="snap-start sticky top-0 z-40 shrink-0 transition-all duration-300 ease-in-out border-b border-surface-level2 bg-transparent">
          <ChipTabs tabs={TEAM_TABS} activeTab={activeTab} onChange={setActiveTab} className="!px-0" activeColor={hasTeamColor ? activeBrandColor : null} />
        </div>

        <div className="w-full overflow-hidden pt-4 min-h-screen pb-[30vh]">
          {isLoading ? (
            <PageLoader />
          ) : (
            <div className="flex w-[300%] transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] items-start" style={{ transform: `translateX(${translateX})` }}>
              <div className="w-1/3 shrink-0 transition-opacity duration-500" style={{ opacity: activeTab === 'all' ? 1 : 0.3 }}>
                <Suspense fallback={<PageLoader />}>
                  {activeTab === 'all' && (
                    <TeamAllMembers 
                      members={teamData.members || []} onPersonClick={handlePersonClick} isEditMode={isEditMode}
                      setIsEditMode={setIsEditMode} hasManageAccess={hasAllTabManageAccess} isManager={isManagerOrCoach} onExcludeClick={handleExcludeClick} animatingOutId={animatingOutId}
                      activeBrandColor={hasTeamColor ? activeBrandColor : null}
                      onAddClick={() => {
                        setSearchPhone('');
                        setSearchResult(null);
                        setIsMemberSheetOpen(true);
                      }}
                    />
                  )}
                </Suspense>
              </div>

              <div className="w-1/3 shrink-0 transition-opacity duration-500" style={{ opacity: activeTab === 'roster' ? 1 : 0.3 }}>
                <Suspense fallback={<PageLoader />}>
                  {activeTab === 'roster' && (
                    <TeamRosterPlayers 
                      roster={teamData.roster || []} onPersonClick={handlePersonClick} isEditMode={isEditMode}
                      setIsEditMode={setIsEditMode} hasManageAccess={hasRosterTabManageAccess} isManager={isManagerOrCoach} onExcludeClick={handleExcludeClick} animatingOutId={animatingOutId}
                      activeBrandColor={hasTeamColor ? activeBrandColor : null}
                      onAddClick={handleOpenRosterSheet}
                    />
                  )}
                </Suspense>
              </div>

              <div className="w-1/3 shrink-0 transition-opacity duration-500" style={{ opacity: activeTab === 'staff' ? 1 : 0.3 }}>
                <Suspense fallback={<PageLoader />}>
                  {activeTab === 'staff' && (
                    <TeamStaffMembers 
                      staff={teamData.staff || []} 
                      onPersonClick={handlePersonClick} 
                      activeBrandColor={hasTeamColor ? activeBrandColor : null}
                    />
                  )}
                </Suspense>
              </div>
            </div>
          )}
        </div>

        {/* 1. ШТОРКА ДОБАВЛЕНИЯ В КОМАНДУ */}
        <BottomSheet isOpen={isMemberSheetOpen} onClose={() => setIsMemberSheetOpen(false)}>
          <div className="flex min-h-[200px] flex-col gap-4">
            <h3 className="text-lg font-black text-content-main">Добавить в команду</h3>
            
            <PhoneInputLP 
              label="Номер телефона пользователя" value={searchPhone} 
              onChange={setSearchPhone} placeholder="900 000 00 00" 
              activeColor={hasTeamColor ? activeBrandColor : null}
            />

            {isSearching && (
              <div className="text-xs font-black uppercase tracking-widest animate-pulse py-4 text-center" style={{ color: activeBrandColor }}>
                Поиск в базе...
              </div>
            )}

            {searchResult && !searchResult.success && (
              <div className="p-4 bg-danger-muted text-danger rounded-2xl text-xs font-normal tracking-wider text-center mt-2">
                {searchResult.message}
              </div>
            )}

            {searchResult && searchResult.success && searchResult.user && (
              <div className="flex flex-col w-full mt-2 animate-fade-in">
                <div className="flex items-center justify-between p-4 bg-surface-level2 rounded-2xl border border-surface-border w-full">
                  <div className="flex flex-col text-left">
                    <span className="text-base font-black text-content-main leading-tight">{searchResult.user.last_name || searchResult.user.lastName}</span>
                    <span className="text-xs text-content-muted mt-1 font-bold">{searchResult.user.first_name || searchResult.user.firstName}</span>
                  </div>
                  <Avatar 
                    photoUrl={searchResult.user.avatar_url || searchResult.user.avatarUrl} firstName={searchResult.user.first_name || searchResult.user.firstName} 
                    lastName={searchResult.user.last_name || searchResult.user.lastName} className="w-12 h-12 rounded-xl" 
                  />
                </div>

                <div className="flex items-center justify-between w-full px-1 text-[10px] font-black uppercase tracking-widest mt-2 text-content-subtle">
                  <span>{searchResult.user.virtual_code ? `Вирт. код: ${searchResult.user.virtual_code}` : 'Официальный аккаунт'}</span>
                  <span className={clsx(
                    searchResult.user.status === 'active' && "text-green-500",
                    searchResult.user.status === 'inactive' && "text-yellow-500",
                    searchResult.user.status === 'banned' && "text-red-500"
                  )}>
                    {searchResult.user.status}
                  </span>
                </div>

                {searchResult.user.is_already_in_team && (
                  <div 
                    style={hasTeamColor ? { backgroundColor: `${activeBrandColor}1a`, borderColor: `${activeBrandColor}33`, color: activeBrandColor } : {}}
                    className={clsx(
                      "p-4 border rounded-2xl text-xs font-black uppercase tracking-wider text-center mt-4",
                      !hasTeamColor && "bg-brand/10 border-brand/20 text-brand"
                    )}
                  >
                    Этот пользователь уже состоит в вашей команде
                  </div>
                )}

                <ButtonLP 
                  variant="primary" className="mt-6" isLoading={isSubmittingMember}
                  disabled={searchResult.user.status === 'banned' || searchResult.user.is_already_in_team} 
                  onClick={handleAddMemberSubmit}
                  activeColor={hasTeamColor ? activeBrandColor : null}
                >
                  {searchResult.user.is_already_in_team 
                    ? 'Уже в команде' 
                    : searchResult.user.is_archived_in_team 
                      ? 'Восстановить в команде' 
                      : 'Добавить в команду'}
                </ButtonLP>
              </div>
            )}
          </div>
        </BottomSheet>

        {/* 2. ШТОРКА ДОБАВЛЕНИЯ В РОСТЕР */}
        <BottomSheet isOpen={isRosterSheetOpen} onClose={() => setIsRosterSheetOpen(false)}>
          {rosterStep === 'list' ? (
            <div className="flex flex-col gap-4">
              <h3 className="text-lg font-black text-content-main mb-1">Выберите игрока для ростера</h3>
              {membersAvailableForRoster.length > 0 ? (
                <div className="flex flex-col gap-2 max-h-[55vh] overflow-y-auto scrollbar-hide">
                  {membersAvailableForRoster.map(player => (
                    <div 
                      key={player.member_id} onClick={() => { setSelectedMemberForRoster(player); setRosterStep('form'); }}
                      className="flex items-center justify-between p-3 bg-surface-level2 rounded-xl border border-transparent active:border-brand/30 transition-all cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar photoUrl={player.avatar_url} firstName={player.first_name} lastName={player.last_name} className="w-10 h-10 rounded-xl" />
                        <div className="flex flex-col text-left">
                          <span className="text-[13px] font-bold text-content-main">{player.last_name} {player.first_name}</span>
                          <span className="text-[10px] text-content-muted mt-0.5">Член состава команды</span>
                        </div>
                      </div>
                      <Icon name="chevron_right" className="w-4 h-4 text-content-subtle" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-xs font-black uppercase tracking-widest text-content-muted">Все члены состава уже добавлены в ростер</div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-5 animate-fade-in text-left">
              <div className="flex items-center gap-3 border-b border-surface-level2 pb-3">
                <button onClick={() => setRosterStep('list')} className="p-1 -ml-1 transition-opacity hover:opacity-80 outline-none" style={{ color: activeBrandColor }}>
                  <Icon name="chevron_left" className="w-5 h-5" />
                </button>
                <h3 className="text-lg font-black text-content-main">Параметры ростера</h3>
              </div>

              <div className="p-3 bg-surface-level2 rounded-xl flex items-center gap-3">
                <Avatar photoUrl={selectedMemberForRoster?.avatar_url} firstName={selectedMemberForRoster?.first_name} lastName={selectedMemberForRoster?.last_name} className="w-10 h-10 rounded-xl" />
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-content-main">{selectedMemberForRoster?.last_name} {selectedMemberForRoster?.first_name}</span>
                </div>
              </div>

              <TextInputLP 
                label="Игровой номер"
                placeholder="Например: 17" 
                value={rosterJerseyNumber}
                onChange={(val) => setRosterJerseyNumber(val.replace(/\D/g, ''))} error={jerseyNumberError}
                activeColor={hasTeamColor ? activeBrandColor : null}
              />

              <ButtonLP 
                variant="primary" className="mt-6" isLoading={isSubmittingRoster}
                disabled={!rosterJerseyNumber || !!jerseyNumberError} onClick={handleAddRosterSubmit}
                activeColor={hasTeamColor ? activeBrandColor : null}
              >
                Добавить в ростер
              </ButtonLP>
            </div>
          )}
        </BottomSheet>

        {/* Шторка подтверждения удаления */}
        <BottomSheet isOpen={!!memberToRemove} onClose={() => setMemberToRemove(null)}>
          <div className="flex flex-col items-center text-center gap-4 py-2">
            <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mb-2">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <h3 className="text-lg font-black text-content-main leading-tight">
              {activeTab === 'roster' ? 'Исключить из ростера?' : 'Исключить из состава?'}
            </h3>
            <p className="text-[13px] text-content-muted max-w-[270px]">
              {activeTab === 'roster' 
                ? `Вы уверены, что хотите исключить игрока ${memberToRemove?.last_name || memberToRemove?.lastName || ''} ${memberToRemove?.first_name || memberToRemove?.firstName || ''} из ростера? Он потеряет номер и позицию на этот турнир, но останется в общем списке команды.`
                : `Вы уверены, что хотите полностью исключить игрока ${memberToRemove?.last_name || memberToRemove?.lastName || ''} ${memberToRemove?.first_name || memberToRemove?.firstName || ''} из состава? Он будет переведен в архив.`}
            </p>
            <div className="flex gap-3 w-full mt-4">
              <ButtonLP variant="outline" onClick={() => setMemberToRemove(null)} className="flex-1">Отмена</ButtonLP>
              <ButtonLP variant="primary" className="flex-1 !bg-red-500 hover:!bg-red-600 !border-red-500 !text-white" onClick={confirmExcludeMember}>Да, исключить</ButtonLP>
            </div>
          </div>
        </BottomSheet>
      </div>
    </FadeIn>
  );
};