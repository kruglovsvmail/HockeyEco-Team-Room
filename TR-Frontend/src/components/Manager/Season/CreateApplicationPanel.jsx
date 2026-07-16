import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../../ui/Icon';
import { PageLoader } from '../../../ui/Loader';
import { HintPopover } from '../../../ui/HintPopover';
import { getAuthHeaders, getImageUrl } from '../../../utils/helpers';

// Панель создания заявки на сезон: единственный шаг — выбор открытого дивизиона.
// Выбор НЕ создаёт запись в БД — открывается «виртуальная» шторка заявки (/application/new),
// где состав/штаб/скан собираются локально, а заявка создаётся сразу в статусе pending
// по кнопке «Отправить на проверку» (см. SeasonRosterDetails, handleSendReview).
export function CreateApplicationPanel({ data, onClose }) {
  const { teamId } = data || {};
  const navigate = useNavigate();

  const [isLoadingLeagues, setIsLoadingLeagues] = useState(true);
  const [leagues, setLeagues] = useState([]);

  useEffect(() => {
    if (!teamId) return;
    const load = async () => {
      setIsLoadingLeagues(true);
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/manager/seasons/${teamId}/available-divisions`, { headers: getAuthHeaders() });
        const json = await res.json();
        if (json.success) setLeagues(json.leagues || []);
      } catch (err) {
        console.error('Ошибка загрузки открытых дивизионов:', err);
      } finally {
        setIsLoadingLeagues(false);
      }
    };
    load();
  }, [teamId]);

  const handleSelectDivision = (division, league) => {
    onClose();
    navigate('/application/new', {
      state: {
        draftDivision: {
          ...division,
          league_name: league.league_name,
          league_short_name: league.league_short_name,
          league_logo: league.league_logo,
          season_name: league.season_name,
        }
      }
    });
  };

  return (
    <div className="flex flex-col h-full bg-surface-level2 text-left overflow-hidden">
      <div className="flex-1 overflow-y-auto scrollbar-hide p-4 flex flex-col gap-5">
        {isLoadingLeagues ? (
          <div className="py-12"><PageLoader /></div>
        ) : leagues.length === 0 ? (
          <div className="text-center py-12 text-[14px] font-bold text-content-muted opacity-60">
            Сейчас нет лиг с открытым окном приёма заявок
          </div>
        ) : (
          leagues.map((league) => (
            <div key={`${league.league_id}-${league.season_id}`} className="flex flex-col gap-2">
              <div className="flex items-center gap-2 px-1">
                {league.league_logo && (
                  <img src={getImageUrl(league.league_logo)} alt="" className="w-6 h-6 rounded object-contain shrink-0" />
                )}
                <div className="flex flex-col min-w-0">
                  {league.league_short_name ? (
                    <HintPopover customContent={<div className="text-[14px] font-bold text-content-main text-center">{league.league_name}</div>} className="min-w-0 max-w-full">
                      <span className="text-[14px] font-black text-content-main truncate block underline decoration-dotted decoration-content-subtle underline-offset-4">{league.league_short_name}</span>
                    </HintPopover>
                  ) : (
                    <span className="text-[14px] font-black text-content-main truncate">{league.league_name}</span>
                  )}
                  <span className="text-[10px] font-bold text-content-muted uppercase tracking-wider truncate">{league.season_name}</span>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                {(league.divisions || []).map(division => (
                  <button
                    key={division.id}
                    type="button"
                    onClick={() => handleSelectDivision(division, league)}
                    className="w-full p-4 bg-surface-level1 border border-surface-border rounded-2xl text-left flex items-center justify-between outline-none cursor-pointer hover:border-brand/30 transition-all active:scale-[0.99]"
                  >
                    <span className="text-[14px] font-bold text-content-main truncate pr-2">{division.name}</span>
                    <Icon name="chevron_right" className="w-4 h-4 text-content-subtle shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
