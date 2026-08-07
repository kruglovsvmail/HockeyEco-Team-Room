import React, { useState, useEffect } from 'react';
import { getAuthHeaders, uiFixed } from '../../utils/helpers';
import { Avatar } from '../../ui/Avatar';
import { PageLoader } from '../../ui/Loader';

// Кольцевая диаграмма процента посещений — тот же вид, что и в статистике команды.
const AttendanceRing = ({ percent, size = 68, strokeWidth = 8 }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const safePercent = Math.max(0, Math.min(100, percent ?? 0));
  const dash = (safePercent / 100) * circumference;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--color-content-subtle)" strokeWidth={strokeWidth} opacity={0.3} />
        {percent != null && percent > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--color-brand)"
            strokeWidth={strokeWidth}
            strokeDasharray={`${dash} ${circumference - dash}`}
            strokeLinecap="round"
          />
        )}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[14px] font-black text-content-main tabular-nums">
          {percent != null ? `${percent}%` : '—'}
        </span>
      </div>
    </div>
  );
};

const AttendanceCard = ({ title, total, attended, percent }) => (
  <div className="bg-surface-level1 rounded-2xl p-4 shadow-md flex flex-col gap-3">
    <div className="flex items-center justify-between gap-2 pb-3 border-b border-surface-border">
      <span className="text-[10px] font-bold uppercase tracking-widest text-content-subtle">{title}</span>
    </div>
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-col gap-2">
        <div className="text-[14px] font-bold text-content-main">
          Всего: <span className="text-content-muted font-black">{total}</span>
        </div>
        <div className="text-[14px] font-bold text-content-main">
          Посетил: <span className="text-content-muted font-black">{attended}</span>
        </div>
      </div>
      <AttendanceRing percent={percent} />
    </div>
  </div>
);

// Статистика человека в клубе. Матчей здесь нет и быть не может — играют составы,
// а клуб проводит только общие тренировки и собрания. Обе цифры считаются
// от даты вступления в клуб: события до неё в знаменатель не попадают.
export function ClubStatsPanel({ data }) {
  const { clubId, userId, activeBrandColor, hasClubColor } = data || {};

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (!clubId || !userId) return;
    setLoading(true);
    fetch(`${import.meta.env.VITE_API_URL}/api/clubs/${clubId}/members/${userId}/club-stats`, {
      headers: getAuthHeaders()
    })
      .then(r => r.json())
      .then(json => { if (json.success) setStats(json); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [clubId, userId]);

  if (loading) return <PageLoader />;

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-full text-content-subtle text-[12px] font-bold uppercase tracking-widest px-6 text-center">
        Не удалось загрузить статистику
      </div>
    );
  }

  const { info, training, meeting } = stats;
  const hasAnyData = training.total > 0 || meeting.total > 0;

  return (
    <div
      className="flex flex-col h-full overflow-y-auto scrollbar-hide p-4 gap-3"
      style={hasClubColor ? { '--color-brand': activeBrandColor } : undefined}
    >
      {/* Шапка человека — тот же вид, что и в статистике команды */}
      <div className="flex items-center gap-4 p-4 bg-surface-level1 border border-surface-border rounded-2xl shadow-sm">
        <div
          className="rounded-3xl bg-surface-base border border-surface-border p-0.5 shadow-sm flex items-center justify-center overflow-hidden shrink-0"
          style={{ width: uiFixed(80), height: uiFixed(80) }}
        >
          <Avatar photoUrl={info.avatar_url} firstName={info.first_name} lastName={info.last_name} className="w-full h-full rounded-3xl" />
        </div>
        <div className="flex flex-col text-left flex-1 min-w-0">
          <h2 className="font-bold text-content-main uppercase whitespace-nowrap leading-tight" style={{ fontSize: uiFixed(16) }}>{info.last_name}</h2>
          <h3 className="text-[12px] font-bold text-content-muted mt-0.5 capitalize">{info.first_name}</h3>
          {info.middle_name && <h4 className="text-[12px] font-medium text-content-muted truncate opacity-60">{info.middle_name}</h4>}
        </div>
      </div>

      {hasAnyData ? (
        <>
          <AttendanceCard title="Клубные тренировки" total={training.total} attended={training.attended} percent={training.percent} />
          <AttendanceCard title="Клубные собрания" total={meeting.total} attended={meeting.attended} percent={meeting.percent} />
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center text-content-subtle text-[12px] font-bold uppercase tracking-widest px-6 text-center">
          Пока нет ни одного прошедшего клубного события
        </div>
      )}
    </div>
  );
}
