import React, { useState } from 'react';
import { ButtonLP } from '../../ui/Button-LP';
import { StepperLP } from '../../ui/Input-LP';
import { FeeSettingsFields } from '../../ui/FeeSettingsFields';
import { RadioLP } from '../../ui/Radio-LP';
import { PanelBlock } from './CommunityPanelBlock';
import { getAuthHeaders } from '../../utils/helpers';

// =============================================================================
// НАСТРОЙКИ СОБЫТИЙ
//
// Не правила, а заготовка: чем будет заполнена форма создания следующего
// события. Три независимых набора — взнос, состав и публикация, — поэтому три
// блока со своими кнопками: сохранять лимиты вместе со взносом незачем.
// =============================================================================
export function CommunityEventDefaultsPanel({
  communityId, community, activeBrandColor, onSaved,
}) {
  const accentColor = activeBrandColor || null;

  const [fee, setFee] = useState(() => ({
    costMode: community?.default_cost_mode || 'per_person',
    playerFee: community?.default_cost != null ? String(community.default_cost) : '',
    totalCost: community?.default_total_cost != null ? String(community.default_total_cost) : '',
    isFree: community?.default_cost === 0 || community?.default_total_cost === 0,
    goaliesFree: community?.default_goalies_free ?? true,
    minParticipants: community?.default_cost_min_participants ?? 1,
    deadlineHours: community?.default_attendance_deadline_hours ?? 4,
  }));

  // Пустая строка — «лимита нет» (NULL в колонке). У вратарей за ней идёт ноль:
  // он значит, что вратари не набираются вовсе, и пустотой его подменять нельзя.
  const [maxSkaters, setMaxSkaters] = useState(community?.default_max_skaters ?? '');
  const [maxGoalies, setMaxGoalies] = useState(community?.default_max_goalies ?? '');
  const [publishMode, setPublishMode] = useState(community?.default_publish_mode || 'immediate');
  const [publishHours, setPublishHours] = useState(
    community?.default_publish_hours_before != null ? String(community.default_publish_hours_before) : '24'
  );

  const [savingBlock, setSavingBlock] = useState(null);
  const [error, setError] = useState('');

  const save = async (blockKey, payload) => {
    setSavingBlock(blockKey);
    setError('');
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/api/communities/${communityId}/settings`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Не удалось сохранить');
      await onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingBlock(null);
    }
  };

  const saveFee = () => {
    const isSplit = fee.costMode === 'split';
    const amount = fee.isFree ? 0 : Number(isSplit ? fee.totalCost : fee.playerFee);
    const value = Number.isFinite(amount) ? amount : null;
    return save('fee', {
      default_cost_mode: fee.costMode,
      default_cost: isSplit ? null : value,
      default_total_cost: isSplit ? value : null,
      default_goalies_free: !!fee.goaliesFree,
      default_cost_min_participants: fee.minParticipants ?? 1,
      default_attendance_deadline_hours: fee.deadlineHours ?? 0,
    });
  };

  return (
    <div className="w-full h-full flex flex-col overflow-y-auto scrollbar-hide text-left">
      <div className="flex flex-col gap-3 px-3 py-4 pb-32">
        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[14px] font-semibold">
            {error}
          </div>
        )}

        <p className="text-[11px] text-content-subtle leading-relaxed px-1">
          Этими значениями будет заполнена форма создания следующего события.
          В самой форме их можно менять — на уже созданные события настройка не влияет.
        </p>

        <PanelBlock title="Взнос" icon="currency" accentColor={accentColor} isSaving={savingBlock === 'fee'}>
          <div className="flex flex-col gap-4 pt-1">
            <FeeSettingsFields value={fee} onChange={setFee} activeColor={accentColor} />
            <ButtonLP onClick={saveFee} disabled={savingBlock === 'fee'} activeColor={accentColor} className="w-full py-2.5">
              Сохранить
            </ButtonLP>
          </div>
        </PanelBlock>

        <PanelBlock title="Состав" icon="users" accentColor={accentColor} isSaving={savingBlock === 'limits'}>
          <div className="flex flex-col gap-4 pt-1">
            <StepperLP
              inline
              allowEmpty
              label="Максимум полевых"
              value={maxSkaters}
              onChange={setMaxSkaters}
              min={1}
              max={60}
              suffix="чел."
              activeColor={accentColor}
            />
            <StepperLP
              inline
              allowEmpty
              label="Максимум вратарей"
              value={maxGoalies}
              onChange={setMaxGoalies}
              min={0}
              max={10}
              suffix="чел."
              activeColor={accentColor}
            />
            <span className="text-[11px] text-content-subtle leading-relaxed pl-1">
              «—» — без ограничения. Когда основа заполнена, отметившиеся уходят
              в резерв и ждут освободившегося места. Ноль вратарей означает, что
              вратари не набираются вовсе.
            </span>
            <ButtonLP
              onClick={() => save('limits', {
                default_max_skaters: maxSkaters === '' ? null : Number(maxSkaters),
                default_max_goalies: maxGoalies === '' ? null : Number(maxGoalies),
              })}
              disabled={savingBlock === 'limits'}
              activeColor={accentColor}
              className="w-full py-2.5"
            >
              Сохранить
            </ButtonLP>
          </div>
        </PanelBlock>

        <PanelBlock title="Публикация" icon="calendar" accentColor={accentColor} isSaving={savingBlock === 'publish'}>
          <div className="flex flex-col gap-2.5 pt-1">
            <span className="text-[11px] text-content-subtle leading-relaxed">
              Когда участники увидят событие в календаре. Пока оно не опубликовано,
              карточку видит только штаб.
            </span>

            <RadioLP
              name="community-publish-default"
              checked={publishMode === 'immediate'}
              onChange={() => setPublishMode('immediate')}
              label="Сразу после создания"
              activeColor={accentColor}
            />

            <RadioLP
              name="community-publish-default"
              checked={publishMode === 'manual'}
              onChange={() => setPublishMode('manual')}
              label="По кнопке на карточке события"
              activeColor={accentColor}
            />
            <RadioLP
              name="community-publish-default"
              checked={publishMode === 'before_event'}
              onChange={() => setPublishMode('before_event')}
              label="Автоматическая публикация"
              activeColor={accentColor}
            />
            {/* Степпер — не четвёртый вариант выбора, а параметр выбранного,
                поэтому отбит от списка радиокнопок сверху и ещё чуть сильнее
                снизу, до кнопки сохранения. */}
            {publishMode === 'before_event' && (
              <StepperLP
                inline
                className="mt-4 mb-4"
                label="За сколько часов до начала события"
                value={Number(publishHours) || 24}
                onChange={(val) => setPublishHours(String(val))}
                min={1}
                max={168}
                suffix="ч"
                activeColor={accentColor}
              />
            )}

            <ButtonLP
              onClick={() => save('publish', {
                default_publish_mode: publishMode,
                default_publish_hours_before: publishMode === 'before_event'
                  ? Math.max(1, Number(publishHours) || 24)
                  : null,
              })}
              disabled={savingBlock === 'publish'}
              activeColor={accentColor}
              className="w-full mt-3 py-2.5"
            >
              Сохранить
            </ButtonLP>
          </div>
        </PanelBlock>
      </div>
    </div>
  );
}
