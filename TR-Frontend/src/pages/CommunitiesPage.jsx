import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  getAuthHeaders, getImageUrl,
  COMMUNITY_CATEGORIES, COMMUNITY_CATEGORY_LABELS,
} from '../utils/helpers';
import { BottomSheet } from '../ui/BottomSheet';
import { ButtonLP } from '../ui/Button-LP';
import { TextInputLP } from '../ui/Input-LP';
import { ImageUploaderLP } from '../ui/ImageUploaderLP';
import { RadioLP } from '../ui/Radio-LP';
import { DropdownSelect } from '../ui/DropdownSelect';
import { Icon } from '../ui/Icon';
import { Toast } from '../ui/Toast';
import { FadeIn } from '../ui/FadeIn';
import { PageLoader } from '../ui/Loader';
import { usePageVisit } from '../hooks/usePageVisit';

// Фильтры каталога живут на устройстве: человек ищет сообщества по одному и тому же
// признаку раз за разом, и переспрашивать при каждом заходе незачем.
const SCOPE_KEY = 'tr_communities_scope';
const CATEGORY_KEY = 'tr_communities_category';

// «Мои» — не только те, куда вступили: должность в штабе членства не требует,
// но сообщество для такого человека всё равно своё.
const SCOPE_OPTIONS = [
  { value: 'all', label: 'Все' },
  { value: 'mine', label: 'Мои' },
];

const CATEGORY_OPTIONS = [
  { value: 'all', label: 'Все' },
  ...COMMUNITY_CATEGORIES.map(c => ({ value: c.id, label: c.label })),
];

export const CommunitiesPage = () => {
  const {
    user, communities: myCommunities = [], refreshCommunities, handleCommunityChange,
    registerHeaderMenu, openRightPanel,
  } = useOutletContext();
  const navigate = useNavigate();

  usePageVisit('communities');

  const [scope, setScope] = useState(() => localStorage.getItem(SCOPE_KEY) || 'all');
  const [category, setCategory] = useState(() => localStorage.getItem(CATEGORY_KEY) || 'all');
  const [search, setSearch] = useState('');

  const [communities, setCommunities] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [draft, setDraft] = useState({ name: '', category: 'skating', city: '', description: '' });
  const [logoFile, setLogoFile] = useState(null);

  const [toast, setToast] = useState({ isOpen: false, message: '', type: 'success' });
  const notify = useCallback((message, type = 'success') => {
    setToast({ isOpen: true, message, type });
  }, []);

  useEffect(() => { localStorage.setItem(SCOPE_KEY, scope); }, [scope]);
  useEffect(() => { localStorage.setItem(CATEGORY_KEY, category); }, [category]);

  // Правая кнопка шапки отдана созданию, а не фильтру: фильтры теперь стоят
  // прямо на странице, а создание сообщества — самостоятельное действие,
  // и в шторке фильтра его никто искать не станет.
  useEffect(() => {
    if (!registerHeaderMenu) return;
    registerHeaderMenu(() => setIsCreateOpen(true), { icon: 'plus', label: 'Создать сообщество' });
    return () => registerHeaderMenu(null);
  }, [registerHeaderMenu]);

  // Поиск уходит на сервер с задержкой: каталог общий на всю платформу,
  // и слать запрос на каждую букву незачем.
  const searchTimer = useRef(null);
  const [appliedSearch, setAppliedSearch] = useState('');

  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setAppliedSearch(search.trim()), 350);
    return () => clearTimeout(searchTimer.current);
  }, [search]);

  const fetchCatalog = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (appliedSearch) params.set('q', appliedSearch);
      if (category !== 'all') params.set('category', category);

      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/api/communities/catalog?${params.toString()}`,
        { headers: getAuthHeaders() }
      );
      if (!res.ok) throw new Error('failed');
      const data = await res.json();
      setCommunities(data.communities || []);
    } catch {
      notify('Не удалось загрузить каталог сообществ', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [appliedSearch, category, notify]);

  useEffect(() => { fetchCatalog(); }, [fetchCatalog]);

  // «Мой» — не только вступивший: должность в штабе членства не требует, но
  // сообщество для такого человека всё равно своё.
  const isMine = useCallback((c) => c.is_member || c.is_owner || c.is_staff, []);

  const visible = useMemo(
    () => (scope === 'mine' ? communities.filter(isMine) : communities),
    [communities, scope, isMine]
  );

  // В контекст приложения кладём запись из «моих» — в ней есть user_roles,
  // по которым считаются права на странице сообщества. У карточки каталога их нет,
  // и подставив её, мы бы обнулили доступы владельцу собственного сообщества.
  const openCommunity = useCallback((community) => {
    const known = myCommunities.find(c => String(c.id) === String(community.id));
    handleCommunityChange?.(known || community);
    // Помечаем переход: по этому признаку страница сообщества показывает
    // в шапке «назад» вместо бургера
    navigate('/community', { state: { from: 'catalog' } });
  }, [myCommunities, handleCommunityChange, navigate]);

  const openCard = (community) => {
    openRightPanel?.('communityDetails', {
      community,
      activeBrandColor: community.color_1 || 'var(--color-brand)',
      onOpen: openCommunity,
      onJoined: async (c) => {
        await refreshCommunities?.(c.id);
        await fetchCatalog();
        notify('Вы вступили в сообщество');
      },
      onLeft: async () => {
        await refreshCommunities?.();
        await fetchCatalog();
        notify('Вы вышли из сообщества');
      },
      onDeleted: async () => {
        await refreshCommunities?.();
        await fetchCatalog();
        notify('Сообщество удалено');
      },
    }, 'Сообщество');
  };

  const handleCreate = async () => {
    if (!draft.name.trim()) {
      notify('Укажите название сообщества', 'error');
      return;
    }
    setIsCreating(true);
    try {
      // Логотип летит вместе с формой, поэтому multipart. Content-Type не ставим
      // руками: браузер сам добавит его вместе с boundary.
      const form = new FormData();
      form.append('name', draft.name.trim());
      form.append('category', draft.category);
      form.append('city', draft.city);
      form.append('description', draft.description);
      if (logoFile) form.append('logo', logoFile);

      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/communities`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'failed');

      await refreshCommunities?.(json.community.id);
      setIsCreateOpen(false);
      setDraft({ name: '', category: 'skating', city: '', description: '' });
      setLogoFile(null);
      navigate('/community', { state: { from: 'catalog' } });
    } catch (err) {
      notify(err.message === 'failed' ? 'Не удалось создать сообщество' : err.message, 'error');
    } finally {
      setIsCreating(false);
    }
  };

  // Своё сообщество выделяем рамкой бренда и подписью: в общем списке из
  // полусотни карточек глазами его иначе не найти.
  const CommunityCard = ({ community }) => {
    const mine = isMine(community);
    return (
      <button
        type="button"
        onClick={() => openCard(community)}
        className={clsx(
          'flex items-center justify-between gap-3 p-3 rounded-2xl border text-left outline-none w-full transition-all active:scale-[0.99]',
          mine
            ? 'border-brand bg-surface-level1'
            : 'border-brand-opacity bg-surface-level1 '
        )}
      >
        <div className="flex items-center gap-3 min-w-0 ">
          <div className={clsx(
            'w-16 h-16 rounded-xl flex items-center justify-center shrink-0 overflow-hidden',
            mine ? 'bg-surface-base' : 'bg-surface-level2'
          )}>
            {community.logo_url
              ? <img src={getImageUrl(community.logo_url)} alt={community.name} className="w-full h-full object-contain rounded-xl" />
              : <Icon name="handshake" className="w-5 h-5 text-content-subtle" />}
          </div>

          <div className="flex flex-col min-w-0">
            <span className="text-[14px] font-bold text-content-main truncate">{community.name}</span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-content-muted mt-0.5 truncate">
              {COMMUNITY_CATEGORY_LABELS[community.category]}
              {community.city ? ` · ${community.city}` : ''}
              {` · ${community.members_count} чел.`}
            </span>
            {mine && (
              <span className="text-[10px] font-black uppercase tracking-widest text-brand mt-1">
                {community.is_owner
                  ? 'Ваше сообщество'
                  : community.is_staff ? 'Вы в штабе' : 'Вы участник'}
              </span>
            )}
          </div>
        </div>

        <Icon name="chevron_right" className="w-4 h-4 text-content-subtle shrink-0" />
      </button>
    );
  };

  if (isLoading && communities.length === 0) return <PageLoader />;

  return (
    <FadeIn className="h-full relative overflow-hidden flex flex-col">

      <div className="h-full overflow-y-auto scrollbar-hide pb-8 flex flex-col">

        {/* Шапка страницы: липнет под системной и повторяет её фон, поэтому
            карточки уезжают под неё без шва. Поиск и фильтры живут здесь,
            а не в шторке: это самые частые действия на экране. */}
        {/* В липкой шапке остаётся только поиск: он нужен постоянно, пока
            листаешь список. Фильтры меняют реже — им хватает места в потоке,
            и шапка от этого не разрастается на пол-экрана. */}
        <div className="sticky top-0 z-30 bg-surface-base shadow-md px-12 pt-2 pb-6">
          <TextInputLP
            label="Поиск"
            value={search}
            onChange={setSearch}
            placeholder="Название или город"
          />
        </div>

        <div className="px-4 pt-4 flex flex-col gap-3">
          {/* Два списка делят ширину поровну. В отличие от чипа-переключателя
              они показывают весь набор: по одному значению на экране нельзя
              догадаться, какие ещё бывают. */}
          <div className="flex items-start gap-2">
            <DropdownSelect
              className="flex-1"
              label="Показывать"
              options={SCOPE_OPTIONS}
              value={scope}
              onChange={setScope}
            />
            <DropdownSelect
              className="flex-1"
              label="Категория"
              options={CATEGORY_OPTIONS}
              value={category}
              onChange={setCategory}
            />
          </div>

          {visible.length > 0 ? (
            <div className="flex flex-col gap-2">
              {visible.map(c => <CommunityCard key={c.id} community={c} />)}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-16 px-6 text-center">
              <Icon name="handshake" className="w-8 h-8 text-content-subtle opacity-40" />
              <span className="text-[12px] font-bold uppercase tracking-widest text-content-subtle">
                {appliedSearch
                  ? 'Ничего не нашли'
                  : scope === 'mine'
                    ? 'Вы пока никуда не вступили'
                    : 'Сообществ пока нет'}
              </span>

            </div>
          )}
        </div>
      </div>

      {/* Создание — нижняя шторка: открывается кнопкой «+» в шапке и из пустого состояния */}
      <BottomSheet isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)}>
        <div className="flex flex-col gap-4">
          <h3 className="text-[18px] font-black text-content-main">Новое сообщество</h3>

          <TextInputLP
            label="Название"
            value={draft.name}
            onChange={(v) => setDraft(d => ({ ...d, name: v }))}
            placeholder="Тренировки с Иваном Петровым"
            maxLength={255}
          />

          {/* Логотип и тип стоят в одной строке: у загрузчика фиксированный
              квадрат, и место справа от него как раз под два варианта выбора.
              Категорию потом не поменять — от неё зависит, какие события внутри
              проводятся и есть ли у сообщества тренировочные группы. */}
          <div className="flex items-center gap-4">
            <ImageUploaderLP
              currentImageUrl={null}
              onChange={(file) => setLogoFile(file)}
              onDelete={() => setLogoFile(null)}
              sizeClass="w-20 h-20"
            />

            <div className="flex flex-col gap-1 min-w-0 flex-1">
              {COMMUNITY_CATEGORIES.map(c => (
                <RadioLP
                  key={c.id}
                  name="community-category"
                  checked={draft.category === c.id}
                  onChange={() => setDraft(d => ({ ...d, category: c.id }))}
                  label={c.label}
                  description={c.id === 'skating'
                    ? 'Занятия с тренером'
                    : 'Арендовали лёд и играем'}
                />
              ))}
            </div>
          </div>

          <TextInputLP
            label="Город"
            value={draft.city}
            onChange={(v) => setDraft(d => ({ ...d, city: v }))}
            placeholder="Мытищи"
            maxLength={100}
          />

          <TextInputLP
            label="Описание"
            value={draft.description}
            onChange={(v) => setDraft(d => ({ ...d, description: v }))}
            placeholder="Кому подойдёт, как часто катаемся, где"
            type="textarea"
            rows={3}
          />

          <ButtonLP onClick={handleCreate} isLoading={isCreating} disabled={isCreating}>
            Создать
          </ButtonLP>
        </div>
      </BottomSheet>

      <Toast
        isOpen={toast.isOpen}
        message={toast.message}
        type={toast.type}
        onClose={() => setToast(prev => ({ ...prev, isOpen: false }))}
      />
    </FadeIn>
  );
};
