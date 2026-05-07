import React, { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { getToken, removeToken, getAuthHeaders } from './utils/helpers';

export function TeamLayout() {
  const [user, setUser] = useState(null);
  const [teams, setTeams] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchMe = async () => {
      const token = getToken();
      if (!token) {
        return navigate('/login');
      }

      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/me`, {
          headers: getAuthHeaders()
        });
        
        if (!res.ok) throw new Error('Not authorized');
        
        const data = await res.json();
        setUser(data.user);
        setTeams(data.user.teams || []);
        
        // Восстанавливаем выбранную команду из памяти или берем первую
        const savedTeamId = localStorage.getItem('teampwa_selected_team');
        let currentTeam = data.user.teams.find(t => t.id == savedTeamId);
        
        if (!currentTeam && data.user.teams.length > 0) {
          currentTeam = data.user.teams[0];
        }
        
        setSelectedTeam(currentTeam);
      } catch (err) {
        removeToken();
        navigate('/login');
      } finally {
        setIsLoading(false);
      }
    };

    fetchMe();
  }, [navigate]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <div className="text-brand font-medium animate-pulse tracking-widest uppercase text-sm">
          Загрузка...
        </div>
      </div>
    );
  }

  return (
    // Пустой контейнер для внутреннего контента
    <main className="flex-1 p-2 flex flex-col">
      <Outlet context={{ user, teams, selectedTeam }} />
    </main>
  );
}