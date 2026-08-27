import React from 'react';
import { createPortal } from 'react-dom';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import { Icon } from '../ui/Icon';
import { ButtonLP } from '../ui/Button-LP';
import { getPortalRoot } from '../utils/helpers';
import { getSubscriptionStatus, pluralizeDays } from '../utils/subscription';

dayjs.locale('ru');

/**
 * Приветственное окно при самом первом входе после активации аккаунта.
 * Сообщает о выданном пробном периоде. В отличие от ConsentModal — не блокирующее:
 * закрывается и кнопкой, и кликом по оверлею.
 *
 * Срок берётся из реальной даты окончания подписки, а не из константы: если профилю
 * уже оплатили доступ длиннее пробного, окно покажет фактический срок, а не «30 дней».
 */
export function WelcomeTrialModal({ isOpen, expiresAt, onClose }) {
  if (!isOpen || !expiresAt) return null;

  const daysLeft = getSubscriptionStatus(expiresAt).daysLeft;

  return createPortal(
    <div className="absolute inset-0 z-[350] flex items-center justify-center p-4 animate-fade-in pointer-events-auto">
      <div className="absolute inset-0 bg-overlay backdrop-blur-md" onClick={onClose} />

      <div className="bg-surface-level1 border border-surface-border rounded-3xl w-full max-w-sm p-6 shadow-2xl relative z-10 flex flex-col gap-5 animate-scale-in text-left">

        <div className="flex items-center gap-3 border-b border-surface-level2 pb-3">
          <div className="w-10 h-10 rounded-xl bg-brand/10 text-brand flex items-center justify-center shrink-0">
            <Icon name="trophy" className="w-5 h-5" strokeWidth={2.5} />
          </div>
          <div className="flex flex-col">
            <h3 className="text-[14px] font-black text-content-main uppercase tracking-wider leading-none">
              Добро пожаловать
            </h3>
            <span className="text-[10px] font-bold text-content-muted uppercase tracking-widest mt-1 block">
              Пробный период
            </span>
          </div>
        </div>

        <p className="text-[14px] text-content-main font-medium leading-relaxed">
          Аккаунт активирован — и мы открыли вам полный доступ ко всем возможностям кабинета
          команды на {daysLeft} {pluralizeDays(daysLeft)}. Расписание, состав, посещаемость
          и статистика уже ждут вас.
        </p>

        <div className="flex items-center gap-3 bg-surface-level2 border border-surface-border rounded-2xl px-4 py-3">
          <Icon name="calendar" className="w-4 h-4 text-content-muted shrink-0" strokeWidth={2.5} />
          <div className="flex flex-col min-w-0">
            <span className="text-[10px] font-bold text-content-muted uppercase tracking-widest">
              Доступ действует до
            </span>
            <span className="text-[14px] font-black text-content-main leading-tight mt-0.5">
              {dayjs(expiresAt).format('D MMMM YYYY')}
            </span>
          </div>
        </div>

        <p className="text-[12px] text-content-muted font-medium leading-relaxed">
          Когда пробный период закончится, продлить доступ можно в разделе «Планы оплаты».
          Все ваши данные останутся на месте.
        </p>

        <div className="flex gap-3 w-full pt-4 border-t border-surface-level2">
          <ButtonLP
            variant="primary"
            onClick={onClose}
            className="flex-1 !h-11 !text-[10px] !font-black !uppercase !tracking-widest shadow-md"
          >
            Отлично, начнём
          </ButtonLP>
        </div>

      </div>
    </div>,
    getPortalRoot()
  );
}
