import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useOutletContext, useNavigate, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { getAuthHeaders } from '../utils/helpers';
import { SegmentedControl } from '../ui/SegmentedControl';
import { BottomSheet } from '../ui/BottomSheet';
import { ConfirmSheet } from '../ui/ConfirmSheet';
import { ButtonLP } from '../ui/Button-LP';
import { TextInputLP, PhoneInputLP } from '../ui/Input-LP';
import { Avatar } from '../ui/Avatar';
import { Icon } from '../ui/Icon';
import { Toast } from '../ui/Toast';
import { FadeIn } from '../ui/FadeIn';
import { PageLoader } from '../ui/Loader';
import { SectionHeader } from '../ui/SectionHeader';
import { useAccess } from '../hooks/useAccess';
import { usePageVisit } from '../hooks/usePageVisit';
import { TeamPageHeader, TeamPageHeaderSpacer } from '../components/TeamPageHeader';
import { TeamAllMembers } from '../components/MyTeam/TeamAllMembers';
import { TopSheet } from '../ui/TopSheet';
import { CommunityInfoTab } from '../components/Community/CommunityInfoTab';
import { CommunityChatLink } from '../ui/MessengerLogos';

// Вкладки страницы сообщества. Ростера с номерами тут нет — амплуа бинарное
// (полевой или вратарь), поэтому «Участники» делятся на два блока, а не на звенья.
const TABS = [
  { value: 'members', label: 'Участники' },
  { value: 'info', label: 'Инфо' },
  { value: 'staff', label: 'Штаб' },
  
];

const STAFF_ROLE_OPTIONS = [
  { value: 'community_manager', label: 'Руководитель' },
  { value: 'community_admin', label: 'Администратор' },
];

// Владельца снять нельзя: он не строка в штабе, а сам владелец сообщества
const canRemoveStaff = (person) => person.role !== 'community_owner';

export const CommunityPage = () => {
  const {
    user, selectedCommunity, onCommunityUpdated, refreshCommunities, openRightPanel,
    openPanel100, registerHeaderBack, registerHeaderMenu, registerHeaderExtra,
  } = useOutletContext();

  const navigate = useNavigate();
  const location = useLocation();
  usePageVisit('community');

  // Из каталога сообщество открывается как следующий экран — тогда в шапке
  // «назад» к списку. Из сайдбара это обычный раздел, и там остаётся бургер.
  // Признак живёт в состоянии перехода: после перезагрузки страницы его нет,
  // и шапка честно возвращается к бургеру — возвращаться уже некуда.
  const cameFromCatalog = location.state?.from === 'catalog';

  useEffect(() => {
    if (!registerHeaderBack) return;
    if (!cameFromCatalog) return;
    registerHeaderBack(() => navigate('/communities'));
    return () => registerHeaderBack(null);
  }, [cameFromCatalog, registerHeaderBack, navigate]);

  const communityId = selectedCommunity?.id;

  const [data, setData] = useState({ community: null, members: [], staff: [], groups: [], info_blocks: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('members');
  const [memberSearch, setMemberSearch] = useState('');

  const [toast, setToast] = useState({ isOpen: false, message: '', type: 'success' });
  const notify = useCallback((message, type = 'success') => {
    setToast({ isOpen: true, message, type });
  }, []);

  const { checkCommunityAccess } = useAccess(user, null, null, selectedCommunity);

  const canManageMembers = checkCommunityAccess('COMMUNITY_MANAGE_MEMBERS');
  const canManageRoles = checkCommunityAccess('COMMUNITY_MANAGE_ROLES');
  // Подпись владельца — часть профиля сообщества, а не строка в штабе,
  // и правится по своему ключу
  const canEditProfile = checkCommunityAccess('COMMUNITY_EDIT_PROFILE');
  const canManageGroups = checkCommunityAccess('COMMUNITY_MANAGE_GROUPS');
  const canManageSettings = checkCommunityAccess('COMMUNITY_MANAGE_SETTINGS');
  // Порядок блоков «Инфо» — у руководителя тоже, хотя сам текст правит владелец
  const canReorderInfo = checkCommunityAccess('COMMUNITY_INFO_REORDER');

  const community = data.community || selectedCommunity;
  const isSkating = community?.category === 'skating';

  const isColorsEnabled = localStorage.getItem('tr_use_team_colors') !== 'false';
  const colorSource = data.community?.color_1 || selectedCommunity?.color_1;
  const hasColor = isColorsEnabled && !!colorSource;
  const activeBrandColor = hasColor ? colorSource : 'var(--color-brand)';

  const fetchDetails = useCallback(async () => {
    if (!communityId) return;
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/communities/${communityId}/details`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('failed');
      const json = await res.json();
      setData(json);
      // Возвращаем свежие данные: панели управления после сохранения обновляют
      // по ним и выбранное сообщество в шапке, а не ждут следующего рендера
      return json;
    } catch {
      notify('Не удалось загрузить сообщество', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [communityId, notify]);

  useEffect(() => {
    setIsLoading(true);
    fetchDetails();
  }, [fetchDetails]);

  // ── Участники ─────────────────────────────────────────────────────────────
  // Ушедшие остаются в выдаче: делим их по left_at, как во вкладке состава команды.
  const activeMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    return (data.members || [])
      .filter(m => !m.left_at)
      .filter(m => {
        if (!q) return true;
        return `${m.last_name || ''} ${m.first_name || ''} ${m.middle_name || ''}`.toLowerCase().includes(q);
      });
  }, [data.members, memberSearch]);

  // Разбивка состава на блоки. У солянок их два — вратари и полевые. У тренировок
  // вратари стоят отдельно от групп: амплуа и группа независимы, и вратарь из
  // «Начинающих» нужен на льду как вратарь, а не как ещё один в своей группе.
  const memberBlocks = useMemo(() => {
    const goalies = activeMembers.filter(m => m.position === 'goalie');
    const skaters = activeMembers.filter(m => m.position !== 'goalie');

    const blocks = !isSkating
      ? [
          { key: 'skaters', title: 'Полевые', members: skaters, empty: 'Полевых пока нет', defaults: {} },
          { key: 'goalies', title: 'Вратари', members: goalies, empty: 'Вратарей пока нет', defaults: { position: 'goalie' } },
        ]
      : [
          {
            key: 'ungrouped',
            title: 'Без группы',
            members: skaters.filter(m => !m.group_id),
            empty: 'Все распределены по группам',
            defaults: {},
          },
          ...(data.groups || []).map(g => ({
            key: `group-${g.id}`,
            title: g.name,
            members: skaters.filter(m => String(m.group_id) === String(g.id)),
            empty: 'В группе пока никого',
            defaults: { groupId: g.id },
          })),
          { key: 'goalies', title: 'Вратари', members: goalies, empty: 'Вратарей пока нет', defaults: { position: 'goalie' } },
        ];

    // Пустые блоки уводим вниз: «Вратари» и «Без группы» есть всегда, и пока
    // в них никого, они только занимают верх экрана перед настоящим составом.
    // Порядок внутри непустых и внутри пустых сохраняем.
    return [
      ...blocks.filter(b => b.members.length > 0),
      ...blocks.filter(b => b.members.length === 0),
    ];
  }, [activeMembers, isSkating, data.groups]);
  const ungroupedCount = useMemo(
    () => (data.members || []).filter(m => !m.left_at && !m.group_id).length,
    [data.members]
  );

  const [memberToExclude, setMemberToExclude] = useState(null);

  // Список состава ждёт участников: приводим штаб к той же форме. member_id
  // нужен ему как ключ строки, а у человека из штаба членства может и не быть —
  // подставляем идентификатор пользователя.
  const staffAsMembers = useMemo(
    () => (data.staff || []).map(p => ({ ...p, member_id: `staff-${p.user_id}` })),
    [data.staff]
  );
  const [animatingOutId, setAnimatingOutId] = useState(null);

  // Плитка или таблица — выбор человека, а не страницы: запоминаем на устройстве,
  // как это сделано в составе команды и клуба.
  const [viewMode, setViewMode] = useState(
    () => (localStorage.getItem('tr_community_view_all') === 'table' ? 'table' : 'grid')
  );
  const handleViewModeChange = useCallback((mode) => {
    localStorage.setItem('tr_community_view_all', mode);
    setViewMode(mode);
  }, []);

  // Режим правки включается долгим нажатием по карточке — им управляет сам список
  const [isEditMode, setIsEditMode] = useState(false);

  // Добавление участника штабом: человек уже должен быть в системе, ищем по телефону
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addPhone, setAddPhone] = useState('');
  const [addFound, setAddFound] = useState(null);
  const [addPosition, setAddPosition] = useState('skater');
  const [isAdding, setIsAdding] = useState(false);

  // Тап по свободному месту гасит тряску — единственный способ выйти
  // из режима правки, как в составе команды
  const handleContainerClick = () => {
    if (isEditMode) setIsEditMode(false);
    if (isStaffEditMode) setIsStaffEditMode(false);
  };

  // Состоит ли человек в участниках прямо сейчас. Из вкладки штаба это
  // не видно: там свой список, и членства в нём может не быть вовсе.
  const isActiveMemberOf = useCallback(
    (uid) => (data.members || []).some(m => String(m.user_id) === String(uid) && !m.left_at),
    [data.members]
  );

  const openMemberCard = useCallback((member) => {
    openRightPanel?.('communityMemberDetails', {
      communityId,
      userId: member.user_id,
      community,
      groups: data.groups || [],
      canManage: canManageMembers,
      canManageRoles,
      canEditProfile,
      activeBrandColor: hasColor ? activeBrandColor : null,
      onSaved: fetchDetails,
      onExcluded: fetchDetails,
      // Заголовок панели по факту: у человека из штаба без членства «Участник»
      // в шапке — прямая неправда, там уместна его должность
    }, isActiveMemberOf(member.user_id) ? 'Участник' : (member.title_label || 'Штаб'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communityId, community, data.groups, canManageMembers, canManageRoles, canEditProfile, hasColor, activeBrandColor, fetchDetails, openRightPanel, isActiveMemberOf]);

  // Куда добавляем: блок, из которого нажали, задаёт амплуа и группу заранее —
  // добавлять вратаря из блока вратарей и тут же выбирать «вратарь» руками глупо.
  const [addDefaults, setAddDefaults] = useState({});

  const openAddSheet = useCallback((defaults = {}) => {
    setAddPhone('');
    setAddFound(null);
    setAddPosition(defaults.position === 'goalie' ? 'goalie' : 'skater');
    setAddDefaults(defaults);
    setIsAddOpen(true);
  }, []);

  const addMember = async () => {
    if (!addFound) return;
    setIsAdding(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/communities/${communityId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ userId: addFound.id, position: addPosition }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'failed');

      // Группу задаём отдельной правкой карточки: добавление её не принимает,
      // и параметр ради умолчания блока в нём заводить незачем
      if (addDefaults.groupId) {
        await fetch(
          `${import.meta.env.VITE_API_URL}/api/communities/${communityId}/members/${addFound.id}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify({ group_id: addDefaults.groupId }),
          }
        ).catch(() => {});
      }

      setIsAddOpen(false);
      setAddPhone('');
      setAddFound(null);
      setAddPosition('skater');
      setAddDefaults({});
      await fetchDetails();
      notify(json.restored ? 'Участник возвращён в состав' : 'Участник добавлен');
    } catch (err) {
      notify(err.message === 'failed' ? 'Не удалось добавить участника' : err.message, 'error');
    } finally {
      setIsAdding(false);
    }
  };

  const searchMemberByPhone = async () => {
    setAddFound(null);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/api/communities/${communityId}/users/search?phone=${encodeURIComponent(addPhone)}`,
        { headers: getAuthHeaders() }
      );
      const json = await res.json();
      if (!res.ok || !(json.users || []).length) {
        notify('Пользователь не найден', 'error');
        return;
      }
      setAddFound(json.users[0]);
    } catch {
      notify('Не удалось выполнить поиск', 'error');
    }
  };

  const excludeMember = async () => {
    if (!memberToExclude) return;
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/api/communities/${communityId}/members/${memberToExclude.user_id}/exclude`,
        { method: 'POST', headers: getAuthHeaders() }
      );
      if (!res.ok) throw new Error('failed');
      await fetchDetails();
      setMemberToExclude(null);
      setMemberSheet(null);
      notify('Участник исключён');
    } catch {
      notify('Не удалось исключить', 'error');
    }
  };

  // ── Штаб ──────────────────────────────────────────────────────────────────
  // Режим правки у штаба свой: тряска в одной вкладке не должна включаться
  // от долгого нажатия в другой.
  const [isStaffEditMode, setIsStaffEditMode] = useState(false);
  const [staffToRemove, setStaffToRemove] = useState(null);
  const [isStaffSearchOpen, setIsStaffSearchOpen] = useState(false);
  const [staffPhone, setStaffPhone] = useState('');
  const [staffFound, setStaffFound] = useState(null);
  const [isSearching, setIsSearching] = useState(false);

  const searchStaff = async () => {
    setIsSearching(true);
    setStaffFound(null);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/api/communities/${communityId}/users/search?phone=${encodeURIComponent(staffPhone)}`,
        { headers: getAuthHeaders() }
      );
      const json = await res.json();
      if (!res.ok || !(json.users || []).length) {
        notify('Пользователь не найден', 'error');
        return;
      }
      setStaffFound(json.users[0]);
    } catch {
      notify('Не удалось выполнить поиск', 'error');
    } finally {
      setIsSearching(false);
    }
  };

  const saveStaff = async (userId, role, title) => {
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/api/communities/${communityId}/staff/${userId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ role, title }),
        }
      );
      if (!res.ok) throw new Error('failed');
      await fetchDetails();
      setIsStaffSearchOpen(false);
      setStaffFound(null);
      setStaffPhone('');
      notify('Должность сохранена');
    } catch {
      notify('Не удалось сохранить должность', 'error');
    }
  };

  const removeStaff = async (userId) => {
    setStaffToRemove(null);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/api/communities/${communityId}/staff/${userId}`,
        { method: 'DELETE', headers: getAuthHeaders() }
      );
      if (!res.ok) throw new Error('failed');
      await fetchDetails();
      setStaffSheet(null);
      notify('Полномочия сняты');
    } catch {
      notify('Не удалось снять полномочия', 'error');
    }
  };

  // ── Выход из сообщества ───────────────────────────────────────────────────
  // ── Меню раздела ──────────────────────────────────────────────────────────
  // Всё управление сообществом собрано под «⋯» в системной шапке, как в «Моей
  // команде»: во вкладке «Инфо» ему не место — там то, что читают участники,
  // а не то, что правит штаб.
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const menuSections = useMemo(() => {
    const items = [];
    if (canEditProfile) {
      items.push({
        id: 'profile', label: 'Профиль сообщества', icon: 'edit',
        hint: 'Название, логотип, описание, цвет',
        panel: 'communityProfile', title: 'Профиль сообщества',
      });
      items.push({
        id: 'info-blocks', label: 'Блоки вкладки «Инфо»', icon: 'roster',
        hint: 'Правила, полезное и что ещё нужно сказать',
        panel: 'communityInfoBlocks', title: 'Блоки вкладки «Инфо»',
      });
    }
    if (canManageSettings) {
      items.push({
        id: 'settings', label: 'Настройки сообщества', icon: 'settings',
        hint: isSkating ? 'Календарь участников и резерв' : 'Подтверждение места из резерва',
        panel: 'communitySettings', title: 'Настройки сообщества',
      });
    }
    if (isSkating && canManageGroups) {
      items.push({
        id: 'groups', label: 'Тренировочные группы', icon: 'users',
        hint: 'Кто какие тренировки видит',
        panel: 'communityGroups', title: 'Тренировочные группы',
      });
    }
    if (canManageSettings) {
      items.push({
        id: 'event-defaults', label: 'Настройки событий', icon: 'calendar',
        hint: 'Взнос, состав и публикация по умолчанию',
        panel: 'communityEventDefaults', title: 'Настройки событий',
      });
    }
    return items;
  }, [canEditProfile, canManageSettings, canManageGroups, isSkating]);

  useEffect(() => {
    if (!registerHeaderMenu) return;
    registerHeaderMenu(menuSections.length > 0 ? () => setIsMenuOpen(true) : null);
    return () => registerHeaderMenu(null);
  }, [menuSections.length, registerHeaderMenu]);

  // Ссылка на чат сообщества — рядом с «⋯»: люди уходят в чат чаще, чем
  // в настройки, и искать её внутри вкладок неудобно.
  useEffect(() => {
    if (!registerHeaderExtra) return;
    registerHeaderExtra(
      community?.chat_messenger && community?.chat_url
        ? <CommunityChatLink
            messenger={community.chat_messenger}
            url={community.chat_url}
            size="w-9 h-9"
          />
        : null
    );
    return () => registerHeaderExtra(null);
  }, [community?.chat_messenger, community?.chat_url, registerHeaderExtra]);

  const openManagePanel = useCallback((section) => {
    setIsMenuOpen(false);
    // Панель на всю ширину: в блоках формы со списками и описаниями,
    // и на 80% они читаются впритык
    openPanel100?.(section.panel, {
      communityId,
      community,
      activeBrandColor: hasColor ? activeBrandColor : null,
      onSaved: async () => {
        const fresh = await fetchDetails();
        if (fresh?.community) onCommunityUpdated?.(fresh.community);
        refreshCommunities?.();
      },
    }, section.title);
  }, [openPanel100, communityId, community,
      hasColor, activeBrandColor, fetchDetails, onCommunityUpdated, refreshCommunities]);

  // ── Разметка ──────────────────────────────────────────────────────────────
  const tabIndex = TABS.findIndex(t => t.value === activeTab);

  if (isLoading && !data.community) return <PageLoader />;

  if (!communityId) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-8 text-center gap-4">
        <span className="text-[12px] font-bold uppercase tracking-widest text-content-subtle">
          Вы не состоите ни в одном сообществе
        </span>
        <button
          onClick={() => navigate('/communities')}
          className="text-[10px] font-bold text-brand uppercase tracking-wider outline-none"
        >
          Открыть каталог
        </button>
      </div>
    );
  }

  return (
    <FadeIn
      className="h-full relative overflow-hidden flex flex-col"
      style={hasColor ? { '--color-brand': activeBrandColor } : {}}
    >
      <TeamPageHeader
        selectedTeam={selectedCommunity}
        activeTeamDetails={data.community}
        activeBrandColor={activeBrandColor}
      />

      {/* Те же кадры, что в составе команды и клуба: без них долгое нажатие
          включает режим правки, но иконки не дрожат и удаление не «схлопывается» */}
      <style>
        {`
          @keyframes jiggle { 0% { transform: rotate(-1.5deg); } 50% { transform: rotate(1.5deg); } 100% { transform: rotate(-1.5deg); } }
          .animate-jiggle { animation: jiggle 0.3s ease-in-out infinite; }
          .jiggle-delay-0 { animation-delay: 0s; } .jiggle-delay-1 { animation-delay: 0.1s; } .jiggle-delay-2 { animation-delay: 0.2s; }
          @keyframes slotExit { 0% { transform: scale(1); opacity: 1; } 100% { transform: scale(0.2); opacity: 0; } }
          .animate-slot-exit { animation: slotExit 0.2s cubic-bezier(0.6, -0.28, 0.735, 0.045) both; }
        `}
      </style>

      <div
        className="h-full overflow-y-auto scrollbar-hide animate-fade-in relative z-10 snap-y snap-proximity"
        onClick={handleContainerClick}
      >
        <TeamPageHeaderSpacer />

        <div className="snap-start sticky top-0 z-40 shrink-0 bg-transparent px-3 pt-2 pb-2">
          <SegmentedControl
            options={TABS}
            value={activeTab}
            onChange={setActiveTab}
            activeColor={hasColor ? activeBrandColor : null}
          />
        </div>

        <div className="px-3 pb-8 flex flex-col gap-3">

          {/* ── УЧАСТНИКИ ───────────────────────────────────────────────── */}
          {activeTab === 'members' && (
            <FadeIn className="flex flex-col gap-3">
              <div className="flex items-center gap-2 px-3 h-10 rounded-xl bg-surface-level2 border border-surface-border">
                <Icon name="search" className="w-4 h-4 text-content-subtle shrink-0" />
                <input
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder="Фамилия, имя или отчество"
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

              {/* Новички без группы видят только события с включённым «и те, кто без
                  группы» — штабу нужен явный сигнал, что группы пора раздать */}
              {isSkating && canManageMembers && ungroupedCount > 0 && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-brand-opacity">
                  <Icon name="users" className="w-4 h-4 text-brand shrink-0" />
                  <span className="text-[11px] font-bold text-brand leading-snug">
                    Без группы: {ungroupedCount}. Такие участники видят только тренировки,
                    открытые для всех.
                  </span>
                </div>
              )}

              {/* Тот же список, что в ростере команды и клуба: плитка или таблица,
                  долгое нажатие включает правку, крестик исключает. Кнопка
                  добавления есть в каждом блоке и подставляет его умолчания. */}
              {memberBlocks.map((block) => (
                <TeamAllMembers
                  key={block.key}
                  members={block.members}
                  title={block.title}
                  emptyLabel={memberSearch ? 'Никого не нашли' : block.empty}
                  showArchived={false}
                  onPersonClick={openMemberCard}
                  isEditMode={isEditMode}
                  setIsEditMode={setIsEditMode}
                  hasManageAccess={canManageMembers}
                  isManager={canManageMembers}
                  onExcludeClick={(m) => setMemberToExclude(m)}
                  animatingOutId={animatingOutId}
                  activeBrandColor={activeBrandColor}
                  viewMode={viewMode}
                  onViewModeChange={handleViewModeChange}
                  onAddClick={() => openAddSheet(block.defaults)}
                />
              ))}

            </FadeIn>
          )}

          {/* ── ШТАБ ────────────────────────────────────────────────────── */}
          {activeTab === 'staff' && (
            <FadeIn className="flex flex-col gap-3">
              {/* Тот же список, что у состава: плитка или таблица, долгое нажатие
                  включает правку, крестик снимает полномочия. Владельца в список
                  не отдаём на удаление — он правится в профиле сообщества. */}
              <TeamAllMembers
                members={staffAsMembers}
                title="Штаб сообщества"
                emptyLabel="В штабе пока никого"
                showArchived={false}
                onPersonClick={openMemberCard}
                isEditMode={isStaffEditMode}
                setIsEditMode={setIsStaffEditMode}
                hasManageAccess={canManageRoles}
                isManager={canManageRoles}
                showTitle
                // Владельца снять нельзя — крестик у него не появляется
                canExcludePerson={canRemoveStaff}
                onExcludeClick={(person) => setStaffToRemove(person)}
                animatingOutId={animatingOutId}
                activeBrandColor={activeBrandColor}
                viewMode={viewMode}
                onViewModeChange={handleViewModeChange}
                onAddClick={() => { setStaffPhone(''); setStaffFound(null); setIsStaffSearchOpen(true); }}
              />

              <p className="text-[11px] text-content-subtle leading-relaxed px-1">
                Должность в штабе не требует членства: человек может распоряжаться
                событиями, не состоя в участниках и не отмечаясь на лёд.
              </p>
            </FadeIn>
          )}

          {/* ── ИНФОРМАЦИЯ ──────────────────────────────────────────────── */}
          {activeTab === 'info' && (
            <FadeIn>
              {/* Управление сообществом сюда не попадает: вкладка — то, что
                  сообщество говорит участникам, а настройки живут под «⋯». */}
              <CommunityInfoTab
                communityId={communityId}
                community={community}
                blocks={data.info_blocks || []}
                canReorder={canReorderInfo}
                activeBrandColor={hasColor ? activeBrandColor : null}
                onReordered={fetchDetails}
                notify={notify}
              />
            </FadeIn>
          )}
        </div>
      </div>

      {/* Добавление участника штабом: человек уже должен быть в системе,
          как и в командах с клубами — ищем по телефону */}
      <BottomSheet isOpen={isAddOpen} onClose={() => setIsAddOpen(false)}>
        <div className="flex flex-col gap-4 min-h-[200px]">
          <h3 className="text-[18px] font-black text-content-main">Добавить участника</h3>

          <PhoneInputLP
            label="Номер телефона пользователя"
            value={addPhone}
            onChange={setAddPhone}
            activeColor={hasColor ? activeBrandColor : null}
          />

          {!addFound ? (
            <ButtonLP onClick={searchMemberByPhone} disabled={addPhone.length < 10}>
              Найти
            </ButtonLP>
          ) : (
            <>
              <div className="flex items-center gap-3 p-3 bg-surface-level2 rounded-xl">
                <Avatar
                  photoUrl={addFound.avatar_url}
                  firstName={addFound.first_name}
                  lastName={addFound.last_name}
                  className="w-10 h-10 rounded-xl"
                />
                <span className="text-[14px] font-bold text-content-main truncate">
                  {addFound.last_name} {addFound.first_name}
                </span>
              </div>

              <div className="flex flex-col gap-2">
                <SectionHeader title="Амплуа" />
                {/* От амплуа зависит очередь на событии с лимитом: у полевых
                    и вратарей она раздельная */}
                <SegmentedControl
                  options={[
                    { value: 'skater', label: 'Полевой' },
                    { value: 'goalie', label: 'Вратарь' },
                  ]}
                  value={addPosition}
                  onChange={setAddPosition}
                  activeColor={hasColor ? activeBrandColor : null}
                />
              </div>

              <ButtonLP
                onClick={addMember}
                isLoading={isAdding}
                disabled={isAdding}
                activeColor={hasColor ? activeBrandColor : null}
              >
                Добавить
              </ButtonLP>
            </>
          )}
        </div>
      </BottomSheet>

      {/* Поиск человека для штаба */}
      <BottomSheet isOpen={isStaffSearchOpen} onClose={() => setIsStaffSearchOpen(false)}>
        <div className="flex flex-col gap-4 min-h-[200px]">
          <h3 className="text-[18px] font-black text-content-main">Добавить в штаб</h3>
          <PhoneInputLP
            label="Номер телефона пользователя"
            value={staffPhone}
            onChange={setStaffPhone}
            activeColor={hasColor ? activeBrandColor : null}
          />

          {!staffFound && (
            <ButtonLP onClick={searchStaff} isLoading={isSearching} disabled={isSearching || staffPhone.length < 10}>
              Найти
            </ButtonLP>
          )}

          {staffFound && (
            <StaffSheetContent
              person={{ ...staffFound, user_id: staffFound.id, role: 'community_manager', title: '' }}
              onSave={(role, title) => saveStaff(staffFound.id, role, title)}
              hasColor={hasColor}
              activeBrandColor={activeBrandColor}
            />
          )}
        </div>
      </BottomSheet>

      <ConfirmSheet
        isOpen={!!memberToExclude}
        onClose={() => setMemberToExclude(null)}
        onConfirm={excludeMember}
        title="Исключить участника?"
        description={memberToExclude
          ? `${memberToExclude.last_name} ${memberToExclude.first_name} перестанет видеть события сообщества. Полномочия в штабе, если они есть, сохранятся.`
          : ''}
        confirmLabel="Исключить"
      />

      <ConfirmSheet
        isOpen={!!staffToRemove}
        onClose={() => setStaffToRemove(null)}
        onConfirm={() => removeStaff(staffToRemove.user_id)}
        title="Снять полномочия?"
        description={staffToRemove
          ? `${staffToRemove.last_name} ${staffToRemove.first_name} перестанет распоряжаться событиями сообщества. Членство в участниках, если оно есть, сохранится.`
          : ''}
        confirmLabel="Снять"
      />

      {/* Меню раздела — верхней шторкой: кнопка вызова стоит в системной шапке */}
      <TopSheet isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)}>
        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-content-subtle px-1">
            Управление сообществом
          </span>

          {menuSections.map(section => (
            <button
              key={section.id}
              type="button"
              onClick={() => openManagePanel(section)}
              className="flex items-center justify-between p-3 bg-surface-level2 rounded-xl border border-transparent active:border-brand/30 transition-all cursor-pointer outline-none text-left w-full"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-surface-base border border-surface-border flex items-center justify-center shrink-0">
                  <Icon name={section.icon} className="w-5 h-5" style={{ color: activeBrandColor }} />
                </div>
                <div className="flex flex-col min-w-0 text-left">
                  <span className="text-[14px] font-bold text-content-main truncate">{section.label}</span>
                  <span className="text-[10px] text-content-muted mt-0.5 truncate">{section.hint}</span>
                </div>
              </div>
              <Icon name="chevron_right" className="w-4 h-4 text-content-subtle shrink-0" />
            </button>
          ))}
        </div>
      </TopSheet>

      <Toast
        isOpen={toast.isOpen}
        message={toast.message}
        type={toast.type}
        onClose={() => setToast(prev => ({ ...prev, isOpen: false }))}
        activeColor={hasColor ? activeBrandColor : null}
      />
    </FadeIn>
  );
};


// Содержимое шторки участника вынесено отдельно, чтобы локальное состояние формы
// сбрасывалось при каждом открытии — иначе в поля попадали бы данные прошлого человека.
const StaffSheetContent = ({ person, onSave, hasColor, activeBrandColor }) => {
  const [role, setRole] = useState(person.role || 'community_manager');
  const [title, setTitle] = useState(person.title || '');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Avatar
          photoUrl={person.avatar_url}
          firstName={person.first_name}
          lastName={person.last_name}
          className="w-14 h-14 rounded-2xl"
        />
        <h3 className="text-[18px] font-black text-content-main leading-tight">
          {person.last_name} {person.first_name}
        </h3>
      </div>

      <div className="flex flex-col gap-2">
        <SectionHeader title="Роль" />
        {/* Роль решает права, подпись — только то, как человек подписан в штабе */}
        <SegmentedControl
          options={STAFF_ROLE_OPTIONS}
          value={role}
          onChange={setRole}
          activeColor={hasColor ? activeBrandColor : null}
        />
      </div>

      <TextInputLP
        label="Подпись в штабе"
        value={title}
        onChange={setTitle}
        placeholder="Тренер, помощник тренера…"
        maxLength={50}
      />
      <p className="text-[11px] text-content-subtle leading-relaxed -mt-2">
        Необязательно и на права не влияет. Пусто — подпишем по должности.
      </p>

      <ButtonLP onClick={() => onSave(role, title)} activeColor={hasColor ? activeBrandColor : null}>
        Сохранить
      </ButtonLP>
    </div>
  );
};
