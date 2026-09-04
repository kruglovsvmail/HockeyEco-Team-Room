import React, { useState, useEffect, useRef, Suspense, lazy, useCallback, useMemo } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { getAuthHeaders, getImageUrl, getTeamUiColor } from '../utils/helpers';
import { SegmentedControl } from '../ui/SegmentedControl';
import { useAccess } from '../hooks/useAccess';
import { PERMISSIONS, ROLES } from '../utils/permissions';
import { BottomSheet } from '../ui/BottomSheet';
import { TopSheet } from '../ui/TopSheet';
import { ConfirmSheet } from '../ui/ConfirmSheet';
import { ButtonLP } from '../ui/Button-LP';
import { PhoneInputLP, TextInputLP } from '../ui/Input-LP';
import { CheckboxLP } from '../ui/Checkbox-LP';
import { Avatar } from '../ui/Avatar';
import { Icon } from '../ui/Icon';
import { useFocusRevalidate } from '../hooks/useFocusRevalidate';
import { usePageVisit } from '../hooks/usePageVisit';
import { PageLoader } from '../ui/Loader';
import { FadeIn } from '../ui/FadeIn';
import { TeamPageHeader, TeamPageHeaderSpacer } from '../components/TeamPageHeader';

const TeamAllMembers = lazy(() => import('../components/MyTeam/TeamAllMembers').then(m => ({ default: m.TeamAllMembers })));
const TeamRosterPlayers = lazy(() => import('../components/MyTeam/TeamRosterPlayers').then(m => ({ default: m.TeamRosterPlayers })));
const TeamStaffMembers = lazy(() => import('../components/MyTeam/TeamStaffMembers').then(m => ({ default: m.TeamStaffMembers })));

const TEAM_OPTIONS = [
  { value: 'all', label: 'Коллектив' },
  { value: 'roster', label: 'Состав' },
  { value: 'staff', label: 'Штаб' }
];

// Ключи localStorage для переключателя «плитка / таблица» (отдельно на вкладку)
const VIEW_MODE_KEYS = {
  all: 'tr_myteam_view_all',
  roster: 'tr_myteam_view_roster'
};

// Менеджерские разделы команды: пункты шторки «⋯» в шапке. Раньше это были отдельные
// строки сайдбара, и каждая тянула за собой свой список команд — у менеджера с тремя
// командами список повторялся четырежды. Здесь команда задана самой страницей, и выбирать
// её нечем. Маршруты прежние: прямые ссылки и /application/:appId работают как работали.
const TEAM_MENU_SECTIONS = [
  { id: 'MGR_SEASON_ROSTERS', path: '/manager/season-rosters', label: 'Заявки', hint: 'Заявки команды на сезон', icon: 'roster' },
  { id: 'MGR_FINANCES', path: '/manager/finances', label: 'Финансы', hint: 'Бухгалтерия и сборы', icon: 'registry' },
  { id: 'MGR_HANDBOOKS', path: '/manager/handbooks', label: 'Вне платформы', hint: 'Соперники и турниры вне HockeyEco', icon: 'handbook' },
];

export const MyTeamPage = () => {
  const { openRightPanel, selectedTeam, user, onTeamUpdated, registerHeaderMenu } = useOutletContext();
  const selectedTeamId = selectedTeam?.id;
  const navigate = useNavigate();

  usePageVisit('my_teams');

  const cacheKey = `tr_cached_team_${selectedTeamId}`;
  const [isPageReady, setIsPageReady] = useState(false);

  const [teamData, setTeamData] = useState(() => {
    if (selectedTeamId) {
      const cached = localStorage.getItem(cacheKey);
      return cached ? JSON.parse(cached) : { members: [], roster: [], staff: [] };
    }
    return { members: [], roster: [], staff: [] };
  });

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

  const isColorsEnabled = localStorage.getItem('tr_use_team_colors') !== 'false';
  const teamColorSource = getTeamUiColor(activeTeamDetails) || getTeamUiColor(selectedTeam);
  const hasTeamColor = isColorsEnabled && !!teamColorSource;
  const activeBrandColor = hasTeamColor ? teamColorSource : 'var(--color-brand)';

  const [activeTab, setActiveTab] = useState('all');

  // Режим отображения списков людей: 'grid' (плитка, по умолчанию) или 'table'.
  // Своё значение для каждой вкладки, живёт в localStorage конкретного устройства.
  const [viewModeAll, setViewModeAll] = useState(
    () => localStorage.getItem(VIEW_MODE_KEYS.all) === 'table' ? 'table' : 'grid'
  );
  const [viewModeRoster, setViewModeRoster] = useState(
    () => localStorage.getItem(VIEW_MODE_KEYS.roster) === 'table' ? 'table' : 'grid'
  );

  const handleViewModeChange = useCallback((tab, mode) => {
    localStorage.setItem(VIEW_MODE_KEYS[tab], mode);
    if (tab === 'all') setViewModeAll(mode);
    else setViewModeRoster(mode);
  }, []);

  const [isLoading, setIsLoading] = useState(() => {
    if (selectedTeamId) {
      return !localStorage.getItem(cacheKey);
    }
    return true;
  });
  
  const [isEditMode, setIsEditMode] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState(null);
  // Галочка «убрать и из клуба»: показывается, только если эта команда —
  // единственная связь человека с клубом (флаг offer_club_exclusion считает бэкенд)
  const [alsoRemoveFromClub, setAlsoRemoveFromClub] = useState(false);
  const [animatingOutId, setAnimatingOutId] = useState(null);

  const [isMemberSheetOpen, setIsMemberSheetOpen] = useState(false);
  const [searchPhone, setSearchPhone] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmittingMember, setIsSubmittingMember] = useState(false);

  const [isRosterSheetOpen, setIsRosterSheetOpen] = useState(false);
  const [rosterStep, setRosterStep] = useState('list');
  const [selectedMemberForRoster, setSelectedMemberForRoster] = useState(null);
  const [rosterPosition, setRosterPosition] = useState('forward');
  const [rosterJerseyNumber, setRosterJerseyNumber] = useState('');
  const [isSubmittingRoster, setIsSubmittingRoster] = useState(false);

  const { checkAccess } = useAccess(user, selectedTeam);
  
  const teamRoles = selectedTeam?.user_role?.split(',').map(r => r.trim()) || [];
  const isTeamOwner = selectedTeam?.owner_id === user?.id;
  const isManagerOrCoach = isTeamOwner || teamRoles.some(r => ['team_manager', 'team_admin', 'head_coach', 'coach'].includes(r));

  const hasAllTabManageAccess = checkAccess('TEAM_MANAGE_TAB_ALL');
  const hasRosterTabManageAccess = checkAccess('TEAM_MANAGE_TAB_ROSTER');
  
  const rafRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const stickyHeaderRef = useRef(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsPageReady(true);
    }, 150);
    return () => clearTimeout(timer);
  }, []);

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
      console.error('Ошибка сети состава команды:', err); 
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
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          // Флаг имеет смысл только на вкладке «Состав»: из ростера человек уходит,
          // оставаясь в команде, и клуба это не касается вовсе.
          body: JSON.stringify({ alsoRemoveFromClub: activeTab === 'all' && alsoRemoveFromClub })
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
    openRightPanel('userDetails', { 
      ...person, 
      team_id: selectedTeamId,
      currentRoster: teamData.roster,
      onRefresh: fetchTeamData,
      activeBrandColor: hasTeamColor ? activeBrandColor : null,
      user,
      selectedTeam
    }, 'Участник команды');
  }, [openRightPanel, selectedTeamId, teamData.roster, fetchTeamData, hasTeamColor, activeBrandColor, user, selectedTeam]);

  const handleEditTeamProfileClick = () => {
    openRightPanel('editTeamProfile', {
      teamId: selectedTeamId,
      onRefresh: fetchTeamData,
      onTeamUpdated: onTeamUpdated,
      activeBrandColor: hasTeamColor ? activeBrandColor : null
    }, 'Команда');
  };

  // Редактирование профиля и менеджерские разделы собраны в одну шторку «⋯» в системной
  // шапке (Header.jsx, справа). Отдельного карандаша здесь больше нет: справа всегда одна
  // кнопка, а все действия с командой лежат под ней.
  // Обработчик правки держим в ref, чтобы вызывалась всегда актуальная версия
  // (с текущими fetchTeamData / brand-цветом), без перерегистрации.
  const canEditTeamProfile = checkAccess('TEAM_EDIT_PROFILE');
  const editTeamProfileRef = useRef(null);
  editTeamProfileRef.current = handleEditTeamProfileClick;

  const [isTeamMenuOpen, setIsTeamMenuOpen] = useState(false);

  // Двухуровневая проверка, ровно как раньше в сайдбаре: роль решает, есть ли пункт вообще,
  // а checkAccess — заперт ли он замком (у части ролей раздел требует подписки). Кликнуть по
  // запертому можно: страницы разделов сами показывают SubscriptionStub.
  const teamMenuSections = useMemo(() => {
    const roles = selectedTeam?.user_role?.split(',').map(r => r.trim()).filter(Boolean) || [];
    if (selectedTeam?.owner_id === user?.id) roles.push(ROLES.OWNER);
    const isGlobalAdmin = user?.globalRole === ROLES.GLOBAL_ADMIN || user?.global_role === ROLES.GLOBAL_ADMIN;

    return TEAM_MENU_SECTIONS
      .filter(section => isGlobalAdmin || roles.some(r => PERMISSIONS[section.id]?.allowedRoles.includes(r)))
      .map(section => ({ ...section, locked: !checkAccess(section.id) }));
  }, [selectedTeam, user, checkAccess]);

  // Кнопку «⋯» не показываем вовсе, если под ней пусто: у обычного игрока команды
  // ни одного пункта нет, и пустая шторка выглядела бы поломкой. Ждём и isPageReady:
  // до него страница возвращает лоадер, а сама шторка живёт в её разметке — кнопка
  // существовала бы, но ни на что не откликалась.
  const hasTeamMenu = isPageReady && (canEditTeamProfile || teamMenuSections.length > 0);

  useEffect(() => {
    if (!registerHeaderMenu) return;
    registerHeaderMenu(hasTeamMenu ? () => setIsTeamMenuOpen(true) : null);
    return () => registerHeaderMenu(null);
  }, [hasTeamMenu, registerHeaderMenu]);

  // Шторке даём уехать наверх и только потом монтируем страницу или панель — тот же приём,
  // что в сайдбаре: без задержки анимация закрытия дёргается на слабых телефонах.
  const closeTeamMenuThen = useCallback((action) => {
    setIsTeamMenuOpen(false);
    setTimeout(action, 200);
  }, []);

  const handleExcludeClick = useCallback((member) => {
    setAlsoRemoveFromClub(false);
    setMemberToRemove(member);
  }, []);
  const handleContainerClick = () => { if (isEditMode) setIsEditMode(false); };

  const tabIndex = TEAM_OPTIONS.findIndex(t => t.value === activeTab);
  const translateX = `-${tabIndex * 33.333333}%`;

  // Человек в системе есть, а команды у него ещё нет. Так выглядит любой, кто
  // зарегистрировался сам: аккаунт создан и номер подтверждён, но в состав его пока
  // никто не добавил. Проверка обязана стоять ДО isPageReady — без выбранной команды
  // загрузка данных не стартует, и лоадер крутился бы вечно.
  if (!selectedTeam) {
    return (
      <FadeIn className="h-full flex flex-col items-center justify-center px-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-level1 border border-surface-border mb-5">
          <Icon name="team" className="w-7 h-7 text-content-subtle" />
        </div>

        <h2 className="text-[18px] font-black text-content-main mb-2">
          Вы ещё не в команде
        </h2>

        <p className="text-[14px] font-semibold text-content-muted leading-relaxed max-w-xs">
          Ваш аккаунт создан, но вы пока не привязаны ни к одной команде.
          Попросите руководителя команды добавить вас — после этого здесь появится состав,
          расписание и всё остальное.
        </p>

        <p className="text-[12px] font-semibold text-content-subtle leading-relaxed max-w-xs mt-4">
          Руководителю понадобится ваш номер телефона — тот, который вы подтвердили при регистрации.
        </p>
      </FadeIn>
    );
  }

  if (!isPageReady) {
    return <PageLoader />;
  }

  return (
    <FadeIn 
      className="h-full relative overflow-hidden flex flex-col "
      style={hasTeamColor ? { '--color-brand': activeBrandColor } : {}}
    >
      {/* Редактирование профиля живёт в шторке «⋯» системной шапки (Header.jsx) —
          здесь onEditClick не передаём, поэтому в этой карточке кнопки нет. */}
      <TeamPageHeader
        selectedTeam={selectedTeam}
        activeTeamDetails={activeTeamDetails}
        activeBrandColor={activeBrandColor}
      />

      {/* Шторка действий команды. Верхняя, а не нижняя: выезжает оттуда же, где нажали
          на «⋯» в шапке. Портал выносит её из FadeIn, где переопределён --color-brand,
          поэтому цвет команды передаём инлайном, а не классом text-brand. */}
      <TopSheet isOpen={isTeamMenuOpen} onClose={() => setIsTeamMenuOpen(false)}>
        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-content-subtle px-1">
            Управление командой
          </span>

          {canEditTeamProfile && (
            <button
              type="button"
              onClick={() => closeTeamMenuThen(() => editTeamProfileRef.current?.())}
              className="flex items-center justify-between p-3 bg-surface-level2 rounded-xl border border-transparent active:border-brand/30 transition-all cursor-pointer outline-none text-left w-full"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-surface-base border border-surface-border flex items-center justify-center shrink-0">
                  <Icon name="edit" className="w-5 h-5" style={{ color: activeBrandColor }} />
                </div>
                <div className="flex flex-col min-w-0 text-left">
                  <span className="text-[14px] font-bold text-content-main truncate">Профиль команды</span>
                  <span className="text-[10px] text-content-muted mt-0.5 truncate">Название, логотип, цвета</span>
                </div>
              </div>
              <Icon name="chevron_right" className="w-4 h-4 text-content-subtle shrink-0" />
            </button>
          )}

          {teamMenuSections.map(section => (
            <button
              key={section.id}
              type="button"
              onClick={() => closeTeamMenuThen(() => navigate(section.path))}
              className="flex items-center justify-between p-3 bg-surface-level2 rounded-xl border border-transparent active:border-brand/30 transition-all cursor-pointer outline-none text-left w-full"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-surface-base border border-surface-border flex items-center justify-center shrink-0">
                  <Icon name={section.icon} className="w-5 h-5" style={{ color: activeBrandColor }} />
                </div>
                <div className="flex flex-col min-w-0 text-left">
                  <span className={clsx("text-[14px] font-bold text-content-main truncate", section.locked && "opacity-70")}>
                    {section.label}
                  </span>
                  <span className="text-[10px] text-content-muted mt-0.5 truncate">{section.hint}</span>
                </div>
              </div>
              {section.locked
                ? <Icon name="lock" className="w-4 h-4 text-content-muted/60 shrink-0" />
                : <Icon name="chevron_right" className="w-4 h-4 text-content-subtle shrink-0" />}
            </button>
          ))}
        </div>
      </TopSheet>

      <div 
        ref={scrollContainerRef}
        className="h-full overflow-y-auto scrollbar-hide animate-fade-in relative z-10 snap-y snap-proximity"
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

        {/* Единый стандартизированный отступ */}
        <TeamPageHeaderSpacer />

        {/* Контрол обернут в строгие отступы pt-2, совпадающие с другими страницами */}
        <div ref={stickyHeaderRef} className="snap-start sticky top-0 z-40 shrink-0 transition-all duration-300 ease-in-out bg-transparent px-3 pt-2 pb-2">
          <SegmentedControl 
            options={TEAM_OPTIONS} 
            value={activeTab} 
            onChange={setActiveTab} 
            activeColor={hasTeamColor ? activeBrandColor : null}
          />
        </div>

        <div className="w-full overflow-hidden py-4 px-3 min-h-screen pb-[30vh]">
          {isLoading ? (
            <PageLoader />
          ) : (
            <div className="flex w-[300%] transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] items-start" style={{ transform: `translateX(${translateX})` }}>
              <div className="w-1/3 shrink-0 transition-opacity duration-500" style={{ opacity: activeTab === 'all' ? 1 : 0.3 }}>
                <Suspense fallback={<PageLoader />}>
                  {activeTab === 'all' && (
                    <TeamAllMembers
                      members={teamData.members || []} onPersonClick={handlePersonClick} isEditMode={isEditMode}
                      setIsEditMode={setIsEditMode} hasManageAccess={hasAllTabManageAccess} isManager={hasAllTabManageAccess} onExcludeClick={handleExcludeClick} animatingOutId={animatingOutId}
                      activeBrandColor={hasTeamColor ? activeBrandColor : null}
                      viewMode={viewModeAll}
                      onViewModeChange={(mode) => handleViewModeChange('all', mode)}
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
                      setIsEditMode={setIsEditMode} hasManageAccess={hasRosterTabManageAccess} isManager={hasRosterTabManageAccess} onExcludeClick={handleExcludeClick} animatingOutId={animatingOutId}
                      activeBrandColor={hasTeamColor ? activeBrandColor : null}
                      viewMode={viewModeRoster}
                      onViewModeChange={(mode) => handleViewModeChange('roster', mode)}
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

        {/* Шторки */}
        <BottomSheet isOpen={isMemberSheetOpen} onClose={() => setIsMemberSheetOpen(false)}>
          <div className="flex min-h-[200px] flex-col gap-4">
            <h3 className="text-[18px] font-black text-content-main">Добавить в команду</h3>
            <PhoneInputLP label="Номер телефона пользователя" value={searchPhone} onChange={setSearchPhone} placeholder="900 000 00 00" activeColor={hasTeamColor ? activeBrandColor : null} />
            {isSearching && <div className="text-[14px] font-black uppercase tracking-widest animate-pulse py-4 text-center" style={{ color: activeBrandColor }}>Поиск в базе...</div>}
            {searchResult && !searchResult.success && <div className="p-4 bg-danger-muted text-danger rounded-2xl text-[14px] font-normal tracking-wider text-center mt-2">{searchResult.message}</div>}
            {searchResult && searchResult.success && searchResult.user && (
              <div className="flex flex-col w-full mt-2 animate-fade-in">
                <div className="flex items-center justify-between p-4 bg-surface-level2 rounded-2xl border border-surface-border w-full">
                  <div className="flex flex-col text-left">
                    <span className="text-[18px] font-black text-content-main leading-tight">{searchResult.user.last_name || searchResult.user.lastName}</span>
                    <span className="text-[14px] text-content-muted mt-1 font-bold">{searchResult.user.first_name || searchResult.user.firstName}</span>
                  </div>
                  <Avatar photoUrl={searchResult.user.avatar_url || searchResult.user.avatarUrl} firstName={searchResult.user.first_name || searchResult.user.firstName} lastName={searchResult.user.last_name || searchResult.user.lastName} className="w-12 h-12 rounded-xl" />
                </div>
                <div className="flex items-center justify-between w-full px-1 text-[10px] font-black uppercase tracking-widest mt-2 text-content-subtle">
                  <span>{searchResult.user.virtual_code ? `Вирт. код: ${searchResult.user.virtual_code}` : 'Официальный аккаунт'}</span>
                  <span className={clsx(searchResult.user.status === 'active' && "text-green-500", searchResult.user.status === 'inactive' && "text-yellow-500", searchResult.user.status === 'banned' && "text-red-500")}>{searchResult.user.status}</span>
                </div>
                {searchResult.user.is_already_in_team && <div style={hasTeamColor ? { backgroundColor: `${activeBrandColor}1a`, borderColor: `${activeBrandColor}33`, color: activeBrandColor } : {}} className={clsx("p-4 border rounded-2xl text-[14px] font-black uppercase tracking-wider text-center mt-4", !hasTeamColor && "bg-brand/10 border-brand/20 text-brand")}>Этот пользователь уже состоит в вашей команде</div>}
                <ButtonLP variant="primary" className="mt-6" isLoading={isSubmittingMember} disabled={searchResult.user.status === 'banned' || searchResult.user.is_already_in_team} onClick={handleAddMemberSubmit} activeColor={hasTeamColor ? activeBrandColor : null}>
                  {searchResult.user.is_already_in_team ? 'Уже в команде' : searchResult.user.is_archived_in_team ? 'Восстановить в команде' : 'Добавить в команду'}
                </ButtonLP>
              </div>
            )}
          </div>
        </BottomSheet>

        <BottomSheet isOpen={isRosterSheetOpen} onClose={() => setIsRosterSheetOpen(false)}>
          {rosterStep === 'list' ? (
            <div className="flex flex-col gap-4">
              <h3 className="text-[18px] font-black text-content-main mb-1">Выберите игрока для ростера</h3>
              {membersAvailableForRoster.length > 0 ? (
                <div className="flex flex-col gap-2 max-h-[55vh] overflow-y-auto scrollbar-hide">
                  {membersAvailableForRoster.map(player => (
                    <div key={player.member_id} onClick={() => { setSelectedMemberForRoster(player); setRosterStep('form'); }} className="flex items-center justify-between p-3 bg-surface-level2 rounded-xl border border-transparent active:border-brand/30 transition-all cursor-pointer">
                      <div className="flex items-center gap-3">
                        <Avatar photoUrl={player.avatar_url} firstName={player.first_name} lastName={player.last_name} className="w-10 h-10 rounded-xl" />
                        <div className="flex flex-col text-left">
                          <span className="text-[14px] font-bold text-content-main">{player.last_name} {player.first_name}</span>
                          <span className="text-[10px] text-content-muted mt-0.5">Член состава команды</span>
                        </div>
                      </div>
                      <Icon name="chevron_right" className="w-4 h-4 text-content-subtle" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-[14px] font-black uppercase tracking-widest text-content-muted">Все члены состава уже добавлены в ростер</div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-5 animate-fade-in text-left">
              <div className="flex items-center gap-3 border-b border-surface-level2 pb-3">
                <button onClick={() => setRosterStep('list')} className="p-1 -ml-1 transition-opacity hover:opacity-80 outline-none" style={{ color: activeBrandColor }}><Icon name="chevron_left" className="w-5 h-5" /></button>
                <h3 className="text-[18px] font-black text-content-main">Параметры ростера</h3>
              </div>
              <div className="p-3 bg-surface-level2 rounded-xl flex items-center gap-3">
                <Avatar photoUrl={selectedMemberForRoster?.avatar_url} firstName={selectedMemberForRoster?.first_name} lastName={selectedMemberForRoster?.last_name} className="w-10 h-10 rounded-xl" />
                <div className="flex flex-col"><span className="text-[14px] font-bold text-content-main">{selectedMemberForRoster?.last_name} {selectedMemberForRoster?.first_name}</span></div>
              </div>
              <TextInputLP label="Игровой номер" placeholder="Например: 17" value={rosterJerseyNumber} onChange={(val) => setRosterJerseyNumber(val.replace(/\D/g, ''))} error={jerseyNumberError} activeColor={hasTeamColor ? activeBrandColor : null} />
              <ButtonLP variant="primary" className="mt-6" isLoading={isSubmittingRoster} disabled={!rosterJerseyNumber || !!jerseyNumberError} onClick={handleAddRosterSubmit} activeColor={hasTeamColor ? activeBrandColor : null}>Добавить в ростер</ButtonLP>
            </div>
          )}
        </BottomSheet>

        <ConfirmSheet
          isOpen={!!memberToRemove}
          onClose={() => setMemberToRemove(null)}
          onConfirm={confirmExcludeMember}
          title={activeTab === 'roster' ? 'Исключить из ростера?' : 'Исключить из состава?'}
          description={activeTab === 'roster'
            ? `Вы уверены, что хотите исключить игрока ${memberToRemove?.last_name || memberToRemove?.lastName || ''} ${memberToRemove?.first_name || memberToRemove?.firstName || ''} из ростера?`
            : `Вы уверены, что хотите полностью исключить игрока ${memberToRemove?.last_name || memberToRemove?.lastName || ''} ${memberToRemove?.first_name || memberToRemove?.firstName || ''} из состава?`}
          confirmLabel="Да, исключить"
          variant="danger"
          /* Фон блока — surface-base: сам квадратик чекбокса залит surface-level2,
             и на одноимённой подложке невыбранный чекбокс сливался с ней */
          extraContent={activeTab === 'all' && memberToRemove?.offer_club_exclusion ? (
            <div className="p-3 rounded-xl bg-surface-base border border-surface-border">
              <CheckboxLP
                checked={alsoRemoveFromClub}
                onChange={setAlsoRemoveFromClub}
                label="Убрать и из состава клуба"
                activeColor={hasTeamColor ? activeBrandColor : null}
              />
              <span className="block text-[10px] text-content-subtle leading-snug mt-2 ml-8">
                Эта команда — единственная в клубе, где он состоит, и клубных ролей у него нет.
                Без галочки останется в базе клуба как резерв.
              </span>
            </div>
          ) : null}
        />
      </div>
    </FadeIn>
  );
};