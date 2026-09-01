import React, { useState } from 'react';
import clsx from 'clsx';
import { getAuthHeaders, getImageUrl, COMMUNITY_CATEGORY_LABELS } from '../../utils/helpers';
import { BottomSheet } from '../../ui/BottomSheet';
import { ButtonLP } from '../../ui/Button-LP';
import { ConfirmSheet } from '../../ui/ConfirmSheet';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { SectionHeader } from '../../ui/SectionHeader';
import { CommunityChatLink } from '../../ui/MessengerLogos';
import { Icon } from '../../ui/Icon';

// Карточка сообщества в правой панели.
//
// Это экран одного решения — «вступать или нет», — поэтому свёрстан в том
// порядке, в каком решение и принимается: кто это (шапка), чем живёт (цифры и
// описание), что я тут выбираю (амплуа), и только потом действия.
//
// Действия сделаны карточками в форме остальных блоков, а не яркими кнопками:
// их две подряд, и обе кричащие спорили бы друг с другом. Главное выделено
// тонировкой, не размером. Необратимое — уход и удаление — уведено вниз
// текстовыми ссылками, чтобы не попасть под палец случайно.
export function CommunityDetailsPanel({
  community, onJoined, onLeft, onDeleted, onOpen, activeBrandColor, onClose,
}) {
  const [position, setPosition] = useState('skater');
  const [isBusy, setIsBusy] = useState(false);
  const [confirm, setConfirm] = useState(null); // 'leave' | 'delete'
  const [isJoinOpen, setIsJoinOpen] = useState(false);
  const [error, setError] = useState('');

  if (!community) return null;

  const isOwner = !!community.is_owner;
  const isMember = !!community.is_member;
  const isStaff = !!community.is_staff;

  // Вступить может любой, кто ещё не в участниках, — включая владельца и штаб:
  // членство и должность в сообществе разные вещи, и тренер, который сам выходит
  // на лёд, должен уметь отметиться на собственное событие.
  const canJoin = !isMember;
  // Выйти может участник и человек из штаба. Владелец при этом остаётся владельцем:
  // снимается только членство, само сообщество за ним сохраняется.
  const canLeave = isMember || isStaff;
  // Внутрь пускаем только своих: постороннему там нечего делать — состав, штаб
  // и настройки ему всё равно закрыты, и переход упёрся бы в пустой экран.
  const canOpen = isMember || isStaff || isOwner;

  const statusLabel = isOwner
    ? (isMember ? 'Ваше сообщество, вы участник' : 'Ваше сообщество')
    : isStaff
      ? (isMember ? 'Вы в штабе и участник' : 'Вы в штабе')
      : isMember ? 'Вы участник' : null;

  // Прозрачность через hex-суффикс работает только на настоящем цвете. Когда у
  // сообщества своего цвета нет, activeBrandColor приходит как var(--color-brand),
  // и «var(...)12» — это невалидный CSS: тонировку тогда берём готовым классом.
  const hasOwnColor = typeof activeBrandColor === 'string' && activeBrandColor.startsWith('#');
  const tintStyle = hasOwnColor
    ? { backgroundColor: `${activeBrandColor}14`, borderColor: `${activeBrandColor}33` }
    : undefined;

  // Компонентам кита цвет отдаём только настоящим hex. С «var(--color-brand)»
  // они уходят в ветку инлайн-стиля: кнопка теряет фирменный глянец, а расчёт
  // контраста текста считает по строке «va» и держится на случайности.
  const brandColorProp = hasOwnColor ? activeBrandColor : null;

  const request = async (path, method, body) => {
    setIsBusy(true);
    setError('');
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/api/communities/${community.id}${path}`,
        {
          method,
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: body ? JSON.stringify(body) : undefined,
        }
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Не удалось выполнить действие');
      }
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setIsBusy(false);
    }
  };

  const handleJoin = async () => {
    if (await request('/join', 'POST', { position })) {
      setIsJoinOpen(false);
      await onJoined?.(community);
      onClose?.();
    }
  };

  const handleLeave = async () => {
    setConfirm(null);
    if (await request('/leave', 'POST')) {
      await onLeft?.(community);
      onClose?.();
    }
  };

  const handleDelete = async () => {
    setConfirm(null);
    if (await request('', 'DELETE')) {
      await onDeleted?.(community);
      onClose?.();
    }
  };

  const Stat = ({ label, value, className }) => (
    <div className={clsx(
      'flex-1 min-w-0 flex flex-col items-center justify-center gap-1 py-3 px-2 rounded-2xl bg-surface-level1 border border-surface-border',
      className
    )}>
      <span className="text-[16px] font-black text-content-main leading-none truncate max-w-full">
        {value}
      </span>
      <span className="text-[9px] font-black uppercase tracking-widest text-content-subtle">
        {label}
      </span>
    </div>
  );

  // Действие карточкой, а не яркой кнопкой: у панели их два подряд, и обе
  // кричащие спорили бы друг с другом. Форма та же, что у блоков выше, —
  // отличается только акцентом на иконке у главного действия.
  const CardAction = ({ onClick, icon, children, accent = false }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={isBusy}
      className={clsx(
        'flex items-center gap-3 p-3 rounded-2xl border w-full text-left outline-none',
        'transition-all active:scale-[0.99] disabled:opacity-40',
        accent && hasOwnColor ? '' : accent ? 'bg-brand-opacity border-transparent' : 'bg-surface-level1 border-surface-border'
      )}
      style={accent && hasOwnColor ? tintStyle : undefined}
    >
      <div className={clsx(
        'w-8 h-8 rounded-xl flex items-center justify-center shrink-0',
        accent ? 'bg-surface-base' : 'bg-surface-level2'
      )}>
        <Icon
          name={icon}
          className="w-4 h-4"
          style={accent ? { color: activeBrandColor } : undefined}
        />
      </div>
      <span className="text-[13px] font-bold text-content-main truncate flex-1">
        {children}
      </span>
      <Icon name="chevron_right" className="w-4 h-4 text-content-subtle shrink-0" />
    </button>
  );

  // Уход и удаление остаются ссылками: они необратимы и внизу экрана им самое место
  const LinkAction = ({ onClick, children, danger = false }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={isBusy}
      className={clsx(
        'text-[12px] font-bold underline underline-offset-4 py-2.5 outline-none text-center',
        'transition-opacity active:opacity-60 disabled:opacity-40',
        danger ? 'text-danger' : 'text-content-muted'
      )}
    >
      {children}
    </button>
  );

  return (
    <div className="w-full h-full overflow-y-auto scrollbar-hide text-left bg-transparent">
      <div className="flex flex-col gap-4 p-4 pb-10">

        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[14px] font-semibold">
            {error}
          </div>
        )}

        {/* Шапка: тонирована собственным цветом сообщества, если он задан —
            тот же приём, что на страницах команды и клуба */}
        <div
          style={tintStyle}
          className={clsx(
            'flex items-center gap-4 p-4 rounded-2xl border',
            !hasOwnColor && 'bg-brand-opacity border-transparent'
          )}
        >
          <div className="w-16 h-16 rounded-xl bg-surface-base flex items-center justify-center shrink-0 overflow-hidden">
            {community.logo_url
              ? <img src={getImageUrl(community.logo_url)} alt={community.name} className="w-full h-full object-contain rounded-xl" />
              : <Icon name="handshake" className="w-7 h-7 text-content-subtle" />}
          </div>

          <div className="flex flex-col min-w-0 flex-1 gap-1.5">
            <h3 className="text-[20px] font-black text-content-main leading-tight break-words">
              {community.name}
            </h3>
            <span
              className="text-[10px] font-black uppercase tracking-widest"
              style={{ color: activeBrandColor }}
            >
              {COMMUNITY_CATEGORY_LABELS[community.category] || 'Сообщество'}
            </span>
          </div>
        </div>

        {statusLabel && (
          <div className="flex items-center gap-2 -mt-1">
            <Icon name="check" className="w-3.5 h-3.5 shrink-0" style={{ color: activeBrandColor }} />
            <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: activeBrandColor }}>
              {statusLabel}
            </span>
          </div>
        )}

        {/* Цифры строкой: так они читаются с одного взгляда, а не разбираются
            по одной из столбика мелких серых подписей */}
        <div className="flex items-stretch gap-2">
          {/* Число участников трёхзначное в самом смелом случае, поэтому блок
              узкий, а подпись сокращена: «Участников» занимала вдвое больше
              места, чем сама цифра. */}
          <Stat label="Уч." value={community.members_count ?? 0} className="max-w-[84px]" />
          <Stat label="Город" value={community.city || '—'} />

          {/* Чат — не показатель, поэтому не в блоке: просто ссылка следом */}
          <CommunityChatLink
            messenger={community.chat_messenger}
            url={community.chat_url}
            size="w-[52px] h-[52px]"
            className="self-center"
          />
        </div>

        {community.description && (
          <div className="flex flex-col gap-2 p-4 rounded-2xl bg-surface-level1 border border-surface-border">
            <SectionHeader title="О сообществе" />
            <p className="text-[13px] text-content-main leading-relaxed whitespace-pre-line">
              {community.description}
            </p>
          </div>
        )}

        {/* Действия — после того, как человек прочитал, куда идёт.
            «Присоединиться» идёт следом за переходом: сначала попасть внутрь,
            потом решать, вступать ли. */}
        <div className="flex flex-col gap-2">
          {canOpen && (
            <CardAction
              onClick={() => { onOpen?.(community); onClose?.(); }}
              icon="handshake"
            >
              Перейти в сообщество
            </CardAction>
          )}

          {canJoin && (
            <ButtonLP
              onClick={() => setIsJoinOpen(true)}
              disabled={isBusy}
              activeColor={brandColorProp}
            >
              Присоединиться
            </ButtonLP>
          )}

          {canLeave && (
            <LinkAction danger onClick={() => setConfirm('leave')}>
              {isOwner ? 'Выйти из участников' : 'Покинуть сообщество'}
            </LinkAction>
          )}
        </div>

        {/* Удаление — в самом низу и за чертой: оно необратимо и не должно
            попадаться под палец рядом с обычными действиями */}
        {isOwner && (
          <div className="flex flex-col pt-2 border-t border-surface-border">
            <LinkAction danger onClick={() => setConfirm('delete')}>
              Удалить сообщество
            </LinkAction>
          </div>
        )}
      </div>

      {/* Амплуа спрашиваем не на самой панели, а шторкой по нажатию: пока человек
          не решил вступать, выбор ему ни к чему и только занимает экран */}
      <BottomSheet isOpen={isJoinOpen} onClose={() => setIsJoinOpen(false)}>
        <div className="flex flex-col gap-4">
          <h3 className="text-[18px] font-black text-content-main">В качестве кого?</h3>

          {/* От амплуа зависит очередь на событии с лимитом: у полевых и вратарей
              она раздельная. Позже амплуа меняет штаб на странице сообщества. */}
          <SegmentedControl
            options={[
              { value: 'skater', label: 'Полевой' },
              { value: 'goalie', label: 'Вратарь' },
            ]}
            value={position}
            onChange={setPosition}
            activeColor={brandColorProp}
          />

          <p className="text-[11px] text-content-subtle leading-relaxed">
            После вступления события сообщества появятся в вашем календаре.
            Если состав уже набран — встанете в резерв.
          </p>

          <ButtonLP
            onClick={handleJoin}
            isLoading={isBusy}
            disabled={isBusy}
            activeColor={brandColorProp}
          >
            Присоединиться
          </ButtonLP>
        </div>
      </BottomSheet>

      <ConfirmSheet
        isOpen={confirm === 'leave'}
        onClose={() => setConfirm(null)}
        onConfirm={handleLeave}
        isLoading={isBusy}
        title={isOwner ? 'Выйти из участников?' : 'Покинуть сообщество?'}
        description={isOwner
          ? 'Вы перестанете быть участником и не сможете отмечаться на события. Сообщество останется вашим — управление и настройки сохранятся.'
          : isStaff
            ? 'События пропадут из вашего календаря, а должность в штабе будет снята. Вернуться можно из каталога.'
            : 'События сообщества пропадут из вашего календаря. Вернуться можно из каталога.'}
        confirmLabel={isOwner ? 'Выйти' : 'Покинуть'}
      />

      <ConfirmSheet
        isOpen={confirm === 'delete'}
        onClose={() => setConfirm(null)}
        onConfirm={handleDelete}
        isLoading={isBusy}
        title="Удалить сообщество?"
        description="Вместе с ним удалятся все его события, отметки участников, группы и штаб. Отменить это будет нельзя."
        confirmLabel="Удалить"
      />
    </div>
  );
}
