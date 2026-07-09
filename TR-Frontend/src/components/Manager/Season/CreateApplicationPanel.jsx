import React, { useState, useEffect, useMemo } from 'react';
import { TextInputLP } from '../../../ui/Input-LP';
import { ButtonLP } from '../../../ui/Button-LP';
import { CheckboxLP } from '../../../ui/Checkbox-LP';
import { FileUploaderLP } from '../../../ui/FileUploaderLP';
import { Icon } from '../../../ui/Icon';
import { PageLoader } from '../../../ui/Loader';
import { getAuthHeaders, getImageUrl } from '../../../utils/helpers';
import { POSITION_LABELS_SHORT } from './seasonUtils';

export function CreateApplicationPanel({ data, onClose }) {
  const { teamId, loadData, activeBrandColor } = data || {};

  const [isLoadingLeagues, setIsLoadingLeagues] = useState(true);
  const [leagues, setLeagues] = useState([]);
  const [selectedDivision, setSelectedDivision] = useState(null);

  const [roster, setRoster] = useState([]);
  const [isLoadingRoster, setIsLoadingRoster] = useState(false);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState(new Set());
  const [playerSearch, setPlayerSearch] = useState('');

  const [paperFile, setPaperFile] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

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

  useEffect(() => {
    if (!selectedDivision || !selectedDivision.digital_applications_only) return;
    const loadRoster = async () => {
      setIsLoadingRoster(true);
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/teams/${teamId}/details`, { headers: getAuthHeaders() });
        const json = await res.json();
        setRoster(json.roster || []);
      } catch (err) {
        console.error('Ошибка загрузки состава команды:', err);
      } finally {
        setIsLoadingRoster(false);
      }
    };
    loadRoster();
  }, [selectedDivision, teamId]);

  const togglePlayer = (userId) => {
    setSelectedPlayerIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return next;
    });
  };

  const filteredRoster = useMemo(() => {
    const q = playerSearch.trim().toLowerCase();
    if (!q) return roster;
    return roster.filter(p => `${p.last_name} ${p.first_name}`.toLowerCase().includes(q));
  }, [roster, playerSearch]);

  const isPaperFirst = !!(selectedDivision && !selectedDivision.digital_applications_only);
  const canSubmit = !!selectedDivision && (!isPaperFirst || !!paperFile);

  const handleSubmit = async () => {
    if (!canSubmit || isSaving) return;
    setIsSaving(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('divisionId', selectedDivision.id);
      if (isPaperFirst) {
        formData.append('file', paperFile);
      } else {
        formData.append('playerIds', JSON.stringify(Array.from(selectedPlayerIds)));
      }

      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/manager/seasons/${teamId}/applications`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData
      });
      const json = await res.json();
      if (json.success) {
        if (loadData) loadData();
        onClose();
      } else {
        setError(json.error || 'Не удалось создать заявку');
      }
    } catch (err) {
      console.error('Ошибка создания заявки:', err);
      setError('Ошибка соединения с сервером');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-surface-level2 text-left overflow-hidden">
      {!selectedDivision ? (
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
                    <span className="text-[14px] font-black text-content-main truncate">{league.league_name}</span>
                    <span className="text-[10px] font-bold text-content-muted uppercase tracking-wider truncate">{league.season_name}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  {(league.divisions || []).map(division => (
                    <button
                      key={division.id}
                      type="button"
                      onClick={() => setSelectedDivision({ ...division, league_name: league.league_name, season_name: league.season_name })}
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
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-4 pt-4 pb-3 shrink-0 border-b border-surface-border">
            <button
              type="button"
              onClick={() => setSelectedDivision(null)}
              className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-content-muted hover:text-brand transition-colors outline-none cursor-pointer mb-3"
            >
              <Icon name="chevron_left" className="w-3.5 h-3.5" />
              Выбрать другой дивизион
            </button>
            <span className="text-[18px] font-black text-content-main block">{selectedDivision.name}</span>
            <span className="text-[10px] font-bold text-content-muted uppercase tracking-wider">{selectedDivision.league_name} · {selectedDivision.season_name}</span>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-hide px-4 pt-4 pb-24 flex flex-col gap-4">
            {isPaperFirst ? (
              <div className="flex flex-col gap-3">
                <div className="p-4 bg-surface-level1 border border-surface-border rounded-2xl text-[14px] font-medium text-content-muted leading-relaxed">
                  Этот дивизион требует скан заявочного листа. Загрузите скан заполненного заявочного листа — после проверки лигой вы сможете добавить состав в электронном виде.
                </div>
                <FileUploaderLP
                  label="Скан заявочного листа"
                  currentFileUrl={null}
                  onChange={setPaperFile}
                  onDelete={() => setPaperFile(null)}
                />
              </div>
            ) : (
              <>
                <TextInputLP
                  label="Поиск игрока"
                  placeholder="Фамилия или имя..."
                  value={playerSearch}
                  onChange={setPlayerSearch}
                  activeColor={activeBrandColor}
                />
                {isLoadingRoster ? (
                  <div className="py-12"><PageLoader /></div>
                ) : filteredRoster.length === 0 ? (
                  <div className="text-center py-8 text-[14px] font-bold text-content-muted opacity-60">
                    В составе команды нет активных игроков
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {filteredRoster.map(player => (
                      <div
                        key={player.user_id}
                        onClick={() => togglePlayer(player.user_id)}
                        className="w-full py-3 px-4 border border-surface-border rounded-xl flex items-center justify-between bg-surface-level1 cursor-pointer select-none active:scale-[0.995] transition-all"
                      >
                        <div className="flex flex-col min-w-0 pr-2 text-left">
                          <span className="text-[14px] font-bold text-content-main truncate">{player.last_name} {player.first_name}</span>
                          <span className="text-[10px] text-content-muted uppercase font-bold tracking-wider mt-0.5">
                            {[POSITION_LABELS_SHORT[player.position], player.jersey_number ? `№${player.jersey_number}` : null].filter(Boolean).join(' · ') || '—'}
                          </span>
                        </div>
                        <CheckboxLP checked={selectedPlayerIds.has(player.user_id)} onChange={() => togglePlayer(player.user_id)} activeColor={activeBrandColor} />
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {error && (
              <div className="text-[14px] font-medium text-danger">{error}</div>
            )}
          </div>

          <div className="p-4 border-t border-surface-border shrink-0 bg-surface-level2">
            <ButtonLP onClick={handleSubmit} isLoading={isSaving} disabled={!canSubmit || isSaving} activeColor={activeBrandColor}>
              {isPaperFirst ? 'Отправить скан' : 'Создать заявку'}
            </ButtonLP>
          </div>
        </div>
      )}
    </div>
  );
}
