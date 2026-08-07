import React, { useState, useEffect, useRef, Suspense, lazy, useCallback, useMemo } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { getAuthHeaders, getImageUrl } from '../utils/helpers';
import { SegmentedControl } from '../ui/SegmentedControl';
import { useAccess } from '../hooks/useAccess';
import { BottomSheet } from '../ui/BottomSheet';
import { ConfirmSheet } from '../ui/ConfirmSheet';
import { ButtonLP } from '../ui/Button-LP';
import { PhoneInputLP } from '../ui/Input-LP';
import { Avatar } from '../ui/Avatar';
import { Icon } from '../ui/Icon';
import { ContainerContent } from '../ui/ContainerContent';
import { useFocusRevalidate } from '../hooks/useFocusRevalidate';
import { usePageVisit } from '../hooks/usePageVisit';
import { PageLoader } from '../ui/Loader';
import { FadeIn } from '../ui/FadeIn';
import { TeamPageHeader, TeamPageHeaderSpacer } from '../components/TeamPageHeader';

const TeamAllMembers = lazy(() => import('../components/MyTeam/TeamAllMembers').then(m => ({ default: m.TeamAllMembers })));
const TeamStaffMembers = lazy(() => import('../components/MyTeam/TeamStaffMembers').then(m => ({ default: m.TeamStaffMembers })));

// У клуба нет игрового ростера: номера и амплуа — атрибуты команды, а не организации.
// Поэтому вкладки три: люди клуба, его штаб и составы.
const CLUB_OPTIONS = [
  { value: 'all', label: 'Состав' },
  { value: 'staff', label: 'Штаб' },
  { value: 'teams', label: 'Команды' }
];

const VIEW_MODE_KEY = 'tr_club_view_all';

export const ClubPage = () => {
  const {
    openRightPanel, selectedClub, user, onClubUpdated, registerHeaderEdit, handleTeamChange,
  } = useOutletContext();

  const selectedClubId = selectedClub?.id;
  const navigate = useNavigate();

  usePageVisit('my_clubs');

  const cacheKey = `tr_cached_club_${selectedClubId}`;
  const [isPageReady, setIsPageReady] = useState(false);

  const [clubData, setClubData] = useState(() => {
    if (selectedClubId) {
      const cached = localStorage.getItem(cacheKey);
      return cached ? JSON.parse(cached) : { members: [], staff: [], teams: [] };
    }
    return { members: [], staff: [], teams: [] };
  });

  const [activeClubDetails, setActiveClubDetails] = useState(() => {
    if (selectedClubId) {
      const cached = localStorage.getItem(cacheKey);
      if (cached) return JSON.parse(cached).club || null;
    }
    return null;
  });

  const isColorsEnabled = localStorage.getItem('tr_use_team_colors') !== 'false';
  const clubColorSource = activeClubDetails?.color_1 || selectedClub?.color_1;
  const hasClubColor = isColorsEnabled && !!clubColorSource;
  const activeBrandColor = hasClubColor ? clubColorSource : 'var(--color-brand)';

  const [activeTab, setActiveTab] = useState('all');
  const [viewMode, setViewMode] = useState(
    () => localStorage.getItem(VIEW_MODE_KEY) === 'table' ? 'table' : 'grid'
  );

  const handleViewModeChange = useCallback((mode) => {
    localStorage.setItem(VIEW_MODE_KEY, mode);
    setViewMode(mode);
  }, []);

  const [isLoading, setIsLoading] = useState(() => (selectedClubId ? !localStorage.getItem(cacheKey) : true));

  const [isEditMode, setIsEditMode] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState(null);
  const [animatingOutId, setAnimatingOutId] = useState(null);

  // Поиск по составу клуба: в клубе на четыре команды легко набирается сотня людей,
  // и листать их плитками бессмысленно. Фильтруем по ФИО и по названию команды —
  // «покажи всех из Метеор-2» такой же частый запрос, как поиск по фамилии.
  const [memberSearch, setMemberSearch] = useState('');

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return clubData.members || [];

    return (clubData.members || []).filter(m => {
      const fio = `${m.last_name || ''} ${m.first_name || ''} ${m.middle_name || ''}`.toLowerCase();
      const teams = (m.teams || []).map(t => t.name).join(' ').toLowerCase();
      return fio.includes(q) || teams.includes(q);
    });
  }, [clubData.members, memberSearch]);

  const [isMemberSheetOpen, setIsMemberSheetOpen] = useState(false);
  const [searchPhone, setSearchPhone] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmittingMember, setIsSubmittingMember] = useState(false);

  const { checkClubAccess } = useAccess(user, null, selectedClub);

  const hasMembersManageAccess = checkClubAccess('CLUB_MANAGE_MEMBERS');

  const rafRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const stickyHeaderRef = useRef(null);

  const fetchClubData = useCallback(async (silent = false) => {
    if (!selectedClubId) return;
    if (!silent) setIsLoading(true);

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/clubs/${selectedClubId}/details`, {
        headers: getAuthHeaders()
      });
      if (!res.ok) throw new Error('Не удалось загрузить клуб');

      const data = await res.json();
      const next = {
        club: data.club || null,
        members: data.members || [],
        staff: data.staff || [],
        teams: data.teams || [],
      };

      setClubData(next);
      setActiveClubDetails(next.club);
      localStorage.setItem(cacheKey, JSON.stringify(next));
    } catch (err) {
      console.error('Ошибка загрузки клуба:', err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedClubId, cacheKey]);

  useEffect(() => {
    if (!selectedClubId) return;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      setClubData(parsed);
      setActiveClubDetails(parsed.club || null);
      setIsLoading(false);
      fetchClubData(true);
    } else {
      fetchClubData(false);
    }
  }, [selectedClubId, cacheKey, fetchClubData]);

  useFocusRevalidate(() => fetchClubData(true));

  // Небольшая задержка перед первым кадром — тот же приём, что и на странице команды:
  // без него список успевает мигнуть до применения цвета клуба.
  useEffect(() => {
    const timer = setTimeout(() => setIsPageReady(true), 50);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    setIsEditMode(false);
  }, [activeTab]);

  // Поиск человека по телефону — та же схема, что и при добавлении в команду
  useEffect(() => {
    const clean = searchPhone.replace(/\D/g, '');
    if (clean.length === 10 && selectedClubId) {
      const delayDebounce = setTimeout(async () => {
        setIsSearching(true);
        setSearchResult(null);
        try {
          const res = await fetch(`${import.meta.env.VITE_API_URL}/api/clubs/${selectedClubId}/users/search?phone=${clean}`, {
            headers: getAuthHeaders()
          });
          setSearchResult(await res.json());
        } catch (err) {
          console.error('Ошибка поиска пользователя:', err);
        } finally {
          setIsSearching(false);
        }
      }, 300);
      return () => clearTimeout(delayDebounce);
    }
    setSearchResult(null);
  }, [searchPhone, selectedClubId]);

  const handleAddMemberSubmit = async () => {
    if (!searchResult?.success || !searchResult?.user || searchResult.user.is_already_in_club) return;
    setIsSubmittingMember(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/clubs/${selectedClubId}/members`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: searchResult.user.id })
      });
      if (res.ok) {
        setIsMemberSheetOpen(false);
        setSearchPhone('');
        setSearchResult(null);
        await fetchClubData(true);
      }
    } catch (err) {
      console.error('Ошибка добавления в клуб:', err);
    } finally {
      setIsSubmittingMember(false);
    }
  };

  const confirmExcludeMember = async () => {
    if (!memberToRemove) return;
    const target = memberToRemove;

    setMemberToRemove(null);
    setAnimatingOutId(target.member_id);

    setTimeout(async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL}/api/clubs/${selectedClubId}/members/${target.user_id}/exclude`,
          { method: 'POST', headers: getAuthHeaders() }
        );
        if (res.ok) await fetchClubData(true);
      } catch (err) {
        console.error('Ошибка исключения из клуба:', err);
      } finally {
        setAnimatingOutId(null);
      }
    }, 200);
  };

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
      club_id: selectedClubId,
      onRefresh: () => fetchClubData(true),
      activeBrandColor: hasClubColor ? activeBrandColor : null,
      user,
      selectedClub,
    }, 'Участник клуба');
  }, [openRightPanel, selectedClubId, fetchClubData, hasClubColor, activeBrandColor, user, selectedClub]);

  const handleEditClubProfileClick = () => {
    openRightPanel('editClubProfile', {
      clubId: selectedClubId,
      onRefresh: () => fetchClubData(true),
      onClubUpdated,
      activeBrandColor: hasClubColor ? activeBrandColor : null
    }, 'Клуб');
  };

  // Карандаш в системной шапке — тот же механизм, что и у профиля команды
  const canEditClubProfile = checkClubAccess('CLUB_EDIT_PROFILE');
  const editClubProfileRef = useRef(null);
  editClubProfileRef.current = handleEditClubProfileClick;

  useEffect(() => {
    if (!registerHeaderEdit) return;
    registerHeaderEdit(canEditClubProfile ? () => editClubProfileRef.current?.() : null);
    return () => registerHeaderEdit(null);
  }, [canEditClubProfile, registerHeaderEdit]);

  const handleExcludeClick = useCallback((member) => setMemberToRemove(member), []);
  const handleContainerClick = () => { if (isEditMode) setIsEditMode(false); };

  // Команды, из которых человека выкинет каскадом — показываем в предупреждении поимённо
  const affectedTeamNames = (memberToRemove?.teams || []).map(t => t.name).join(', ');

  const tabIndex = CLUB_OPTIONS.findIndex(t => t.value === activeTab);
  const translateX = `-${tabIndex * 33.333333}%`;

  if (!isPageReady) return <PageLoader />;

  if (!selectedClubId) {
    return (
      <div className="flex items-center justify-center h-full px-8 text-center">
        <span className="text-[12px] font-bold uppercase tracking-widest text-content-subtle">
          Вы не состоите ни в одном клубе
        </span>
      </div>
    );
  }

  return (
    <FadeIn
      className="h-full relative overflow-hidden flex flex-col "
      style={hasClubColor ? { '--color-brand': activeBrandColor } : {}}
    >
      <TeamPageHeader
        selectedTeam={selectedClub}
        activeTeamDetails={activeClubDetails}
        activeBrandColor={activeBrandColor}
      />

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

        <TeamPageHeaderSpacer />

        <div ref={stickyHeaderRef} className="snap-start sticky top-0 z-40 shrink-0 transition-all duration-300 ease-in-out bg-transparent px-3 pt-2 pb-2">
          <SegmentedControl
            options={CLUB_OPTIONS}
            value={activeTab}
            onChange={setActiveTab}
            activeColor={hasClubColor ? activeBrandColor : null}
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
                    <>
                    {/* Тихая строка поиска: без рамки и заголовка, проявляется только
                        при фокусе — чтобы не спорить за внимание со списком людей */}
                    <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl bg-surface-level1/60 border border-transparent focus-within:border-surface-border transition-colors">
                      <Icon name="search" className="w-3.5 h-3.5 shrink-0 text-content-subtle" />
                      <input
                        type="text"
                        value={memberSearch}
                        onChange={(e) => setMemberSearch(e.target.value)}
                        placeholder="Поиск по фамилии или команде"
                        className="flex-1 min-w-0 bg-transparent outline-none border-none text-[12px] font-bold text-content-main placeholder:text-content-subtle placeholder:font-medium"
                      />
                      {memberSearch && (
                        <button
                          type="button"
                          onClick={() => setMemberSearch('')}
                          className="shrink-0 text-content-subtle hover:text-content-main transition-colors outline-none cursor-pointer"
                        >
                          <Icon name="close" className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <TeamAllMembers
                      members={filteredMembers}
                      onPersonClick={handlePersonClick}
                      isEditMode={isEditMode}
                      setIsEditMode={setIsEditMode}
                      hasManageAccess={hasMembersManageAccess}
                      isManager={hasMembersManageAccess}
                      onExcludeClick={handleExcludeClick}
                      animatingOutId={animatingOutId}
                      activeBrandColor={hasClubColor ? activeBrandColor : null}
                      viewMode={viewMode}
                      onViewModeChange={handleViewModeChange}
                      title="Состав клуба"
                      archivedTitle="Ушедшие из клуба"
                      emptyLabel={memberSearch ? 'Никого не нашли' : 'В клубе пока никого нет'}
                      onAddClick={() => {
                        setSearchPhone('');
                        setSearchResult(null);
                        setIsMemberSheetOpen(true);
                      }}
                    />
                    </>
                  )}
                </Suspense>
              </div>

              <div className="w-1/3 shrink-0 transition-opacity duration-500" style={{ opacity: activeTab === 'staff' ? 1 : 0.3 }}>
                <Suspense fallback={<PageLoader />}>
                  {activeTab === 'staff' && (
                    <TeamStaffMembers
                      staff={clubData.staff || []}
                      onPersonClick={handlePersonClick}
                      activeBrandColor={hasClubColor ? activeBrandColor : null}
                    />
                  )}
                </Suspense>
              </div>

              <div className="w-1/3 shrink-0 transition-opacity duration-500" style={{ opacity: activeTab === 'teams' ? 1 : 0.3 }}>
                {activeTab === 'teams' && (
                  <FadeIn>
                    <ContainerContent title="Команды клуба" count={(clubData.teams || []).length}>
                      {(clubData.teams || []).length > 0 ? (
                        <div className="flex flex-col gap-2 mt-1">
                          {clubData.teams.map(team => (
                            <button
                              key={team.id}
                              type="button"
                              onClick={() => {
                                handleTeamChange?.({ ...team, club_id: selectedClubId });
                                navigate('/my-team');
                              }}
                              className="flex items-center justify-between gap-3 p-3 bg-surface-level2 rounded-xl border border-transparent active:border-brand/30 transition-all cursor-pointer text-left outline-none"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-10 h-10 rounded-xl bg-surface-level1 p-1 flex items-center justify-center shrink-0">
                                  <img src={getImageUrl(team.logo_url)} alt={team.name} className="w-full h-full object-contain" />
                                </div>
                                <div className="flex flex-col min-w-0">
                                  <span className="text-[14px] font-bold text-content-main truncate">{team.name}</span>
                                  <span className="text-[10px] font-bold uppercase tracking-widest text-content-muted mt-0.5">
                                    {team.city || 'Город не указан'} · {team.members_count} чел.
                                  </span>
                                </div>
                              </div>
                              <Icon name="chevron_right" className="w-4 h-4 text-content-subtle shrink-0" />
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-6 text-[10px] font-bold uppercase tracking-widest text-content-subtle opacity-50 select-none">
                          У клуба пока нет команд
                        </div>
                      )}
                    </ContainerContent>
                  </FadeIn>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Шторка добавления человека в клуб */}
        <BottomSheet isOpen={isMemberSheetOpen} onClose={() => setIsMemberSheetOpen(false)}>
          <div className="flex min-h-[200px] flex-col gap-4">
            <h3 className="text-[18px] font-black text-content-main">Добавить в клуб</h3>
            <PhoneInputLP
              label="Номер телефона пользователя"
              value={searchPhone}
              onChange={setSearchPhone}
              placeholder="900 000 00 00"
              activeColor={hasClubColor ? activeBrandColor : null}
            />
            {isSearching && (
              <div className="text-[14px] font-black uppercase tracking-widest animate-pulse py-4 text-center" style={{ color: activeBrandColor }}>
                Поиск в базе...
              </div>
            )}
            {searchResult && !searchResult.success && (
              <div className="p-4 bg-danger-muted text-danger rounded-2xl text-[14px] font-normal tracking-wider text-center mt-2">
                {searchResult.message}
              </div>
            )}
            {searchResult && searchResult.success && searchResult.user && (
              <div className="flex flex-col w-full mt-2 animate-fade-in">
                <div className="flex items-center justify-between p-4 bg-surface-level2 rounded-2xl border border-surface-border w-full">
                  <div className="flex flex-col text-left">
                    <span className="text-[18px] font-black text-content-main leading-tight">{searchResult.user.last_name}</span>
                    <span className="text-[14px] text-content-muted mt-1 font-bold">{searchResult.user.first_name}</span>
                  </div>
                  <Avatar
                    photoUrl={searchResult.user.avatar_url}
                    firstName={searchResult.user.first_name}
                    lastName={searchResult.user.last_name}
                    className="w-12 h-12 rounded-xl"
                  />
                </div>
                <div className="flex items-center justify-between w-full px-1 text-[10px] font-black uppercase tracking-widest mt-2 text-content-subtle">
                  <span>{searchResult.user.virtual_code ? `Вирт. код: ${searchResult.user.virtual_code}` : 'Официальный аккаунт'}</span>
                  <span className={clsx(
                    searchResult.user.status === 'active' && "text-green-500",
                    searchResult.user.status === 'inactive' && "text-yellow-500",
                    searchResult.user.status === 'banned' && "text-red-500"
                  )}>{searchResult.user.status}</span>
                </div>
                {searchResult.user.is_already_in_club && (
                  <div
                    style={hasClubColor ? { backgroundColor: `${activeBrandColor}1a`, borderColor: `${activeBrandColor}33`, color: activeBrandColor } : {}}
                    className={clsx("p-4 border rounded-2xl text-[14px] font-black uppercase tracking-wider text-center mt-4", !hasClubColor && "bg-brand/10 border-brand/20 text-brand")}
                  >
                    Этот пользователь уже состоит в клубе
                  </div>
                )}
                <ButtonLP
                  variant="primary"
                  className="mt-6"
                  isLoading={isSubmittingMember}
                  disabled={searchResult.user.status === 'banned' || searchResult.user.is_already_in_club}
                  onClick={handleAddMemberSubmit}
                  activeColor={hasClubColor ? activeBrandColor : null}
                >
                  {searchResult.user.is_already_in_club
                    ? 'Уже в клубе'
                    : searchResult.user.is_archived_in_club
                    ? 'Восстановить в клубе'
                    : 'Добавить в клуб'}
                </ButtonLP>
              </div>
            )}
          </div>
        </BottomSheet>

        {/* Исключение из клуба — предупреждаем про каскад по командам клуба */}
        <ConfirmSheet
          isOpen={!!memberToRemove}
          onClose={() => setMemberToRemove(null)}
          onConfirm={confirmExcludeMember}
          title="Исключить из клуба?"
          description={
            affectedTeamNames
              ? `${memberToRemove?.last_name || ''} ${memberToRemove?.first_name || ''} будет исключён из клуба, а вместе с ним — из команд клуба: ${affectedTeamNames}. Полномочия в клубе и этих командах будут сняты. История участия сохранится.`
              : `${memberToRemove?.last_name || ''} ${memberToRemove?.first_name || ''} будет исключён из клуба. Полномочия в клубе будут сняты. История участия сохранится.`
          }
          confirmLabel="Да, исключить"
          variant="danger"
        />
      </div>
    </FadeIn>
  );
};
