import React, { useState } from 'react';
import { TournamentCardGame } from './TournamentCardGame';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { MatchStats } from '../EventDetails/Match/MatchStats';
import { MatchProtocol } from '../EventDetails/Match/MatchProtocol';

const TABS = [
  { value: 'stats',    label: 'Статистика' },
  { value: 'protocol', label: 'Ход матча' },
];

export const TournamentGamePanel = ({ data, openRightPanel }) => {
  const [activeTab, setActiveTab] = useState('stats');

  const { game, myTeamId, hasTeamColor, activeBrandColor } = data;

  // Адаптируем поля game → формат event, который ожидают MatchStats и MatchProtocol
  const event = {
    event_id:      game.id,
    status:        game.status,
    home_team_id:  game.home_team_id,
    away_team_id:  game.away_team_id,
    my_team_id:    myTeamId,
    my_team_name:  game.home_team_id === myTeamId ? game.home_team_name : game.away_team_name,
    opponent_name: game.home_team_id === myTeamId ? game.away_team_name : game.home_team_name,
    my_team_logo_url:  game.home_team_id === myTeamId ? game.home_team_logo : game.away_team_logo,
    opponent_logo_url: game.home_team_id === myTeamId ? game.away_team_logo : game.home_team_logo,
    team_color:    activeBrandColor,
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto scrollbar-hide px-4 pb-10">

        {/* Карточка матча */}
        <div className="pt-3 pb-4">
          <TournamentCardGame game={game} />
        </div>

        {/* Сегментный переключатель */}
        <SegmentedControl
          options={TABS}
          value={activeTab}
          onChange={setActiveTab}
          activeColor={hasTeamColor ? activeBrandColor : undefined}
        />

        {/* Контент вкладок */}
        <div className="mt-4">
          {activeTab === 'stats'    && <MatchStats    event={event} openRightPanel={openRightPanel} />}
          {activeTab === 'protocol' && <MatchProtocol event={event} openRightPanel={openRightPanel} />}
        </div>

      </div>
    </div>
  );
};