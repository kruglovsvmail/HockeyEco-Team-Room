import React, { useState, useEffect, useCallback } from 'react';
import clsx from 'clsx';
import dayjs from 'dayjs';
import { getAuthHeaders, uiFixed, getContrastTextColor } from '../../utils/helpers';
import { Avatar } from '../../ui/Avatar';
import { Icon } from '../../ui/Icon';
import { ButtonLP } from '../../ui/Button-LP';
import { RadioLP } from '../../ui/Radio-LP';
import { TextInputLP } from '../../ui/Input-LP';
import Toggle from '../../ui/Toggle';
import { Toast } from '../../ui/Toast';
import { MessengerLinks } from '../../ui/MessengerLinks';
import { PageLoader } from '../../ui/Loader';
import { FadeIn } from '../../ui/FadeIn';

// Тот же формат, что в карточке игрока команды. Хелпер там объявлен локально
// в UserDetails.jsx и наружу не вынесен — дублируем короткую функцию, а не тянем
// импорт из компонента другого раздела.
const formatPhoneNumber = (phoneStr) => {
  if (!phoneStr) return '—';
  const cleaned = String(phoneStr).replace(/\D/g, '');
  const last10 = cleaned.length >= 10 ? cleaned.slice(-10) : cleaned;
  if (last10.length === 10) {
    return `+7 (${last10.slice(0, 3)}) ${last10.slice(3, 6)}-${last10.slice(6, 8)}-${last10.slice(8, 10)}`;
  }
  return phoneStr;
};

// Оверлей сохранения — один на все блоки карточки, включая шапку с фото
const SavingOverlay = ({ accentColor }) => (
  <div className="absolute inset-0 bg-surface-base/40 backdrop-blur-[1px] z-20 flex items-center justify-center rounded-2xl">
    <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-level1 border border-surface-border rounded-xl shadow-md">
      <div
        className="w-3.5 h-3.5 border-2 border-t-transparent rounded-full animate-spin"
        style={{ borderColor: accentColor, borderTopColor: 'transparent' }}
      />
      <span className="text-[10px] font-bold uppercase tracking-wider text-content-muted">
        Сохранение...
      </span>
    </div>
  </div>
);

// Карандаш правки — акцентным цветом, как во всех карточках приложения
const EditPencil = ({ isEditing, accentColor, className, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    style={{ color: accentColor }}
    className={clsx(
      'p-0.5 outline-none cursor-pointer flex items-center justify-center transition-opacity hover:opacity-70',
      className
    )}
  >
    <Icon name={isEditing ? 'close' : 'edit'} className="w-4 h-4" />
  </button>
);

// Блок карточки один в один с UserDetails: та же рамка, тот же карандаш справа
// сверху и тот же оверлей сохранения. Единый вид карточек человека во всех
// разделах важнее, чем экономия на десятке строк.
const CustomBlock = ({ title, icon, isEditing, isManager, onAction, activeBrandColor, isSaving, children }) => {
  const accentColor = activeBrandColor || 'var(--color-brand)';

  return (
    <div className="flex flex-col p-4 bg-surface-level1 border border-surface-border rounded-2xl shadow-sm mb-3 relative">
      {isSaving && <SavingOverlay accentColor={accentColor} />}

      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon name={icon} className="w-4 h-4" style={{ color: accentColor }} />
          <span className="text-[10px] font-black text-content-muted uppercase tracking-widest">
            {title}
          </span>
        </div>

        {isManager && onAction && (
          <EditPencil isEditing={isEditing} accentColor={accentColor} onClick={onAction} />
        )}
      </div>

      {children}
    </div>
  );
};

const InfoRow = ({ label, value }) => (
  <div className="flex items-center justify-between gap-3 py-1">
    <span className="text-[12px] font-bold text-content-muted uppercase tracking-wider shrink-0">
      {label}
    </span>
    <span className="text-[14px] font-black text-content-main whitespace-nowrap">
      {value || '—'}
    </span>
  </div>
);

// Полоска посещаемости — тот же смысл, что в статистике по клубу:
// сколько событий человек мог посетить и на скольких был.
const AttendanceRow = ({ label, stat, accentColor }) => (
  <div className="flex flex-col gap-1.5 py-1">
    <div className="flex items-center justify-between gap-3">
      <span className="text-[12px] font-bold text-content-muted uppercase tracking-wider">{label}</span>
      <span className="text-[14px] font-black text-content-main">
        {stat.attended} / {stat.total}
        <span className="text-content-subtle"> · {stat.percent}%</span>
      </span>
    </div>
    <div className="h-1.5 rounded-full bg-surface-level2 overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${stat.percent}%`, backgroundColor: accentColor }}
      />
    </div>
  </div>
);

export function CommunityMemberDetails({
  communityId, userId, community, groups = [], canManage,
  // Штаб и подпись владельца правятся по разным ключам: роль — только
  // владельцем, а его собственная подпись лежит в профиле сообщества
  canManageRoles, canEditProfile,
  activeBrandColor, onSaved,
}) {
  const [member, setMember] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingBlock, setSavingBlock] = useState(null);
  const [editingBlock, setEditingBlock] = useState(null);
  const [toast, setToast] = useState({ isOpen: false, message: '', type: 'success' });

  // Черновики правки: значение меняется по радиокнопке, а уезжает на сервер
  // только по «Сохранить» — как в блоке ролей карточки игрока.
  const [draftPosition, setDraftPosition] = useState('skater');
  const [draftGroupId, setDraftGroupId] = useState(null);
  const [draftStaffRole, setDraftStaffRole] = useState('community_manager');
  const [draftStaffTitle, setDraftStaffTitle] = useState('');
  const [hidePersonal, setHidePersonal] = useState(false);
  const [isSavingPrivacy, setIsSavingPrivacy] = useState(false);

  const notify = useCallback((message, type = 'success') => {
    setToast({ isOpen: true, message, type });
  }, []);

  const accentColor = activeBrandColor || 'var(--color-brand)';
  const isSkating = community?.category === 'skating';
  const base = `${import.meta.env.VITE_API_URL}/api/communities/${communityId}/members/${userId}`;

  const load = useCallback(async () => {
    try {
      const detailsRes = await fetch(base, { headers: getAuthHeaders() });
      const detailsJson = await detailsRes.json();
      if (detailsJson.success) setMember(detailsJson.member);

      // Посещаемость запрашиваем только у действующего участника: у человека
      // из штаба, который не вступал, и у исключённого событий за ним не числится.
      const m = detailsJson.member;
      if (detailsJson.success && m?.member_id && !m.left_at) {
        const statsRes = await fetch(`${base}/stats`, { headers: getAuthHeaders() });
        const statsJson = await statsRes.json();
        if (statsJson.success) setStats(statsJson);
      } else {
        setStats(null);
      }
    } catch {
      notify('Не удалось загрузить карточку', 'error');
    } finally {
      setLoading(false);
    }
  }, [base, notify]);

  useEffect(() => { load(); }, [load]);

  // Черновики подтягиваются за карточкой: открыли правку — видим текущее
  useEffect(() => {
    if (!member) return;
    setDraftPosition(member.position === 'goalie' ? 'goalie' : 'skater');
    setDraftGroupId(member.group_id ?? null);
    setDraftStaffRole(member.staff_role || 'community_manager');
    setDraftStaffTitle((member.is_owner ? member.owner_title : member.staff_title) || '');
    setHidePersonal(!!member.hide_personal_info);
  }, [member]);

  const patchMember = async (patch, blockKey) => {
    setSavingBlock(blockKey);
    setEditingBlock(null);
    try {
      const res = await fetch(base, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error('failed');
      // Посещаемость зависит от группы: сменили её — знаменатель другой
      await load();
      onSaved?.();
    } catch {
      notify('Не удалось сохранить', 'error');
      await load();
    } finally {
      setSavingBlock(null);
    }
  };

  // Подпись в штабе. У владельца она часть профиля сообщества, у остальных —
  // строка в ролях, поэтому и ручки разные, хотя блок в карточке один.
  const saveStaffTitle = async () => {
    setSavingBlock('staff');
    setEditingBlock(null);
    const apiUrl = import.meta.env.VITE_API_URL;
    const [url, body] = member.is_owner
      ? [`${apiUrl}/api/communities/${communityId}/profile`, { owner_title: draftStaffTitle }]
      : [
          `${apiUrl}/api/communities/${communityId}/staff/${userId}`,
          { role: draftStaffRole, title: draftStaffTitle },
        ];
    try {
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('failed');
      await load();
      onSaved?.();
    } catch {
      notify('Не удалось сохранить должность', 'error');
      await load();
    } finally {
      setSavingBlock(null);
    }
  };

  // Скрытие контактов человек переключает у себя и отдельно в каждом сообществе:
  // где-то рядом чужие люди, а где-то по правилам нужен контакт.
  const togglePrivacy = async (value) => {
    const previous = hidePersonal;
    setHidePersonal(value);
    setIsSavingPrivacy(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/api/communities/${communityId}/members/me/privacy`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ hide_personal_info: value }),
        }
      );
      const json = await res.json();
      if (!json.success) throw new Error('failed');
    } catch {
      setHidePersonal(previous);
      notify('Не удалось сохранить', 'error');
    } finally {
      setIsSavingPrivacy(false);
    }
  };

  if (loading) return <PageLoader />;
  if (!member) return null;

  const age = member.birth_date ? dayjs().diff(dayjs(member.birth_date), 'year') : null;
  const isArchived = !!member.left_at;
  // Действующий участник — только он имеет амплуа, группу и посещаемость.
  // У исключённого их больше нет, даже если он остался в штабе.
  const isActiveMember = !!member.member_id && !isArchived;
  const canEditMembership = canManage && isActiveMember;

  // В штабе человек либо владелец, либо со строкой в ролях — третьего нет
  const isStaff = member.is_owner || !!member.staff_role;
  const staffRoleName = member.is_owner
    ? 'Владелец'
    : member.staff_role === 'community_manager' ? 'Руководитель'
      : member.staff_role === 'community_admin' ? 'Администратор' : null;
  const staffTitle = (member.is_owner ? member.owner_title : member.staff_title) || null;
  // Подпись владельца правит владелец и руководитель, чужие должности — только владелец
  const canEditStaffTitle = member.is_owner ? !!canEditProfile : !!canManageRoles;

  const roleLabel = staffTitle || staffRoleName;

  // Строка о членстве только у действующего участника. Ушедшему и человеку
  // из штаба, который не вступал, писать нечего — молчим, а не сообщаем,
  // что он «не в участниках»: об этом и так говорит отсутствие амплуа.
  const membershipLine = isActiveMember
    ? `В сообществе с ${member.joined_at ? dayjs(member.joined_at).format('DD.MM.YYYY') : '—'}`
    : null;

  return (
    <FadeIn className="w-full h-full overflow-y-auto scrollbar-hide text-left">
      <div className="flex flex-col p-4 pb-10">

        {/* ШАПКА: фото и ФИО в три строки — как в карточке игрока команды.
            Амплуа правится здесь же карандашом: заводить ради двух вариантов
            отдельный блок незачем. */}
        <div className="flex flex-col p-4 bg-surface-level1 border border-surface-border rounded-2xl shadow-sm mb-3 relative">
          {savingBlock === 'position' && <SavingOverlay accentColor={accentColor} />}

          {canEditMembership && (
            <EditPencil
              isEditing={editingBlock === 'position'}
              accentColor={accentColor}
              className="absolute top-4 right-4 z-10"
              onClick={() => setEditingBlock(prev => (prev === 'position' ? null : 'position'))}
            />
          )}

          {membershipLine && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-content-subtle mb-3 pr-8">
              {membershipLine}
            </span>
          )}

          <div className="flex items-center gap-4 w-full pr-1">
            <div
              className="rounded-3xl bg-surface-base border border-surface-border p-0.5 shadow-sm flex items-center justify-center overflow-hidden shrink-0"
              style={{ width: uiFixed(80), height: uiFixed(80) }}
            >
              <Avatar
                photoUrl={member.avatar_url}
                firstName={member.first_name}
                lastName={member.last_name}
                className="w-full h-full rounded-3xl"
              />
            </div>

            <div className="flex flex-col text-left flex-1 min-w-0">
              <h2
                className="font-bold text-content-main uppercase whitespace-nowrap leading-tight"
                style={{ fontSize: uiFixed(16) }}
              >
                {member.last_name}
              </h2>
              <h3 className="text-[12px] font-bold text-content-muted mt-0.5 capitalize">
                {member.first_name}
              </h3>
              {member.middle_name && (
                <h4 className="text-[12px] font-medium text-content-muted truncate opacity-60">
                  {member.middle_name}
                </h4>
              )}

              {/* Амплуа — плашкой под отчеством, как капитанство в команде:
                  это главное, что сообщество знает о человеке */}
              {isActiveMember && (
                <div
                  className={clsx(
                    'mt-2 self-start px-2 py-0.5 font-black uppercase rounded-md shadow-sm whitespace-nowrap',
                    getContrastTextColor(activeBrandColor)
                  )}
                  style={{ backgroundColor: accentColor, fontSize: uiFixed(10) }}
                >
                  {member.position === 'goalie' ? 'Вратарь' : 'Полевой'}
                </div>
              )}

             
            </div>
          </div>

          {editingBlock === 'position' && canEditMembership && (
            /* От амплуа зависит очередь на событии с лимитом: у полевых
               и вратарей она раздельная */
            <div className="flex flex-col gap-2.5 pt-4 mt-4 border-t border-surface-border">
              <RadioLP
                name="community-position"
                checked={draftPosition === 'skater'}
                onChange={() => setDraftPosition('skater')}
                label="Полевой"
                activeColor={activeBrandColor}
              />
              <RadioLP
                name="community-position"
                checked={draftPosition === 'goalie'}
                onChange={() => setDraftPosition('goalie')}
                label="Вратарь"
                activeColor={activeBrandColor}
              />
              <ButtonLP
                variant="primary"
                onClick={() => patchMember({ position: draftPosition }, 'position')}
                disabled={savingBlock === 'position'}
                activeColor={activeBrandColor}
                className="w-full flex items-center justify-center gap-2 mt-2 py-2.5"
              >
                <span>Сохранить</span>
              </ButtonLP>
            </div>
          )}
        </div>

        {/* ДОЛЖНОСТЬ В ШТАБЕ */}
        {isStaff && (
          <CustomBlock
            title="Должность в штабе"
            icon="shield_alert"
            isManager={canEditStaffTitle}
            isEditing={editingBlock === 'staff'}
            isSaving={savingBlock === 'staff'}
            activeBrandColor={activeBrandColor}
            onAction={() => setEditingBlock(prev => (prev === 'staff' ? null : 'staff'))}
          >
            {editingBlock === 'staff' ? (
              <div className="flex flex-col gap-3 pt-1">
                {/* Владельцу роль не выбирают: он один и сменить её нельзя */}
                {!member.is_owner && (
                  <div className="flex flex-col gap-2.5">
                    <RadioLP
                      name="community-staff-role"
                      checked={draftStaffRole === 'community_manager'}
                      onChange={() => setDraftStaffRole('community_manager')}
                      label="Руководитель"
                      activeColor={activeBrandColor}
                    />
                    <RadioLP
                      name="community-staff-role"
                      checked={draftStaffRole === 'community_admin'}
                      onChange={() => setDraftStaffRole('community_admin')}
                      label="Администратор"
                      activeColor={activeBrandColor}
                    />
                  </div>
                )}

                <TextInputLP
                  label="Должность"
                  value={draftStaffTitle}
                  onChange={setDraftStaffTitle}
                  placeholder="Тренер, помощник тренера…"
                  maxLength={50}
                />
                <span className="text-[11px] text-content-subtle leading-relaxed -mt-2">
                  Только подпись, на права она не влияет. Пусто — подпишем по должности.
                </span>

                <ButtonLP
                  variant="primary"
                  onClick={saveStaffTitle}
                  disabled={savingBlock === 'staff'}
                  activeColor={activeBrandColor}
                  className="w-full flex items-center justify-center gap-2 mt-1 py-2.5"
                >
                  <span>Сохранить</span>
                </ButtonLP>
              </div>
            ) : (
              <>
                <InfoRow label="Роль" value={staffRoleName} />
                <InfoRow label="Должность" value={staffTitle} />
              </>
            )}
          </CustomBlock>
        )}

        {/* ГРУППА — только у тренировок и только если группы заведены */}
        {isActiveMember && isSkating && groups.length > 0 && (
          <CustomBlock
            title="Тренировочная группа"
            icon="users"
            isManager={canEditMembership}
            isEditing={editingBlock === 'group'}
            isSaving={savingBlock === 'group'}
            activeBrandColor={activeBrandColor}
            onAction={() => setEditingBlock(prev => (prev === 'group' ? null : 'group'))}
          >
            {editingBlock === 'group' ? (
              <div className="flex flex-col gap-2.5 pt-1">
                <RadioLP
                  name="community-group"
                  checked={!draftGroupId}
                  onChange={() => setDraftGroupId(null)}
                  label="Без группы"
                  activeColor={activeBrandColor}
                />
                {groups.map(g => (
                  <RadioLP
                    key={g.id}
                    name="community-group"
                    checked={String(draftGroupId) === String(g.id)}
                    onChange={() => setDraftGroupId(g.id)}
                    label={g.name}
                    activeColor={activeBrandColor}
                  />
                ))}
                <ButtonLP
                  variant="primary"
                  onClick={() => patchMember({ group_id: draftGroupId }, 'group')}
                  disabled={savingBlock === 'group'}
                  activeColor={activeBrandColor}
                  className="w-full flex items-center justify-center gap-2 mt-2 py-2.5"
                >
                  <span>Сохранить</span>
                </ButtonLP>
              </div>
            ) : (
              <>
                <InfoRow label="Группа" value={member.group_name || 'Без группы'} />
                <span className="text-[11px] text-content-subtle leading-relaxed mt-1">
                  Группа решает, какие тренировки человек видит в календаре
                  и на какие может отметиться.
                </span>
              </>
            )}
          </CustomBlock>
        )}

        {/* ПОСЕЩАЕМОСТЬ */}
        {isActiveMember && stats && (
          <CustomBlock title="Посещаемость" icon="metrics" activeBrandColor={activeBrandColor}>
            {isSkating
              ? <AttendanceRow label="Тренировки" stat={stats.training} accentColor={accentColor} />
              : <AttendanceRow label="Солянки" stat={stats.game} accentColor={accentColor} />}
            <span className="text-[11px] text-content-subtle leading-relaxed mt-2">
              Учитываются прошедшие события за время участия
              {isSkating ? ' и только те, что адресованы его группе.' : '.'}
            </span>
          </CustomBlock>
        )}

        <CustomBlock title="Физические данные" icon="player" activeBrandColor={activeBrandColor}>
          <InfoRow label="Рост" value={member.height ? `${member.height} см` : null} />
          <InfoRow label="Вес" value={member.weight ? `${member.weight} кг` : null} />
          <InfoRow
            label="Хват клюшки"
            value={member.grip === 'left' ? 'Левый (L)' : member.grip === 'right' ? 'Правый (R)' : null}
          />
        </CustomBlock>

        <CustomBlock title="Личная информация" icon="roster" activeBrandColor={activeBrandColor}>
          {member.personal_hidden ? (
            /* Скрытые поля не приходят с сервера вовсе — «скрытие» не должно
               держаться на честности интерфейса */
            <div className="flex items-center gap-2 py-1">
              <Icon name="lock" className="w-3.5 h-3.5 text-content-subtle shrink-0" />
              <span className="text-[12px] text-content-muted leading-snug">
                Участник скрыл контакты в этом сообществе
              </span>
            </div>
          ) : (
            <>
              <InfoRow label="тел." value={formatPhoneNumber(member.phone)} />
              <InfoRow
                label="Дата рожд."
                value={member.birth_date ? dayjs(member.birth_date).format('DD.MM.YYYY') : null}
              />
              <InfoRow label="Возраст" value={age ? String(age) : null} />
              {/* Телефон нужен, чтобы связаться: кнопки открывают переписку сразу,
                  без набора номера руками */}
              <MessengerLinks phone={member.phone} className="justify-start pt-3" />
            </>
          )}

          {/* Переключатель видит только сам человек и только в своей карточке:
              скрытие настраивается в каждом сообществе отдельно */}
          {member.is_self && isActiveMember && (
            <div className="flex items-center justify-between gap-4 pt-3 mt-3 border-t border-surface-border">
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-[13px] font-bold text-content-main">
                  Скрыть в этом сообществе
                </span>
                <span className="text-[11px] text-content-subtle leading-snug mt-1">
                  Телефон и дата рождения перестанут показываться другим участникам, но не владельцу сообщества
                  
                </span>
              </div>
              <Toggle
                checked={hidePersonal}
                onChange={togglePrivacy}
                disabled={isSavingPrivacy}
                activeColor={activeBrandColor}
              />
            </div>
          )}
        </CustomBlock>
      </div>

      <Toast
        isOpen={toast.isOpen}
        message={toast.message}
        type={toast.type}
        onClose={() => setToast(prev => ({ ...prev, isOpen: false }))}
        activeColor={activeBrandColor}
      />
    </FadeIn>
  );
}
