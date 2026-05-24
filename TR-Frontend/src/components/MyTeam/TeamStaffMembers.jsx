import React, { useMemo } from 'react';
import { ContainerContent } from '../../ui/ContainerContent';
import { Table } from '../../ui/Table';
import { Avatar } from '../../ui/Avatar';

// Импортируем наш новый унифицированный компонент производительности
import { FadeIn } from '../../ui/FadeIn';

export const TeamStaffMembers = ({ staff = [], onPersonClick, activeColor }) => {
  const roleDict = {
    'team_manager': 'Руководитель',
    'team_admin': 'Администратор',
    'coach': 'Тренер',
    'head_coach': 'Гл. тренер'
  };

  const staffColumns = useMemo(() => [
    {
      key: 'photo',
      title: 'Фото',
      width: '64px',
      align: 'center',
      render: (person) => (
        <Avatar 
          photoUrl={person.photo_url || person.avatar_url}
          firstName={person.first_name}
          lastName={person.last_name}
          className="w-11 h-11 rounded-xl bg-surface-level2 border border-surface-level2 shadow-sm mx-auto pointer-events-none"
        />
      )
    },
    {
      key: 'name',
      title: 'Имя',
      width: 'auto',
      render: (person) => (
        <div className="flex flex-col pointer-events-none">
          <span className="font-bold text-content-main leading-tight">{person.last_name}</span>
          <span className="text-[12px] text-content-muted mt-0.5">{person.first_name}</span>
        </div>
      )
    },
    {
      key: 'roles',
      title: 'Роль',
      width: '140px',
      align: 'right',
      render: (person) => {
        if (!person.roles) return null;
        const rolesArray = person.roles.split(',').map(r => r.trim());
        return (
          <div className="flex flex-col gap-1 items-end justify-center pointer-events-none">
            {rolesArray.map((r, i) => (
              // ИСПРАВЛЕНО: Текст роли руководства перенимает HEX-оттенок бренда
              <span 
                key={i} 
                style={activeColor ? { color: activeColor } : {}}
                className="text-[10px] font-black text-brand uppercase tracking-widest text-right"
              >
                {roleDict[r] || r}
              </span>
            ))}
          </div>
        );
      }
    }
  ], [activeColor]);

  return (
    <FadeIn>
      <ContainerContent title="Руководство и тренеры" count={staff.length}>
        <Table 
          columns={staffColumns} 
          data={staff} 
          rowKey="member_id" 
          onRowClick={onPersonClick}
        />
      </ContainerContent>
    </FadeIn>
  );
};