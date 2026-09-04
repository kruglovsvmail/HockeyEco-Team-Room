// =============================================================================
// ОТОБРАЖЕНИЕ СТОИМОСТИ СОБЫТИЯ
//
// Сумму считает бэкенд (CalendarController): фронт получает готовый my_fee и
// подсказку fee_status — как эту сумму подписывать:
//   none    — взнос не назначен
//   fixed   — фиксированная сумма с человека, от состава не зависит
//   split   — доля от общей суммы, будет меняться с числом отметившихся
//   pending — сумма назначена, но плательщиков меньше порога, цифру не показываем
//   locked  — событие прошло, доля зафиксирована и больше не изменится
//   exempt  — этот участник не платит (вратарь при «вратари бесплатно» или free)
//
// Старые карточки из localStorage-кэша приходят без fee_status — для них
// работает та же логика, что и раньше: есть my_fee → сумма, нет → не назначен.
// =============================================================================

const money = (value) => `${Number(value).toLocaleString('ru-RU')} ₽`;

const FEE_DEPENDS_HINT = 'зависит от числа отметившихся';

// Текст вместо суммы, пока плательщиков меньше порога. Стоит в узкой колонке
// карточки на месте цены, поэтому без цифр — сам порог руководитель видит
// в настройках события, а игроку важен только факт, что цены пока нет.
export const FEE_PENDING_TEXT = 'Недостаточно участников';

// Короткая строка для карточки события и строки «Взнос» в деталях.
// Возвращает null, когда показывать нечего (взнос не назначен).
export function formatEventFee(event) {
  if (!event) return null;
  const status = event.fee_status || (event.my_fee === null || event.my_fee === undefined ? 'none' : 'fixed');
  const fee = event.my_fee;

  if (status === 'pending') return FEE_PENDING_TEXT;
  if (status === 'none' || fee === null || fee === undefined) return null;
  if (Number(fee) === 0) return 'Бесплатно';
  return money(fee);
}

// Пояснение под суммой в карточке события (детали). null — пояснять нечего.
export function eventFeeHint(event) {
  if (!event) return null;
  const status = event.fee_status;
  // 'pending' короткий и без цифр — в деталях под ним уместно то же
  // пояснение, что и у обычной доли.
  if (status === 'split' || status === 'pending') return FEE_DEPENDS_HINT;
  if (status === 'locked') return 'Стоимость зафиксирована после события';
  if (status === 'exempt' && event.cost_mode === 'split') {
    return event.my_pay_role === 'goalie' ? 'Вратари не платят за это событие' : 'Вы освобождены от взноса';
  }
  return null;
}

// Любая отметка меняет делитель долевой стоимости, а считает её сервер —
// локальным патчем цену не обновить.
//
// Сигналов два, и они уходят параллельно, а не по цепочке:
//
//   tr-event-refresh   — TeamLayout перечитывает карточку открытого события;
//   tr-events-updated  — календарь перечитывает месяц, а экраны деталей
//                        перезабирают свои списки.
//
// Второй важно послать сразу, а не ждать ответа на первый: зовут нас уже после
// того, как сервер принял изменение, так что данные для календаря готовы, и
// цеплять его запрос за запросом карточки значит удваивать задержку. Человек
// снимает отметку и тут же уходит назад — календарь должен успеть обновиться.
//
// calendarChanged: true отличает настоящее изменение состава от простого
// перечитывания карточки при открытии события — там календарю делать нечего.
export function notifyAttendanceChanged() {
  window.dispatchEvent(new CustomEvent('tr-event-refresh'));
  window.dispatchEvent(new CustomEvent('tr-events-updated', {
    detail: { calendarChanged: true },
  }));
}

// ── Дедлайн снятия отметки ──────────────────────────────────────────────────
// Те же правила, что на сервере (utils/eventFees.js): NULL в часах — дедлайна
// нет. Нужен интерфейсу, чтобы предупредить до отправки запроса, а не после.
export function isAfterWithdrawDeadline(event) {
  const hours = event?.attendance_deadline_hours;
  const date = event?.event_date || event?.game_date;
  if (hours === null || hours === undefined || !date) return false;
  return Date.now() >= new Date(date).getTime() - Number(hours) * 3600_000;
}

// ── Форма редактирования взноса ─────────────────────────────────────────────
// Событие → состояние полей FeeSettingsFields. Сумму берём из fixed_fee
// (сырой взнос с человека) и total_cost (сырая общая сумма), а НЕ из my_fee:
// в долевом режиме my_fee — это доля смотрящего, и сохранять её как новую
// стоимость события нельзя.
export function feeSettingsFromEvent(event) {
  const mode = event?.cost_mode === 'split' ? 'split' : 'per_person';
  const raw = mode === 'split' ? event?.total_cost : event?.fixed_fee;
  const amount = raw === null || raw === undefined ? '' : String(Math.round(Number(raw)));

  return {
    costMode: mode,
    playerFee: mode === 'split' ? '' : amount,
    totalCost: mode === 'split' ? amount : '',
    isFree: amount === '0',
    goaliesFree: event?.goalies_free !== false,
    minParticipants: Number(event?.cost_min_participants) || 1,
    deadlineHours: event?.attendance_deadline_hours === null || event?.attendance_deadline_hours === undefined
      ? 0
      : Number(event.attendance_deadline_hours),
  };
}

// Состояние полей → тело запроса блока «Финансы».
// Обе суммы шлём всегда: переключение режима туда-обратно не должно терять цифру,
// которую руководитель ввёл в другом режиме.
export function feeSettingsToBody(settings) {
  const toNumber = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
  return {
    cost_mode: settings.costMode,
    player_fee: toNumber(settings.playerFee),
    total_cost: toNumber(settings.totalCost),
    goalies_free: settings.goaliesFree,
    cost_min_participants: settings.minParticipants,
    attendance_deadline_hours: settings.deadlineHours,
  };
}

// Патч для локального события после сохранения — чтобы карточка перерисовалась
// сразу, не дожидаясь перезапроса календаря. Формула доли здесь та же, что в
// SQL календаря; сервер пересчитает её заново на следующем чтении и останется
// источником истины — это лишь мгновенная отрисовка.
export function feeSettingsToEventPatch(settings, event) {
  const toNumber = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
  const isSplit = settings.costMode === 'split';
  const fixedFee = toNumber(settings.playerFee);
  const totalCost = toNumber(settings.totalCost);

  const base = {
    cost_mode: settings.costMode,
    fixed_fee: fixedFee,
    total_cost: totalCost,
    goalies_free: settings.goaliesFree,
    cost_min_participants: settings.minParticipants,
    attendance_deadline_hours: settings.deadlineHours,
  };

  if (!isSplit) {
    return { ...base, my_fee: fixedFee, fee_status: fixedFee === null ? 'none' : 'fixed' };
  }

  if (totalCost === null) return { ...base, my_fee: null, fee_status: 'none' };
  if (totalCost === 0) return { ...base, my_fee: 0, fee_status: 'fixed' };

  const payRole = event?.my_pay_role || 'skater';
  if (payRole === 'free' || (payRole === 'goalie' && settings.goaliesFree)) {
    return { ...base, my_fee: 0, fee_status: 'exempt' };
  }

  // Делитель — фактическое число плательщиков, без поправки на смотрящего:
  // цена показывается по факту отметок, а не «как будет, если отмечусь».
  const divisor = Number(event?.paying_count) || 0;

  if (divisor < Math.max(settings.minParticipants, 1)) {
    return { ...base, my_fee: null, fee_status: 'pending' };
  }
  return { ...base, my_fee: Math.ceil(totalCost / divisor), fee_status: 'split' };
}
