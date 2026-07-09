import React, { useState, useEffect, useCallback } from 'react';
import { useFocusRevalidate } from '../hooks/useFocusRevalidate';
import { usePushSubscription } from '../hooks/usePushSubscription';
import { getAuthHeaders, getImageUrl } from '../utils/helpers';
import { SegmentedControl } from '../ui/SegmentedControl';
import { FadeIn, StaggerContainer } from '../ui/FadeIn';
import { Icon } from '../ui/Icon';
import Toggle from '../ui/Toggle';
import clsx from 'clsx';

// Кастомный матовый блок настроек, полностью повторяющий визуальный почерк блоков ProfilePage
const SettingsBlock = ({ title, icon, children }) => {
  return (
    <div className="flex flex-col p-4 bg-surface-level1 border border-surface-border rounded-2xl shadow-md mb-3 text-left relative overflow-hidden transition-colors duration-300">
      <div className="flex items-center justify-between mb-2 border-b border-surface-border pb-1.5">
        <div className="flex items-center gap-2">
          {icon && <Icon name={icon} className="w-3.5 h-3.5 text-brand" />}
          <span className="text-[10px] font-black uppercase text-content-main tracking-widest">
            {title}
          </span>
        </div>
      </div>
      <div className="flex flex-col text-left pt-1">{children}</div>
    </div>
  );
};

export function SettingsPage() {
  // Навигационное состояние верхнего сегментного переключателя
  const [activeSubTab, setActiveSubTab] = useState('appearance');

  // Инициализируем стейт из localStorage (по умолчанию true, если не выставлено 'false')
  const [useTeamColors, setUseTeamColors] = useState(() => {
    return localStorage.getItem('tr_use_team_colors') !== 'false';
  });

  // Инициализируем стейт темной темы напрямую из хранилища смартфона
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('tr_theme') === 'dark';
  });

  const handleToggleColors = (checked) => {
    setUseTeamColors(checked);
    localStorage.setItem('tr_use_team_colors', checked ? 'true' : 'false');
  };

  const handleToggleTheme = (checked) => {
    setIsDarkMode(checked);
    const targetTheme = checked ? 'dark' : 'light';
    localStorage.setItem('tr_theme', targetTheme);
    
    document.documentElement.classList.toggle('dark', checked);

    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', checked ? '#242424' : '#f3f4f6');
    }
  };

  useFocusRevalidate(() => {
    // Диспетчер автоматического обновления экрана при возврате фокуса
  });

  return (
    <FadeIn className="flex flex-col h-full overflow-hidden">
      
      {/* Верхний сегментный переключатель разделов настроек */}
      <div className="px-4 pb-3 shrink-0 shadow-lg bg-surface-base">
        <SegmentedControl 
          options={[
            { value: 'appearance', label: 'Внешний вид' },
            { value: 'notifications', label: 'Уведомления' }
          ]} 
          value={activeSubTab} 
          onChange={setActiveSubTab} 
        />
      </div>

      {/* Основная скролл-зона контента */}
      <div className="flex-1 overflow-y-auto scrollbar-hide px-3 pt-4 pb-24 space-y-3">
        
        {/* Ключ по activeSubTab перезапускает поочередную анимацию при смене вкладок */}
        <StaggerContainer key={activeSubTab}>
          
          {activeSubTab === 'appearance' ? (
            <>
              {/* БЛОК 1: НАСТРОЙКА ЦВЕТОВОЙ ПАЛИТРЫ КОМАНД */}
              <SettingsBlock title="Персонализация" icon="jersey">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="text-[18px] font-bold text-content-main">Цветовое кодирование</span>
                    <span className="text-[12px] text-content-muted pr-4 mt-0.5">
                      Элементы адаптируются под брендовыt цвета ваших команд
                    </span>
                  </div>
                  <Toggle checked={useTeamColors} onChange={handleToggleColors} />
                </div>
              </SettingsBlock>

              {/* БЛОК 2: НАСТРОЙКА ТЕМЫ ОФОРМЛЕНИЯ ПРИЛОЖЕНИЯ */}
              <SettingsBlock title="Тема интерфейса" icon="gear">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="text-[18px] font-bold text-content-main">Тёмная тема</span>
                    <span className="text-[12px] text-content-muted pr-4 mt-0.5">
                      Ночной режим для комфортной работы при слабом освещении
                    </span>
                  </div>
                  <Toggle checked={isDarkMode} onChange={handleToggleTheme} />
                </div>
              </SettingsBlock>
            </>
          ) : (
            <NotificationSettings />
          )}

        </StaggerContainer>
      </div>
    </FadeIn>
  );
}

// ── Группы уведомлений ──────────────────────────────────────────────────
const NOTIFICATION_GROUPS = [
  { key: 'schedule',    label: 'Расписание',           icon: 'calendar',   description: 'Новые события, напоминания за 24ч, изменения, отмены' },
  { key: 'attendance',  label: 'Явки',                 icon: 'user_plus',  description: 'Отметки и снятие отметок игроков на события' },
  { key: 'lines',       label: 'Составы',              icon: 'swap',       description: 'Публикация и изменение формации на матч или тренировку' },
  { key: 'tournaments', label: 'Турниры и лиги',       icon: 'trophy',     description: 'Новые матчи от лиги, протоколы' },
  { key: 'friendly',    label: 'Товарищеские матчи',   icon: 'handshake',  description: 'Вызовы, подтверждения, отклонения' },
  { key: 'team_news',   label: 'Команда',              icon: 'users',      description: 'Новые участники, уходы, дни рождения' },
  { key: 'admin',       label: 'Администрирование',    icon: 'shield_alert', description: 'Дедлайны заявок, составов, подтверждений', adminOnly: true },
];

// ── Компонент настроек push-уведомлений ─────────────────────────────────
function NotificationSettings() {
  const { isSupported, isSubscribed, isLoading: pushLoading, isToggling, permission, subscribe, unsubscribe } = usePushSubscription();

  const [teams, setTeams] = useState([]);
  const [activeTeamId, setActiveTeamId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fadeKey, setFadeKey] = useState(0);

  const fetchSettings = useCallback(async () => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${apiUrl}/api/push/settings`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.success) {
        setTeams(data.teams || []);
        if (!activeTeamId && data.teams?.length > 0) {
          setActiveTeamId(data.teams[0].team_id);
        }
      }
    } catch (err) {
      console.error('Ошибка загрузки настроек push:', err);
    } finally {
      setLoading(false);
    }
  }, [activeTeamId]);

  useEffect(() => { fetchSettings(); }, []);

  const activeTeam = teams.find(t => t.team_id === activeTeamId);

  const handleTogglePush = async () => {
    if (isSubscribed) {
      await unsubscribe();
    } else {
      const ok = await subscribe();
      if (ok) fetchSettings();
    }
  };

  const handleSelectTeam = (teamId) => {
    if (teamId === activeTeamId) return;
    setActiveTeamId(teamId);
    setFadeKey(prev => prev + 1);
  };

  const handleToggleGroup = async (key, value) => {
    if (!activeTeam || saving) return;
    setSaving(true);

    const updated = { ...activeTeam, [key]: value };
    setTeams(prev => prev.map(t => t.team_id === activeTeamId ? updated : t));

    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      await fetch(`${apiUrl}/api/push/settings`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: activeTeamId,
          enabled: updated.enabled,
          schedule: updated.schedule,
          attendance: updated.attendance,
          lines: updated.lines,
          tournaments: updated.tournaments,
          friendly: updated.friendly,
          team_news: updated.team_news,
          admin: updated.admin,
        }),
      });
    } catch (err) {
      console.error('Ошибка сохранения настроек push:', err);
      fetchSettings();
    } finally {
      setSaving(false);
    }
  };

  if (!isSupported) {
    return (
      <SettingsBlock title="Пуш-уведомления" icon="bell">
        <p className="text-[14px] text-content-muted font-medium leading-relaxed">
          Push-уведомления не поддерживаются в этом браузере. Для получения уведомлений используйте приложение, установленное на домашний экран (Android или iOS 16.4+).
        </p>
      </SettingsBlock>
    );
  }

  if (permission === 'denied') {
    return (
      <SettingsBlock title="Пуш-уведомления" icon="bell">
        <p className="text-[14px] text-content-muted font-medium leading-relaxed">
          Уведомления заблокированы в настройках браузера. Разрешите уведомления для этого сайта в настройках вашего устройства, затем вернитесь сюда.
        </p>
      </SettingsBlock>
    );
  }

  return (
    <>
      {/* Мастер-переключатель с индикатором загрузки */}
      <SettingsBlock title="Пуш-уведомления" icon="bell">
        <div className="flex items-center justify-between">
          <div className="flex flex-col flex-1 min-w-0">
            {isToggling ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full border-2 border-brand border-t-transparent animate-spin shrink-0" />
                <span className="text-[14px] font-medium text-content-muted">Подключение...</span>
              </div>
            ) : (
              <>
                <span className="text-md font-bold text-content-main">
                  {isSubscribed ? 'Уведомления включены' : 'Включить уведомления'}
                </span>
                <span className="text-[12px] text-content-muted pr-4 mt-0.5">
                  {isSubscribed ? 'Это устройство получает пуш-уведомления' : 'Разрешите получение уведомлений на этом устройстве'}
                </span>
              </>
            )}
          </div>
          <Toggle
            checked={isSubscribed}
            onChange={handleTogglePush}
            disabled={pushLoading || isToggling}
          />
        </div>
      </SettingsBlock>

      {/* Настройки по командам */}
      {isSubscribed && !loading && teams.length > 0 && (
        <>
          {/* Чипсы команд — только если команд больше одной */}
          {teams.length > 1 && (
            <div className="flex gap-2 overflow-x-auto scrollbar-hide py-4 -mx-1 px-1">
              {teams.map(t => (
                <button
                  key={t.team_id}
                  onClick={() => handleSelectTeam(t.team_id)}
                  className={clsx(
                    "flex items-center gap-2 px-3 py-2 rounded-full text-[10px] font-bold uppercase tracking-wider border shrink-0 transition-all outline-none select-none",
                    activeTeamId === t.team_id
                      ? "border-brand text-brand bg-surface-base"
                      : "border-surface-border text-content-muted bg-surface-base"
                  )}
                >
                  {t.team_logo && (
                    <img
                      src={getImageUrl(t.team_logo)}
                      alt=""
                      className="w-4 h-4 rounded-full object-contain shrink-0"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  )}
                  {t.team_name}
                </button>
              ))}
            </div>
          )}

          {/* Группы уведомлений с анимацией при смене команды */}
          {activeTeam && (
            <FadeIn key={fadeKey} duration={250}>
              <SettingsBlock
                title={teams.length === 1 ? activeTeam.team_name : 'Группы уведомлений'}
                icon="bell"
              >
                <div className="flex flex-col">
                  {/* Мастер-тумблер команды */}
                  <div className="flex items-center justify-between pt-2 border-b border-surface-border pb-6">
                    <span className="text-[18px] font-bold text-content-main">Все уведомления</span>
                    <Toggle
                      checked={activeTeam.enabled}
                      onChange={(val) => handleToggleGroup('enabled', val)}
                    />
                  </div>

                  {NOTIFICATION_GROUPS.map(group => (
                    <div
                      key={group.key}
                      className={clsx(
                        "flex items-center justify-between py-3 min-h-[80px] border-b border-surface-border last:border-b-0 transition-opacity",
                        !activeTeam.enabled && "opacity-40 pointer-events-none"
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <Icon name={group.icon} className="w-4 h-4 text-content-muted shrink-0" />
                        <div className="flex flex-col min-w-0">
                          <span className="text-[18px] font-semibold text-content-main">{group.label}</span>
                          <span className="text-[12px] text-content-muted leading-tight mt-0.5 pr-6">{group.description}</span>
                        </div>
                      </div>
                      <Toggle
                        checked={activeTeam[group.key]}
                        onChange={(val) => handleToggleGroup(group.key, val)}
                        disabled={!activeTeam.enabled}
                      />
                    </div>
                  ))}
                </div>
              </SettingsBlock>
            </FadeIn>
          )}
        </>
      )}
    </>
  );
}