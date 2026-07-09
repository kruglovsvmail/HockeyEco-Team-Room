import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useOutletContext, useNavigate, useLocation } from 'react-router-dom';
import { useAccess } from '../../hooks/useAccess';
import { SubscriptionStub } from '../../ui/SubscriptionStub';
import { PageLoader } from '../../ui/Loader';
import { Icon } from '../../ui/Icon';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { FadeIn } from '../../ui/FadeIn';
import { ApplicationCard } from '../../components/Manager/Season/ApplicationCard';
import { isDivisionPast } from '../../components/Manager/Season/seasonUtils';
import { TeamPageHeader, TeamPageHeaderSpacer } from '../../components/TeamPageHeader';
import { getAuthHeaders } from '../../utils/helpers';

const FILTER_OPTIONS = [
  { value: 'all', label: 'Все' },
  { value: 'current', label: 'Текущие' },
  { value: 'past', label: 'Прошедшие' },
];

export function SeasonRostersPage() {
  const { selectedTeam, user, openRightPanel } = useOutletContext();
  const { checkAccess } = useAccess(user, selectedTeam);
  const navigate = useNavigate();
  const location = useLocation();

  const hasAccess = checkAccess('MGR_SEASON_ROSTERS');

  const [applications, setApplications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  const isColorsEnabled = localStorage.getItem('tr_use_team_colors') !== 'false';
  const teamCacheKey = selectedTeam?.id ? `tr_cached_team_${selectedTeam.id}` : null;
  const cachedTeamData = teamCacheKey ? localStorage.getItem(teamCacheKey) : null;
  const cachedDetails = cachedTeamData ? JSON.parse(cachedTeamData)?.fullDetails : null;
  const teamColorSource = cachedDetails?.color_home_1 || selectedTeam?.color_home_1;
  const hasTeamColor = isColorsEnabled && !!teamColorSource;
  const activeBrandColor = hasTeamColor ? teamColorSource : 'var(--color-brand)';

  const loadData = useCallback(async () => {
    if (!selectedTeam?.id) return;
    setIsLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/manager/seasons/${selectedTeam.id}/applications`, { headers: getAuthHeaders() });
      const json = await res.json();
      if (json.success) setApplications(json.applications || []);
    } catch (err) {
      console.error('Ошибка загрузки заявок:', err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedTeam?.id]);

  // Страница остаётся смонтированной под оверлеем деталей заявки (тот же трюк, что и с событиями),
  // поэтому при возврате из деталей достаточно перезагрузить список по факту смены пути, без ремонта карточек.
  useEffect(() => {
    if (hasAccess && location.pathname === '/manager/season-rosters') loadData();
  }, [hasAccess, location.pathname, loadData]);

  const filteredApplications = useMemo(() => {
    if (filter === 'current') return applications.filter(a => !isDivisionPast(a));
    if (filter === 'past') return applications.filter(a => isDivisionPast(a));
    return applications;
  }, [applications, filter]);

  if (!hasAccess) {
    return (
      <SubscriptionStub
        isOpen={true}
        onClose={() => navigate(-1)}
        title="Доступ ограничен"
        description="Для подачи и управления заявками команды в лиги, необходимо оформить или продлить подписку."
      />
    );
  }

  const handleCreateOpen = () => {
    openRightPanel('createApplication', { teamId: selectedTeam.id, loadData, activeBrandColor: hasTeamColor ? activeBrandColor : null }, 'Новая заявка');
  };

  return (
    <FadeIn
      className="h-full relative overflow-hidden flex flex-col transition-colors duration-300"
      style={hasTeamColor ? { '--color-brand': activeBrandColor } : {}}
    >
      <TeamPageHeader
        selectedTeam={selectedTeam}
        activeTeamDetails={cachedDetails}
        activeBrandColor={activeBrandColor}
      />

      <div className="flex-1 overflow-y-auto scrollbar-hide pb-24 relative z-10">
        <TeamPageHeaderSpacer />

        <div className="px-3 pt-2 pb-3 sticky top-0 z-20 bg-surface-base/80 backdrop-blur-sm">
          <SegmentedControl options={FILTER_OPTIONS} value={filter} onChange={setFilter} activeColor={hasTeamColor ? activeBrandColor : null} />
        </div>

        <div className="px-3 flex flex-col gap-3">
          {isLoading ? (
            <div className="py-16"><PageLoader /></div>
          ) : filteredApplications.length === 0 ? (
            <div className="p-5 bg-surface-level1 rounded-3xl shadow-md text-left">
              <p className="text-[14px] font-medium text-content-main leading-relaxed">
                {applications.length === 0
                  ? 'У команды пока нет ни одной заявки. Нажмите «+», чтобы подать заявку в открытый дивизион лиги.'
                  : 'В этой категории заявок пока нет.'}
              </p>
            </div>
          ) : (
            filteredApplications.map(app => (
              <ApplicationCard
                key={app.id}
                app={app}
                onClick={() => navigate(`/application/${app.id}`)}
              />
            ))
          )}
        </div>
      </div>

      <div className="fixed bottom-6 right-6 z-40">
        <button
          type="button"
          onClick={handleCreateOpen}
          style={{ backgroundColor: activeBrandColor }}
          className="w-14 h-14 rounded-full shadow-2xl text-white flex items-center justify-center transition-all active:scale-90 border border-white/10"
        >
          <Icon name="plus" className="w-6 h-6 stroke-[3]" />
        </button>
      </div>
    </FadeIn>
  );
}
