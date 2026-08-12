import React, { useState, useEffect } from 'react';
import { BottomSheet } from '../../ui/BottomSheet';
import { PhoneInputLP } from '../../ui/Input-LP';
import { ButtonLP } from '../../ui/Button-LP';
import { Avatar } from '../../ui/Avatar';
import { getAuthHeaders } from '../../utils/helpers';

// «Поделиться упражнением»: находим тренера по номеру телефона и отдаём ему копию.
//
// Телефон здесь — уникальный логин в системе, поэтому совпадение всегда одно и никакого
// списка результатов не нужно. Поиск ограничен тренерами: подарить упражнение игроку
// смысла нет, а отдавать поиск по всей базе пользователей ради этого — тем более.
//
// Подтверждения получателя не спрашиваем: у него сразу появляется независимая копия,
// которую он правит, переименовывает и удаляет как свою.

const API = import.meta.env.VITE_API_URL || '';

export function ShareDrillSheet({ drill, isOpen, onClose, onShared, onNotify }) {
  const [phone, setPhone] = useState('');
  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState(false);
  const [coach, setCoach] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setPhone('');
    setCoach(null);
    setError('');
  }, [isOpen, drill?.id]);

  const digits = phone.replace(/\D/g, '');

  const handleSearch = async () => {
    setSearching(true);
    setError('');
    setCoach(null);
    try {
      const res = await fetch(`${API}/api/drills/coaches/search?phone=${digits}`, { headers: getAuthHeaders() });
      const json = await res.json();

      if (!json.success) {
        setError(json.message || json.error || 'Тренер не найден');
        return;
      }
      setCoach(json.coach);
    } catch {
      setError('Не удалось выполнить поиск');
    } finally {
      setSearching(false);
    }
  };

  const handleShare = async () => {
    setSending(true);
    try {
      const res = await fetch(`${API}/api/drills/${drill.id}/share`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: coach.id }),
      });
      const json = await res.json();

      if (!json.success) {
        onNotify?.(json.error || 'Не удалось отправить упражнение', 'danger');
        return;
      }

      onNotify?.(`Упражнение отправлено: ${coach.last_name} ${coach.first_name}`);
      onShared?.();
      onClose();
    } catch {
      onNotify?.('Не удалось отправить упражнение', 'danger');
    } finally {
      setSending(false);
    }
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose}>
      <div className="flex flex-col gap-5 py-2">
        <div className="flex flex-col gap-1">
          <h3 className="text-[18px] font-black text-content-main">Поделиться упражнением</h3>
          <p className="text-[13px] text-content-muted leading-snug">
            {drill?.name}. У тренера появится своя копия — он сможет её редактировать
            и переименовывать, на ваш оригинал это не повлияет.
          </p>
        </div>

        <PhoneInputLP
          label="Телефон тренера"
          value={phone}
          onChange={(v) => { setPhone(v); setCoach(null); setError(''); }}
          error={error}
        />

        {coach && (
          <div className="flex items-center gap-3 p-3 rounded-2xl bg-surface-level2">
            <Avatar
              photoUrl={coach.avatar_url}
              firstName={coach.first_name}
              lastName={coach.last_name}
              className="w-11 h-11 rounded-xl"
            />
            <div className="flex flex-col min-w-0">
              <span className="text-[14px] font-bold text-content-main truncate">{coach.last_name}</span>
              <span className="text-[14px] text-content-muted truncate">{coach.first_name}</span>
            </div>
          </div>
        )}

        {coach ? (
          <ButtonLP onClick={handleShare} isLoading={sending} disabled={sending}>
            Отправить упражнение
          </ButtonLP>
        ) : (
          <ButtonLP onClick={handleSearch} isLoading={searching} disabled={digits.length < 10 || searching}>
            Найти тренера
          </ButtonLP>
        )}
      </div>
    </BottomSheet>
  );
}
