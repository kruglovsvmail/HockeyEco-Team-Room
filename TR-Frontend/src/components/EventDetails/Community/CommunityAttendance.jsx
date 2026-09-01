import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import clsx from 'clsx';
import { getAuthHeaders } from '../../../utils/helpers';
import { Avatar } from '../../../ui/Avatar';
import { Icon } from '../../../ui/Icon';
import { ContainerContent } from '../../../ui/ContainerContent';
import { BottomSheet } from '../../../ui/BottomSheet';
import { ButtonLP } from '../../../ui/Button-LP';
import { Toast } from '../../../ui/Toast';
import { PageLoader } from '../../../ui/Loader';
import { useAccess } from '../../../hooks/useAccess';

// Отметки на событии сообщества.
//
// От командной вкладки отличается тем, что отметившийся не обязательно попал на
// лёд: при наборе лимита человек уходит в резервную очередь. Поэтому блоков не
// два, а до пяти — основа (вратари и полевые), резерв в порядке очереди,
// упустившие своё предложение и снявшиеся после дедлайна.
export const CommunityAttendance = ({ event, refreshData, openRightPanel }) => {
  const eventId = event?.event_id;
  const eventType = event?.event_type;
  const communityId = event?.my_community_id;

  const [attendees, setAttendees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);

  // Штаб отмечает людей сам — тем же способом, что и в командных событиях:
  // кнопка в шапке блока открывает список тех, кто ещё не отмечен.
  const [members, setMembers] = useState([]);
  const [trainingGroups, setTrainingGroups] = useState([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addFilter, setAddFilter] = useState('skater');
  const [savingPersonId, setSavingPersonId] = useState(null);

  // Долгое нажатие включает тряску с крестиками — как в ростере и в отметках команды
  const [isEditMode, setIsEditMode] = useState(false);
  const [personToRemove, setPersonToRemove] = useState(null);
  const pressTimer = useRef(null);
  const [toast, setToast] = useState({ isOpen: false, message: '', type: 'success' });

  const notify = useCallback((message, type = 'success') => {
    setToast({ isOpen: true, message, type });
  }, []);

  const isColorsEnabled = localStorage.getItem('tr_use_team_colors') !== 'false';
  const hasTeamColor = isColorsEnabled && !!event?.team_color;
  const activeBrandColor = hasTeamColor ? event.team_color : 'var(--color-brand)';

  const localUser = useMemo(() => {
    try {
      return JSON.parse(
        localStorage.getItem('teampwa_user') || localStorage.getItem('teampwa_cached_user')
      );
    } catch { return null; }
  }, []);

  const localCommunity = useMemo(() => {
    if (!localUser || !communityId) return null;
    return localUser.communities?.find(c => String(c.id) === String(communityId)) || null;
  }, [localUser, communityId]);

  const { checkCommunityAccess } = useAccess(localUser, null, null, localCommunity);
  const hasManageAccess = checkCommunityAccess('COMMUNITY_EVENT_ATTENDANCE_MANAGE', communityId);
  // Деньги — отдельное право: администратор собирает состав, но кто заплатил,
  // отмечают владелец с руководителем. Гейт стоит и на сервере.
  const canMarkFee = checkCommunityAccess('COMMUNITY_EVENT_FEE_MARK', communityId);
  // Карточка участника открывается прямо с события — те же права, что и на
  // странице сообщества, иначе она показала бы карандаши там, где их быть не должно
  const canManageMembers = checkCommunityAccess('COMMUNITY_MANAGE_MEMBERS', communityId);
  const canManageRoles = checkCommunityAccess('COMMUNITY_MANAGE_ROLES', communityId);
  const canEditProfile = checkCommunityAccess('COMMUNITY_EDIT_PROFILE', communityId);

  const myUserId = localUser?.id;

  // ── Загрузка ──────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!eventId || !communityId) { setLoading(false); return; }
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/api/community-events/${eventId}/attendance`
        + `?eventType=${eventType}&communityId=${communityId}`,
        { headers: getAuthHeaders() }
      );
      const json = await res.json();
      if (json.success) setAttendees(json.attendees || []);
    } catch {
      notify('Не удалось загрузить отметки', 'error');
    } finally {
      setLoading(false);
    }
  }, [eventId, eventType, communityId, notify]);

  useEffect(() => { load(); }, [load]);

  // Состав сообщества нужен только штабу и только чтобы предложить, кого отметить
  useEffect(() => {
    if (!hasManageAccess || !communityId) return;
    let cancelled = false;
    fetch(`${import.meta.env.VITE_API_URL}/api/communities/${communityId}/details`, {
      headers: getAuthHeaders(),
    })
      .then(res => (res.ok ? res.json() : null))
      .then(json => {
        if (cancelled || !json) return;
        setMembers((json.members || []).filter(m => !m.left_at));
        setTrainingGroups(json.groups || []);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [hasManageAccess, communityId]);

  const reload = useCallback(async () => {
    await load();
    refreshData?.();
  }, [load, refreshData]);

  // ── Раскладка по блокам ───────────────────────────────────────────────────
  // Порядок внутри резерва сервер уже отдал по queued_at — здесь его не трогаем,
  // иначе номер в очереди перестанет соответствовать реальному.
  const groups = useMemo(() => {
    const onIce = attendees.filter(a => a.slot_status === 'main' && !a.withdrawn_at);
    return {
      goalies: onIce.filter(a => a.position === 'goalie'),
      skaters: onIce.filter(a => a.position !== 'goalie'),
      queue: attendees.filter(a => a.slot_status === 'offered' || a.slot_status === 'reserve'),
      expired: attendees.filter(a => a.slot_status === 'expired'),
      withdrawn: attendees.filter(a => a.slot_status === 'main' && a.withdrawn_at),
    };
  }, [attendees]);

  const myRow = useMemo(
    () => attendees.find(a => String(a.id) === String(myUserId)) || null,
    [attendees, myUserId]
  );

  // ── Действия ──────────────────────────────────────────────────────────────
  const callReserve = async (action, targetUserId = null) => {
    setIsBusy(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/api/community-events/${eventId}/reserve/${action}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ eventType, communityId, targetUserId }),
        }
      );
      const json = await res.json();
      if (res.status === 409) {
        notify(json.error || 'Время на подтверждение истекло', 'error');
      } else if (!res.ok || !json.success) {
        throw new Error(json.error || 'failed');
      } else if (action === 'confirm') {
        notify('Место за вами');
      }
      await reload();
    } catch (err) {
      notify(err.message === 'failed' ? 'Не удалось выполнить действие' : err.message, 'error');
    } finally {
      setIsBusy(false);
    }
  };

  // Пометка ₽ переключается тапом по самому значку в режиме правки — как
  // в отметках командного события. Состояние меняем сразу, не дожидаясь ответа:
  // это один бит, и ждать сеть ради него значит терять ощущение отзывчивости.
  const togglePayTag = async (e, person) => {
    e?.stopPropagation?.();
    if (!canMarkFee) return;

    const nextState = !person.has_pay_tag;
    setAttendees(prev => prev.map(a => (a.id === person.id ? { ...a, has_pay_tag: nextState } : a)));
    if (window.navigator?.vibrate) window.navigator.vibrate(30);

    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/api/community-events/${eventId}/attendance-tag`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({
            eventType, communityId,
            targetUserId: person.id,
            hasPayTag: nextState,
          }),
        }
      );
      if (!res.ok) throw new Error('failed');
      await reload();
    } catch {
      notify('Не удалось изменить пометку', 'error');
      await reload();
    }
  };

  // Отметка за другого человека. Ручка та же, что у самоотметки: контроллер
  // сам различает, кто кого отмечает, и спрашивает нужное право.
  const markPerson = async (member) => {
    setSavingPersonId(member.user_id);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/api/community-events/${eventId}/attendance`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({
            eventType, communityId,
            targetUserId: member.user_id,
            isAttending: true,
          }),
        }
      );
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || 'failed');
      // Состав полон — человек уходит в резерв; сервер уже это решил, просто говорим
      if (json.slotStatus && json.slotStatus !== 'main') {
        notify('Состав полон — участник встал в резерв');
      }
      await reload();
    } catch (err) {
      notify(err.message === 'failed' ? 'Не удалось отметить участника' : err.message, 'error');
    } finally {
      setSavingPersonId(null);
    }
  };

  // Кого ещё можно отметить: состав сообщества минус все, кто уже в списке
  const availableMembers = useMemo(() => {
    const marked = new Set(attendees.map(a => String(a.id)));
    return members
      .filter(m => !marked.has(String(m.user_id)))
      .filter(m => (addFilter === 'goalie' ? m.position === 'goalie' : m.position !== 'goalie'))
      .sort((a, b) => `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`, 'ru'));
  }, [members, attendees, addFilter]);

  // Карточка участника — та же правая панель, что на странице сообщества:
  // отдельная шторка с обрывками тех же сведений была лишней сущностью.
  const openPersonCard = (person) => {
    openRightPanel?.('communityMemberDetails', {
      communityId,
      userId: person.id,
      community: localCommunity,
      groups: trainingGroups,
      canManage: canManageMembers,
      canManageRoles,
      canEditProfile,
      activeBrandColor: hasTeamColor ? activeBrandColor : null,
      onSaved: reload,
    }, 'Участник');
  };

  const openAddSheet = (filter) => {
    setAddFilter(filter);
    setIsAddOpen(true);
  };

  // ── Долгое нажатие ────────────────────────────────────────────────────────
  const cancelPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };

  const handlePressStart = () => {
    if (isEditMode || !hasManageAccess) return;
    pressTimer.current = setTimeout(() => {
      setIsEditMode(true);
      if (window.navigator?.vibrate) window.navigator.vibrate(50);
    }, 500);
  };

  // Тап по пустому месту гасит тряску — ровно как в составе команды
  const handleContainerClick = () => {
    if (isEditMode) setIsEditMode(false);
  };

  // Полное удаление отметки штабом, в том числе снятой после дедлайна: обычное
  // снятие оставляет строку, чтобы человек остался плательщиком.
  const purgeAttendance = async (targetUserId) => {
    setIsBusy(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/api/community-events/${eventId}/attendance`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({
            eventType, communityId, targetUserId,
            isAttending: false, purge: true,
          }),
        }
      );
      if (!res.ok) throw new Error('failed');
      await reload();
    } catch {
      notify('Не удалось убрать отметку', 'error');
    } finally {
      setIsBusy(false);
    }
  };

  // ── Карточка человека ─────────────────────────────────────────────────────
  const PersonTile = ({ person, queueIndex = null, dimmed = false, index = 0 }) => (
    <div
      onPointerDown={handlePressStart}
      onPointerUp={cancelPress}
      onPointerLeave={cancelPress}
      onPointerCancel={cancelPress}
      onClick={(e) => {
        if (isEditMode) { e.stopPropagation(); return; }
        openPersonCard(person);
      }}
      className={clsx(
        'relative flex flex-col items-center gap-1.5 w-full select-none cursor-pointer',
        isEditMode && hasManageAccess && `animate-jiggle jiggle-delay-${index % 3}`,
        dimmed && 'opacity-70'
      )}
    >
      {/* Крестик снимает отметку целиком — вместе с местом в очереди и оплатой */}
      {isEditMode && hasManageAccess && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setPersonToRemove(person); }}
          className="absolute top-0 right-1/2 translate-x-10 -translate-y-1.5 w-[22px] h-[22px] bg-red-500 rounded-full flex items-center justify-center shadow-md z-30 hover:scale-110 active:scale-90 transition-transform cursor-pointer"
        >
          <Icon name="close" className="w-3 h-3 text-white" strokeWidth={3.5} />
        </button>
      )}

      {/* Перевод в основу мимо очереди: организатор знает, кого позвать, и ждать
          таймера не обязан. Лимит при этом не проверяется. */}
      {isEditMode && hasManageAccess && ['reserve', 'offered', 'expired'].includes(person.slot_status) && (
        <button
          type="button"
          disabled={isBusy}
          onClick={(e) => { e.stopPropagation(); callReserve('promote', person.id); }}
          style={{ backgroundColor: activeBrandColor }}
          className="absolute top-0 left-1/2 -translate-x-10 -translate-y-1.5 w-[22px] h-[22px] rounded-full flex items-center justify-center shadow-md z-30 hover:scale-110 active:scale-90 transition-transform cursor-pointer disabled:opacity-50"
        >
          <Icon name="chevron_left" className="w-3 h-3 text-white rotate-90" strokeWidth={3.5} />
        </button>
      )}

      <div className="relative">
        <Avatar
          photoUrl={person.avatar_url}
          firstName={person.first_name}
          lastName={person.last_name}
          className="w-[68px] h-[68px] rounded-2xl bg-surface-level1 border border-surface-border"
        />

        {/* Номер в очереди: без него «резерв» — просто список, а он упорядочен */}
        {queueIndex !== null && (
          <div
            className="absolute -top-1.5 -right-1.5 min-w-[22px] h-[22px] px-1 rounded-full flex items-center justify-center text-[10px] font-black shadow-md bg-surface-level3 text-content-main border border-surface-border"
          >
            {queueIndex + 1}
          </div>
        )}

        {/* Пометка ₽. В режиме правки — кнопка: тап ставит и снимает её прямо
            на плитке. Вне режима это просто индикатор, и пустой он не рисуется. */}
        {(isEditMode && canMarkFee) ? (
          <button
            type="button"
            onClick={(e) => togglePayTag(e, person)}
            style={person.has_pay_tag && hasTeamColor
              ? { backgroundColor: activeBrandColor, borderColor: activeBrandColor, color: 'var(--color-content-dark)' }
              : undefined}
            className={clsx(
              'absolute -bottom-1.5 -left-1.5 w-[22px] h-[22px] rounded-full flex items-center justify-center text-[10px] font-black shadow-md z-10 transition-all transform hover:scale-110 active:scale-90 cursor-pointer',
              person.has_pay_tag && !hasTeamColor && 'bg-brand text-white border border-brand',
              !person.has_pay_tag && 'bg-surface-level3 text-content-muted border border-surface-border'
            )}
          >
            ₽
          </button>
        ) : person.has_pay_tag && (
          <div
            style={hasTeamColor ? { backgroundColor: activeBrandColor, color: '#fff' } : undefined}
            className={clsx(
              'absolute -bottom-1.5 -left-1.5 w-[22px] h-[22px] rounded-full flex items-center justify-center text-[10px] font-black shadow-sm border border-surface-level1',
              !hasTeamColor && 'bg-brand text-white'
            )}
          >
            ₽
          </div>
        )}

        {person.pay_role === 'free' && (
          <div className="absolute -bottom-1.5 -right-1.5 w-[22px] h-[22px] rounded-full flex items-center justify-center shadow-sm bg-surface-level3 border border-surface-border">
            <Icon name="check" className="w-3 h-3 text-content-muted" />
          </div>
        )}
      </div>

      <div className="w-full text-center px-0.5">
        <span className="text-[14px] font-bold text-content-main leading-tight whitespace-nowrap block">
          {person.last_name}
        </span>
        <span className="text-[10px] text-content-muted leading-tight whitespace-nowrap block">
          {person.first_name}
        </span>
      </div>
    </div>
  );

  const Grid = ({ children, dimmed = false }) => (
    <div className={clsx(
      'grid grid-cols-[repeat(auto-fill,minmax(94px,1fr))] gap-y-5 gap-x-2 justify-items-center mt-2',
      dimmed && 'opacity-70'
    )}>
      {children}
    </div>
  );

  const Empty = ({ text }) => (
    <div className="text-center py-6 text-[10px] font-bold uppercase tracking-widest text-content-subtle opacity-50 select-none">
      {text}
    </div>
  );

  // Подпись лимита: «12 / 16» понятнее, чем просто число отметившихся
  const limitLabel = (count, limit) => (
    limit === null || limit === undefined ? count : `${count} / ${limit}`
  );

  if (loading) return <PageLoader />;

  // Кнопка «отметить» в шапке блока — та же, что в командных отметках
  const addButton = (filter) => (hasManageAccess && !isEditMode ? (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); openAddSheet(filter); }}
      style={{ color: activeBrandColor }}
      className="transition-colors active:scale-90 outline-none flex items-center justify-center hover:opacity-80 cursor-pointer"
    >
      <Icon name="user_plus" className="w-5 h-5" />
    </button>
  ) : null);

  return (
    <div className="flex flex-col gap-3 pb-8" onClick={handleContainerClick}>
      {/* Те же кадры, что в отметках командной тренировки */}
      <style>{`
        @keyframes jiggle { 0% { transform: rotate(-1.5deg); } 50% { transform: rotate(1.5deg); } 100% { transform: rotate(-1.5deg); } }
        .animate-jiggle { animation: jiggle 0.3s ease-in-out infinite; }
        .jiggle-delay-0 { animation-delay: 0s; } .jiggle-delay-1 { animation-delay: 0.1s; } .jiggle-delay-2 { animation-delay: 0.2s; }
      `}</style>

      {/* Своё предложение из очереди — всегда наверху: таймер идёт, и искать
          кнопку среди чужих карточек человек не должен */}
      {myRow?.slot_status === 'offered' && (
        <div className="flex flex-col gap-3 p-4 rounded-2xl bg-brand-opacity">
          <div className="flex items-center gap-2">
            <Icon name="clock" className="w-4 h-4 text-brand shrink-0" />
            <span className="text-[13px] font-bold text-brand leading-snug">
              Освободилось место — подтвердите участие
            </span>
          </div>
          <div className="flex items-center gap-2">
            <ButtonLP
              onClick={() => callReserve('confirm')}
              disabled={isBusy}
              activeColor={hasTeamColor ? activeBrandColor : null}
              className="!py-3"
            >
              Беру место
            </ButtonLP>
            <ButtonLP
              onClick={() => callReserve('decline')}
              disabled={isBusy}
              variant="outline"
              className="!py-3"
            >
              Не поеду
            </ButtonLP>
          </div>
        </div>
      )}

      {myRow?.slot_status === 'expired' && (
        <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-surface-level2">
          <span className="text-[12px] font-bold text-content-muted leading-snug">
            Вы не успели подтвердить — место ушло следующему
          </span>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => callReserve('requeue')}
            className="shrink-0 px-3 h-9 rounded-lg bg-surface-level3 text-[10px] font-bold uppercase tracking-wider text-content-main outline-none active:scale-95 transition-transform disabled:opacity-40"
          >
            В очередь снова
          </button>
        </div>
      )}

      <ContainerContent
        title="Вратари"
        count={limitLabel(groups.goalies.length, event?.max_goalies)}
        action={Number(event?.max_goalies) === 0 ? null : addButton('goalie')}
      >
        {groups.goalies.length > 0
          ? <Grid>{groups.goalies.map((p, i) => <PersonTile key={p.id} person={p} index={i} />)}</Grid>
          : <Empty text={Number(event?.max_goalies) === 0 ? 'Вратари не набираются' : 'Вратари не отмечены'} />}
      </ContainerContent>

      <ContainerContent
        title="Полевые"
        count={limitLabel(groups.skaters.length, event?.max_skaters)}
        action={addButton('skater')}
      >
        {groups.skaters.length > 0
          ? <Grid>{groups.skaters.map((p, i) => <PersonTile key={p.id} person={p} index={i} />)}</Grid>
          : <Empty text="Полевые не отмечены" />}
      </ContainerContent>

      {groups.queue.length > 0 && (
        <ContainerContent title="Резерв" count={groups.queue.length}>
          <Grid>
            {groups.queue.map((p, i) => <PersonTile key={p.id} person={p} queueIndex={i} />)}
          </Grid>
          <div className="text-[10px] text-content-muted leading-tight mt-4 px-1">
            Очередь в порядке отметки. Когда место освобождается, предложение уходит
            первому в очереди; не подтвердил в срок — переходит следующему.
            В расчёт стоимости резерв не входит.
          </div>
        </ContainerContent>
      )}

      {groups.expired.length > 0 && (
        <ContainerContent title="Упустили место" count={groups.expired.length}>
          <Grid dimmed>
            {groups.expired.map(p => <PersonTile key={p.id} person={p} dimmed />)}
          </Grid>
          <div className="text-[10px] text-content-muted leading-tight mt-4 px-1">
            Не подтвердили предложение вовремя или отказались. Могут встать
            в очередь заново — попадут в её конец.
          </div>
        </ContainerContent>
      )}

      {groups.withdrawn.length > 0 && (
        <ContainerContent title="Снялись после дедлайна" count={groups.withdrawn.length}>
          <Grid dimmed>
            {groups.withdrawn.map(p => <PersonTile key={p.id} person={p} dimmed />)}
          </Grid>
          <div className="text-[10px] text-content-muted leading-tight mt-4 px-1">
            Взнос за событие сохраняется — кроме тех, чьё место успел занять другой
            участник: замена снимает оплату со снявшегося.
          </div>
        </ContainerContent>
      )}

      {/* Кого отметить: состав сообщества минус те, кто уже в списке */}
      <BottomSheet isOpen={isAddOpen} onClose={() => setIsAddOpen(false)}>
        <div className="flex flex-col gap-4">
          <h3 className="text-[18px] font-black text-content-main mb-2">
            {addFilter === 'goalie' ? 'Отметить вратаря' : 'Отметить полевого'}
          </h3>

          {availableMembers.length > 0 ? (
            <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto scrollbar-hide">
              {availableMembers.map(member => (
                <div key={member.user_id} className="flex items-center justify-between p-3 bg-surface-level2 rounded-xl">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar
                      photoUrl={member.avatar_url}
                      firstName={member.first_name}
                      lastName={member.last_name}
                      className="w-10 h-10 rounded-xl bg-surface-level1 border border-surface-border shrink-0"
                    />
                    <div className="flex flex-col text-left min-w-0">
                      <span className="text-[14px] font-bold text-content-main truncate">
                        {member.last_name} {member.first_name}
                      </span>
                      {member.group_name && (
                        <span className="text-[10px] text-content-subtle leading-none mt-0.5 truncate">
                          {member.group_name}
                        </span>
                      )}
                    </div>
                  </div>

                  <ButtonLP
                    onClick={() => markPerson(member)}
                    variant="primary"
                    className="!w-auto !py-1.5 !px-3 !text-[10px] ml-2 shrink-0 normal-case"
                    activeColor={hasTeamColor ? activeBrandColor : null}
                    isLoading={savingPersonId === member.user_id}
                    disabled={savingPersonId !== null}
                  >
                    Добавить
                  </ButtonLP>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex justify-center items-center h-24 text-[10px] font-black text-content-muted uppercase tracking-widest text-center py-4">
              {addFilter === 'goalie' ? 'Все вратари уже отмечены' : 'Все полевые уже отмечены'}
            </div>
          )}
        </div>
      </BottomSheet>

      {/* Снятие отметки крестиком */}
      <BottomSheet isOpen={!!personToRemove} onClose={() => !isBusy && setPersonToRemove(null)}>
        {personToRemove && (
          <div className="flex flex-col items-center text-center gap-4 py-2">
            <div className="w-16 h-16 bg-danger-muted text-danger rounded-full flex items-center justify-center mb-2">
              <Icon name="delete" className="w-8 h-8" />
            </div>
            <h3 className="text-[18px] font-black text-content-main leading-tight">
              Убрать отметку?
            </h3>
            <p className="text-[14px] text-content-muted max-w-[280px]">
              <span className="font-bold text-content-main">{personToRemove.last_name}</span>{' '}
              исчезнет из списка целиком — вместе с местом в очереди и участием
              в расчёте стоимости.
            </p>
            <div className="flex gap-3 w-full">
              <ButtonLP variant="outline" onClick={() => setPersonToRemove(null)} disabled={isBusy} className="flex-1">
                Отмена
              </ButtonLP>
              <ButtonLP
                variant="primary"
                activeColor="#ef4444"
                onClick={() => { const id = personToRemove.id; setPersonToRemove(null); purgeAttendance(id); }}
                isLoading={isBusy}
                disabled={isBusy}
                className="flex-1"
              >
                Да, убрать
              </ButtonLP>
            </div>
          </div>
        )}
      </BottomSheet>

      <Toast
        isOpen={toast.isOpen}
        message={toast.message}
        type={toast.type}
        onClose={() => setToast(prev => ({ ...prev, isOpen: false }))}
        activeColor={hasTeamColor ? activeBrandColor : null}
      />
    </div>
  );
};
