import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { getImageUrl, getAuthHeaders, getContrastTextColor } from '../../../utils/helpers';
import { BottomSheet } from '../../../ui/BottomSheet';
import { ButtonLP } from '../../../ui/Button-LP';
import { SectionHeader } from '../../../ui/SectionHeader';
import { useAccess } from '../../../hooks/useAccess';
import { ROLES, PERMISSIONS, DEADLINES } from '../../../utils/permissions';
import { Avatar } from '../../../ui/Avatar';
import { Icon } from '../../../ui/Icon';
import { CheckboxLP } from '../../../ui/Checkbox-LP';
import { ContainerContent } from '../../../ui/ContainerContent';
import { Toast } from '../../../ui/Toast';
import { HintPopover } from '../../../ui/HintPopover';
import clsx from 'clsx';
import { PageLoader } from '../../../ui/Loader';
import { FadeIn } from '../../../ui/FadeIn';
import { toBlob } from 'html-to-image';
import { MatchLinesShareCard } from './MatchLinesShareCard';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import 'dayjs/locale/ru';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale('ru');

const getSafeUserFromToken = () => {
  try {
    const auth = getAuthHeaders().Authorization;
    if (!auth) return null;
    const token = auth.replace('Bearer ', '');
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
};

const sanitizePosition = (pos) => {
  const upperPos = String(pos).toUpperCase();
  const map = {
    'ЛН': 'LW', 'ЦН': 'C', 'ПН': 'RW',
    'ЛЗ': 'LD', 'ПЗ': 'RD', 'ВР': 'G',
    'НАП': 'LW', 'ЗАЩ': 'LD',
    'Ц': 'C', 'Л': 'LW', 'П': 'RW', 'В': 'G',
    'ОСН': 'G', 'ЗАП': 'G', 'РЕЗ': 'G'
  };
  const sanitized = map[upperPos] || upperPos;
  const validKeys = ['LW', 'C', 'RW', 'LD', 'RD', 'G'];
  return validKeys.includes(sanitized) ? sanitized : 'LW';
};

export const MatchLines = ({ event, initialAttendees = [], initialDraftLines = [], initialIsPublished = false, initialStaffMembers = [], refreshData }) => {
  const [attendees, setAttendees] = useState(initialAttendees);
  const [draftLines, setDraftLines] = useState(initialDraftLines);
  const [isPublished, setIsPublished] = useState(initialIsPublished);
  const [staffMembers, setStaffMembers] = useState(initialStaffMembers);
  
  const [isEditMode, setIsEditMode] = useState(false);
  const [isDeleteMode, setIsDeleteMode] = useState(false); 
  const [isPublishing, setIsPublishing] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [isSubmittingRoster, setIsSubmittingRoster] = useState(false);
  const [timeToMatch, setTimeToMatch] = useState(999);
  
  // Состояние кастомного тост-уведомления
  const [toast, setToast] = useState({ isOpen: false, message: '', type: 'success' });

  const [currentSlide, setCurrentSlide] = useState(0);
  const [activeSelection, setActiveSelection] = useState(null);
  const [userInteracted, setUserInteracted] = useState(false);
  const [removingSlot, setRemovingSlot] = useState(null);

  const [isRosterSheetOpen, setIsRosterSheetOpen] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [editJersey, setEditJersey] = useState('');
  const [editCaptain, setEditCaptain] = useState(false);
  const [editAssistant, setEditAssistant] = useState(false);
  const [sheetError, setSheetError] = useState('');
  const [isSheetSaving, setIsSheetSaving] = useState(false);

  // 1. АВТОНОМНОЕ И СТРОГО ЛИНЕЙНОЕ ЧТЕНИЕ КЭША ДЛЯ ИСКЛЮЧЕНИЯ ИНФРАСТРУКТУРНЫХ ОШИБОК ИНИЦИАЛИЗАЦИИ
  const localUser = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('teampwa_user') || localStorage.getItem('teampwa_cached_user'));
    } catch { return null; }
  }, []);

  const localTeam = useMemo(() => {
    try {
      if (!localUser || !event?.my_team_id) return null;
      return localUser.teams?.find(t => String(t.id) === String(event.my_team_id));
    } catch { return null; }
  }, [localUser, event?.my_team_id]);

  // 2. БЕЗОПАСНЫЙ ВЫЗОВ ХУКА ПРАВ НА ОСНОВЕ ЧИСТЫХ ОФЛАЙН-КОНТЕКСТОВ ПРИЛОЖЕНИЯ
  const { user, checkAccess, selectedTeam } = useAccess(localUser, localTeam);

  // Вычисляем гранулярные права допуска In-Memory матрицы по подписке для этой команды матча
  const hasLinesManageAccess = checkAccess('MATCH_LINES_MANAGE', event?.my_team_id);
  const hasRosterSubmitAccess = checkAccess('MATCH_ROSTER_SUBMIT', event?.my_team_id);
  const hasPlayerParamsAccess = checkAccess('MATCH_LINES_EDIT_PLAYER_PARAMS', event?.my_team_id);
  const hasShareAccess = checkAccess('MATCH_LINES_SHARE', event?.my_team_id);

  const carouselRef = useRef(null);
  const shareCardRef = useRef(null);
  const chipsScrollRef = useRef(null);
  const pressTimer = useRef(null);
  const longPressFired = useRef(false);

  const tokenUser = useMemo(() => getSafeUserFromToken(), []);
  const activeUserId = user?.id || tokenUser?.id || tokenUser?.userId;
  const activeGlobalRole = useMemo(() => {
    return String(user?.global_role || user?.globalRole || tokenUser?.global_role || tokenUser?.globalRole || '').toLowerCase();
  }, [user, tokenUser]);

  // Динамическое определение флага включения цветов из localStorage (по дефолту true)
  const isColorsEnabled = localStorage.getItem('tr_use_team_colors') !== 'false';
  const hasTeamColor = isColorsEnabled && !!event?.team_color;
  const activeBrandColor = hasTeamColor ? event.team_color : 'var(--color-brand)';
  const contrastBadgeText = getContrastTextColor(hasTeamColor ? event.team_color : null) === 'text-white' ? '#ffffff' : '#111827';

  // ── Данные шапки для картинки-карточки составов ──────────────────────────
  const shareHeader = useMemo(() => {
    const isMyTeamHome = event?.my_team_id === event?.home_team_id;
    const homeJersey   = event?.home_jersey_type || event?.home_jersey || 'light';
    const awayJersey   = event?.away_jersey_type || event?.away_jersey || 'dark';
    const myJerseyType = isMyTeamHome ? homeJersey : awayJersey;

    const arenaTz = event?.arena_timezone || 'UTC';
    const target  = event?.event_date || event?.game_date;
    const dObj    = target ? dayjs.utc(target).tz(arenaTz) : null;
    const daysMap = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ'];

    return {
      opponentName: event?.opponent_name || '',
      arenaDisplay: event?.arena_name || '',
      timeDisplay:  dObj ? dObj.format('HH:mm') : '',
      dateDisplay:  dObj ? `${dObj.format('D MMMM')}, ${daysMap[dObj.day()]}` : '',
      jerseyLabel:  myJerseyType === 'dark' ? 'Тёмные' : 'Светлые',
    };
  }, [event]);

  // Высокопроизводительная синхронизация с централизованным реактивным хранилищем родительского контейнера матча
  useEffect(() => { setAttendees(initialAttendees); }, [initialAttendees]);
  useEffect(() => { setIsPublished(initialIsPublished); }, [initialIsPublished]);
  useEffect(() => { setStaffMembers(initialStaffMembers); }, [initialStaffMembers]);
  
  // Обновляем формации из пропсов только тогда, когда тренер не находится в режиме ручного редактирования
  useEffect(() => {
    if (!isEditMode) {
      setDraftLines(initialDraftLines);
    }
  }, [initialDraftLines, isEditMode]);

  const userRoles = useMemo(() => {
    const rolesSet = new Set();
    
    if (activeGlobalRole) {
      rolesSet.add(activeGlobalRole);
    }
    
    if (selectedTeam?.user_role) {
      selectedTeam.user_role.split(',').forEach(r => rolesSet.add(r.trim().toLowerCase()));
    }
    
    if (staffMembers.length > 0 && activeUserId) {
      const myStaff = staffMembers.find(s => String(s.user_id) === String(activeUserId));
      if (myStaff && myStaff.roles) {
        myStaff.roles.split(',').forEach(r => rolesSet.add(r.trim().toLowerCase()));
      }
    }
    
    return Array.from(rolesSet);
  }, [activeGlobalRole, selectedTeam?.user_role, staffMembers, activeUserId]);

  const hasAdminAccess = useMemo(() => {
    if (userRoles.includes('admin')) return true;
    const rawRoles = PERMISSIONS.MATCH_ROSTER_SUBMIT?.allowedRoles || (Array.isArray(PERMISSIONS.MATCH_ROSTER_SUBMIT) ? PERMISSIONS.MATCH_ROSTER_SUBMIT : []);
    const allowedAdminRoles = rawRoles.map(r => String(r).toLowerCase());
    return userRoles.some(role => allowedAdminRoles.includes(role));
  }, [userRoles]);

  const hasCoachAccess = useMemo(() => {
    if (userRoles.includes('admin')) return true;
    const rawRoles = PERMISSIONS.MATCH_LINES_MANAGE?.allowedRoles || (Array.isArray(PERMISSIONS.MATCH_LINES_MANAGE) ? PERMISSIONS.MATCH_LINES_MANAGE : []);
    const allowedCoachRoles = rawRoles.map(r => String(r).toLowerCase());
    return userRoles.some(role => allowedCoachRoles.includes(role));
  }, [userRoles]);

  const hasShareRoleAccess = useMemo(() => {
    if (userRoles.includes('admin')) return true;
    const rawRoles = PERMISSIONS.MATCH_LINES_SHARE?.allowedRoles || [];
    const allowedShareRoles = rawRoles.map(r => String(r).toLowerCase());
    return userRoles.some(role => allowedShareRoles.includes(role));
  }, [userRoles]);

  const unassignedPlayers = useMemo(() => {
    return attendees.filter(a => !draftLines.some(l => String(l.player_id) === String(a.id || a.user_id)));
  }, [attendees, draftLines]);

  const { row1, row2, row3 } = useMemo(() => {
    const r1 = [];
    const r2 = [];
    const r3 = [];
    unassignedPlayers.forEach((player, idx) => {
      if (idx % 3 === 0) r1.push(player);
      else if (idx % 3 === 1) r2.push(player);
      else r3.push(player);
    });
    return { row1: r1, row2: r2, row3: r3 };
  }, [unassignedPlayers]);

  useEffect(() => {
    const targetDate = event?.event_date || event?.game_date;
    if (!targetDate) return;
    
    const checkTime = () => {
      const diff = (new Date(targetDate) - new Date()) / 1000 / 60;
      setTimeToMatch(diff);
    };
    checkTime();
    const interval = setInterval(checkTime, 30000);
    return () => clearInterval(interval);
  }, [event?.event_date, event?.game_date]);

  useEffect(() => {
    const el = chipsScrollRef.current;
    if (!el) return;
    const handleWheel = (e) => {
      if (e.deltaY !== 0) {
        e.preventDefault(); 
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [isEditMode, attendees]);

  const handlePublish = async () => {
    if (timeToMatch < DEADLINES.MIDDLE_EDIT_MINUTES) {
      return;
    }
    setIsPublishing(true);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const headers = getAuthHeaders();
      const res = await fetch(`${apiUrl}/api/matches/${event.event_id}/lines`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: event.my_team_id,
          lines: draftLines.map(l => ({ 
            player_id: l.player_id || l.id, 
            line_number: l.line_number, 
            position_in_line: sanitizePosition(l.position_in_line) 
          }))
        })
      });
      const data = await res.json();
      if (data.success) {
        setIsPublished(false);
        setIsEditMode(false);
        setIsDeleteMode(false);
        setActiveSelection(null);
        // Перегенерируем и заливаем картинку состава в S3 (не блокируя выход из редактирования)
        regenerateFormationImage();
        refreshData();
      } else {
        setToast({
          isOpen: true,
          message: data.error || 'Не удалось сохранить расстановку',
          type: 'danger',
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsPublishing(false);
    }
  };

  const handleSubmitOfficialRoster = async (e) => {
    if (timeToMatch < DEADLINES.ROSTER_SUBMIT_MINUTES) {
      return;
    }
    setIsSubmittingRoster(true);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const headers = getAuthHeaders();
      const res = await fetch(`${apiUrl}/api/matches/${event.event_id}/submit-roster`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId: event.my_team_id })
      });
      const data = await res.json();
      if (data.success) {
        setIsPublished(true);
        setToast({
          isOpen: true,
          message: 'Заявка отправлена в лигу!',
          type: 'success'
        });
        refreshData(); 
      } else {
        setToast({
          isOpen: true,
          message: data.error || 'Ошибка отправки заявки',
          type: 'danger'
        });
      }
    } catch (err) {
      console.error(err);
      setToast({
        isOpen: true,
        message: 'Ошибка отправки заявки: сервер не отвечает',
        type: 'danger'
      });
    } finally {
      setIsSubmittingRoster(false);
    }
  };

  const handleHeaderActionClick = (e) => {
    if (isEditMode) {
      setIsEditMode(false);
      setIsDeleteMode(false);
      setActiveSelection(null);
      refreshData(); 
    } else {
      if (timeToMatch <= DEADLINES.MIDDLE_EDIT_MINUTES) {
        return;
      }
      setIsEditMode(true);
    }
  };

  // Текстовый состав — фолбэк, если картинку сгенерировать/расшарить не удалось
  const buildLinesText = () => {
    const POSITION_DISPLAY = { 'LW': 'ЛН', 'C': 'ЦН', 'RW': 'ПН', 'LD': 'ЛЗ', 'RD': 'ПЗ' };
    const POSITIONS_ORDER = ['LW', 'C', 'RW', 'LD', 'RD'];
    const GOALIE_LABELS = { 5: 'ОСН', 6: 'ЗАП', 7: 'РЕЗ' };

    const textParts = [];

    for (let lineNum = 1; lineNum <= 4; lineNum++) {
      const linePlayers = draftLines.filter(l => l.line_number === lineNum);
      if (linePlayers.length === 0) continue;

      textParts.push(`ЗВЕНО #${lineNum}`);
      POSITIONS_ORDER.forEach(pos => {
        const player = linePlayers.find(l => l.position_in_line === pos);
        if (player) {
          textParts.push(`${POSITION_DISPLAY[pos]} - ${player.last_name || ''} ${player.first_name || ''}`);
        }
      });
      textParts.push('');
    }

    const goalies = draftLines.filter(l => l.position_in_line === 'G').sort((a, b) => a.line_number - b.line_number);
    if (goalies.length > 0) {
      textParts.push('ВРАТАРИ');
      goalies.forEach(g => {
        const label = GOALIE_LABELS[g.line_number] || 'ВР';
        textParts.push(`${label} - ${g.last_name || ''} ${g.first_name || ''}`);
      });
    }

    return textParts.join('\n').trim();
  };

  const shareAsText = async () => {
    const text = buildLinesText();
    if (!text) return;
    if (navigator.share) {
      try { await navigator.share({ text }); } catch { /* пользователь закрыл окно */ }
    } else {
      try {
        await navigator.clipboard.writeText(text);
        setToast({ isOpen: true, message: 'Состав скопирован в буфер обмена', type: 'success' });
      } catch {
        setToast({ isOpen: true, message: 'Не удалось скопировать', type: 'danger' });
      }
    }
  };

  // Снимок off-screen карточки в PNG-файл (pixelRatio: 3 → ретина-чёткая ~1800px)
  const buildShareFile = useCallback(async () => {
    const node = shareCardRef.current;
    if (!node) return null;
    try {
      const blob = await toBlob(node, {
        pixelRatio: 3,
        cacheBust: true,
        backgroundColor: getComputedStyle(document.documentElement)
          .getPropertyValue('--color-surface-base').trim() || '#f3f4f6',
      });
      if (!blob) return null;
      const fileName = `sostav_${event?.opponent_name || 'match'}.png`.replace(/[^\wа-яёА-ЯЁ.-]+/gi, '_');
      return { blob, file: new File([blob], fileName, { type: 'image/png' }) };
    } catch (e) {
      console.error('Не удалось подготовить картинку состава:', e);
      return null;
    }
  }, [event?.opponent_name]);

  // Готовый к шерингу файл (загружен из S3 или собран после сохранения)
  const preparedShareRef = useRef(null); // { blob, file } | null
  const [isGeneratingFormation, setIsGeneratingFormation] = useState(false);
  const [isShareReady, setIsShareReady] = useState(false); // есть ли готовый файл (для подписи кнопки)
  const formationDirtyRef = useRef(false); // картинку надо перегенерировать после прихода свежих draftLines

  // Детерминированный URL картинки состава в S3 (ключ из teamId + game_id) — без хранения в БД
  const formationImageUrl = useMemo(() => {
    if (!event?.my_team_id || !event?.event_id) return null;
    return getImageUrl(`/roster-formation/team-${event.my_team_id}-formation_game-${event.event_id}.png`);
  }, [event?.my_team_id, event?.event_id]);

  // Предзагрузка готовой картинки из S3 при открытии вкладки → чтобы по клику шерить синхронно
  // (navigator.share требует «живого» жеста, await после клика его теряет). 404 — норма (ещё не генерили).
  useEffect(() => {
    if (!(hasShareRoleAccess && hasShareAccess) || !formationImageUrl) {
      preparedShareRef.current = null;
      return;
    }
    let cancelled = false;
    setIsShareReady(false);
    (async () => {
      try {
        const resp = await fetch(formationImageUrl, { cache: 'no-store' });
        if (!resp.ok) { if (!cancelled) { preparedShareRef.current = null; setIsShareReady(false); } return; }
        const blob = await resp.blob();
        if (!blob || blob.type !== 'image/png') { if (!cancelled) { preparedShareRef.current = null; setIsShareReady(false); } return; }
        const fileName = `sostav_${event?.opponent_name || 'match'}.png`.replace(/[^\wа-яёА-ЯЁ.-]+/gi, '_');
        if (!cancelled) { preparedShareRef.current = { blob, file: new File([blob], fileName, { type: 'image/png' }) }; setIsShareReady(true); }
      } catch { if (!cancelled) { preparedShareRef.current = null; setIsShareReady(false); } }
    })();
    return () => { cancelled = true; };
  }, [formationImageUrl, hasShareRoleAccess, hasShareAccess, event?.opponent_name]);

  // Сгенерировать картинку и перезаписать в S3 — после сохранения состава/параметров или по клику «Генерация»
  const regenerateFormationImage = useCallback(async () => {
    setIsGeneratingFormation(true);
    try {
      const result = await buildShareFile();
      if (!result) return;
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const fd = new FormData();
      fd.append('teamId', event.my_team_id);
      fd.append('image', result.file, result.file.name);
      const resp = await fetch(`${apiUrl}/api/matches/${event.event_id}/lines/formation-image?teamId=${event.my_team_id}`, {
        method: 'POST',
        headers: getAuthHeaders(), // без Content-Type — boundary проставит FormData
        body: fd,
      });
      if (resp.ok) {
        preparedShareRef.current = result; // сразу готов к моментальному шерингу
        setIsShareReady(true);
      }
    } catch (e) {
      console.error('Не удалось обновить картинку состава в S3:', e);
    } finally {
      setIsGeneratingFormation(false);
    }
  }, [buildShareFile, event?.my_team_id, event?.event_id]);

  // Перегенерация после «Сохранить параметры» (номер/капитан/ассистент): ждём, пока приедет
  // свежий draftLines (через refreshData → проп → синк-эффект), и только тогда снимаем картинку.
  useEffect(() => {
    if (!formationDirtyRef.current) return;
    if (isEditMode || !(hasShareRoleAccess && hasShareAccess) || draftLines.length === 0) return;
    formationDirtyRef.current = false;
    regenerateFormationImage();
  }, [draftLines, isEditMode, hasShareRoleAccess, hasShareAccess, regenerateFormationImage]);

  // Клик «Поделиться»
  const handleShareLines = async () => {
    if (draftLines.length === 0) return;

    // Быстрый путь (моб./PWA): файл уже готов → вызываем share СИНХРОННО, сохраняя user activation
    const prepared = preparedShareRef.current;
    if (prepared && navigator.canShare && navigator.canShare({ files: [prepared.file] })) {
      navigator.share({ files: [prepared.file] }).catch(() => { /* пользователь закрыл окно */ });
      return;
    }

    // Иначе — десктоп (буфер/скачивание) или файл ещё не готов → генерим по клику
    setIsSharing(true);
    try {
      const result = prepared || await buildShareFile();
      if (!result) throw new Error('Не удалось получить картинку');
      const { blob, file } = result;

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file] }); } catch { /* закрыл окно */ }
        return;
      }

      // Десктоп без file-share — копируем картинку в буфер обмена
      if (navigator.clipboard && typeof window.ClipboardItem !== 'undefined') {
        try {
          await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]);
          setToast({ isOpen: true, message: 'Картинка состава скопирована в буфер обмена', type: 'success' });
          return;
        } catch { /* буфер недоступен — упадём на скачивание */ }
      }

      // Последний резерв — скачивание PNG
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setToast({ isOpen: true, message: 'Картинка состава сохранена', type: 'success' });
    } catch (err) {
      console.error('Не удалось сгенерировать картинку состава:', err);
      await shareAsText();
    } finally {
      setIsSharing(false);
    }
  };

  const handleCarouselScroll = (e) => {
    if (!isEditMode) return;
    const container = e.target;
    const width = container.clientWidth;
    if (width > 0) {
      const slideIndex = Math.round(container.scrollLeft / width);
      if (slideIndex !== currentSlide) {
        setCurrentSlide(slideIndex);
      }
    }
  };

  const scrollToSlide = (index) => {
    if (carouselRef.current) {
      const width = carouselRef.current.clientWidth;
      carouselRef.current.scrollTo({ left: width * index, behavior: 'smooth' });
      setCurrentSlide(index);
    }
  };

  const handleSlotClick = (lineNum, pos) => {
    if (!isEditMode) return;
    setUserInteracted(true); 
    
    const existingPlayerIndex = draftLines.findIndex(l => l.line_number === lineNum && l.position_in_line === pos);
    const existingPlayer = existingPlayerIndex !== -1 ? draftLines[existingPlayerIndex] : null;

    if (activeSelection) {
      if (activeSelection.type === 'chip') {
        const newPlayer = attendees.find(a => a.id === activeSelection.id);
        let newLines = [...draftLines];
        if (existingPlayer) newLines.splice(existingPlayerIndex, 1);
        
        newLines.push({ 
          player_id: newPlayer.id, 
          line_number: lineNum, 
          position_in_line: pos, 
          jersey_number: newPlayer.jersey_number,
          is_captain: newPlayer.is_captain,
          is_assistant: newPlayer.is_assistant,
          ...newPlayer 
        });
        setDraftLines(newLines);
        setActiveSelection(null);
      } 
      else if (activeSelection.type === 'slot') {
        if (activeSelection.line === lineNum && activeSelection.pos === pos) {
          setActiveSelection(null);
        } else {
          const sourcePlayer = draftLines.find(l => l.line_number === activeSelection.line && l.position_in_line === activeSelection.pos);
          if (!sourcePlayer && !existingPlayer) { setActiveSelection({ type: 'slot', line: lineNum, pos: pos }); return; }
          let newLines = draftLines.filter(l =>
            !(l.line_number === lineNum && l.position_in_line === pos) &&
            !(l.line_number === activeSelection.line && l.position_in_line === activeSelection.pos)
          );
          if (sourcePlayer) {
            newLines.push({ ...sourcePlayer, line_number: lineNum, position_in_line: pos });
          }
          if (existingPlayer) {
            newLines.push({ ...existingPlayer, line_number: activeSelection.line, position_in_line: activeSelection.pos });
          }
          setDraftLines(newLines);
          setActiveSelection(null);
        }
      }
    } else {
      setActiveSelection({ type: 'slot', line: lineNum, pos: pos });
    }
  };

  const handleChipClick = (playerId) => {
    if (!isEditMode) return;
    setUserInteracted(true);
    
    if (activeSelection) {
      if (activeSelection.type === 'slot') {
        const newPlayer = attendees.find(a => a.id === playerId);
        const existingPlayerIndex = draftLines.findIndex(l => l.line_number === activeSelection.line && l.position_in_line === activeSelection.pos);
        let newLines = [...draftLines];
        if (existingPlayerIndex !== -1) newLines.splice(existingPlayerIndex, 1);
        
        newLines.push({ 
          player_id: newPlayer.id, 
          line_number: activeSelection.line, 
          position_in_line: activeSelection.pos, 
          jersey_number: newPlayer.jersey_number,
          is_captain: newPlayer.is_captain,
          is_assistant: newPlayer.is_assistant,
          ...newPlayer 
        });
        setDraftLines(newLines);
        setActiveSelection(null);
      } else if (activeSelection.type === 'chip' && activeSelection.id === playerId) {
        setActiveSelection(null);
      } else {
        setActiveSelection({ type: 'chip', id: playerId });
      }
    } else {
      setActiveSelection({ type: 'chip', id: playerId });
    }
  };

  const handleDeletePlayer = (lineNum, pos, e) => {
    e.stopPropagation();
    setUserInteracted(true);
    setRemovingSlot({ line: lineNum, pos: pos });
    setTimeout(() => {
      setDraftLines(prev => {
        const newLines = prev.filter(l => !(l.line_number === lineNum && l.position_in_line === pos));
        if (newLines.length === 0) setIsDeleteMode(false);
        return newLines;
      });
      setRemovingSlot(null);
    }, 200); 
  };

  const handlePointerDown = () => {
    if (!isEditMode || isDeleteMode) return;
    longPressFired.current = false;
    pressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      setIsDeleteMode(true);
      setActiveSelection(null);
      if (window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(50);
      }
    }, 500);
  };

  const cancelPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  };

  const handleViewPlayerClick = (player, e) => {
    if (!hasAdminAccess) return;
    setSelectedPlayer(player);
    setEditJersey(player.jersey_number ?? '');
    setEditCaptain(player.is_captain || false);
    setEditAssistant(player.is_assistant || false);
    setSheetError('');
    setIsRosterSheetOpen(true);
  };

  const handleSavePlayerParams = async () => {
    setSheetError('');
    
    if (editJersey !== '') {
      const num = parseInt(editJersey, 10);
      const duplicate = draftLines.find(p => String(p.player_id) !== String(selectedPlayer.player_id) && p.jersey_number === num);
      if (duplicate) {
        setSheetError(`Номер ${num} уже занят игроком ${duplicate.last_name || duplicate.lastName || ''}`);
        return;
      }
    }

    if (editAssistant) {
      const assistantsCount = draftLines.filter(p => String(p.player_id) !== String(selectedPlayer.player_id) && p.is_assistant).length;
      if (assistantsCount >= 2) {
        setSheetError('В команде уже назначено 2 ассистента. Снимите статус с другого игрока.');
        return;
      }
    }

    setIsSheetSaving(true);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const headers = getAuthHeaders();
      const res = await fetch(`${apiUrl}/api/matches/${event.event_id}/line-player`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: event.my_team_id,
          playerId: selectedPlayer.player_id,
          jerseyNumber: editJersey === '' ? null : parseInt(editJersey, 10),
          isCaptain: editCaptain,
          isAssistant: editAssistant
        })
      });
      const data = await res.json();
      if (data.success) {
        setIsRosterSheetOpen(false);
        setIsPublished(false);
        // Параметры (номер/капитан/ассистент) изменились → пометим картинку на перегенерацию,
        // она запустится, когда приедет свежий draftLines (см. эффект formationDirtyRef)
        formationDirtyRef.current = true;
        refreshData();
      } else {
        setSheetError(data.error || 'Ошибка сохранения');
      }
    } catch (err) {
      setSheetError('Ошибка соединения с сервером');
    } finally {
      setIsSheetSaving(false);
    }
  };

  const renderSlot = (lineNum, pos, labelText = null) => {
    const player = draftLines.find(l => l.line_number === lineNum && l.position_in_line === pos);
    const isSelected = activeSelection?.type === 'slot' && activeSelection?.line === lineNum && activeSelection?.pos === pos;
    const isRemoving = removingSlot?.line === lineNum && removingSlot?.pos === pos;
    const playerImage = player?.team_photo || player?.avatar_url;

    const jiggleDelay = (lineNum + (pos === 'LW' ? 0 : pos === 'C' ? 1 : 2)) % 3;
    const jiggleClass = isDeleteMode && player && !isRemoving ? `animate-jiggle jiggle-delay-${jiggleDelay}` : '';

    const slotContent = (
      <div 
        key={`${lineNum}-${pos}`}
        onPointerDown={handlePointerDown}
        onPointerUp={cancelPress}
        onPointerLeave={cancelPress}
        onPointerCancel={cancelPress}
        onClick={(e) => {
          if (longPressFired.current) {
            longPressFired.current = false;
            e.stopPropagation();
            return;
          }
          if (isDeleteMode) {
            if (!player) setIsDeleteMode(false);
            e.stopPropagation();
            return;
          }
          if (isEditMode) {
            handleSlotClick(lineNum, pos);
          } else if (player) {
            // ЖЕСТКИЙ БЛОК: Если нет подписки или наступил временной дедлайн лиги — шторку не инициируем
            if (!hasPlayerParamsAccess || timeToMatch < DEADLINES.ROSTER_SUBMIT_MINUTES) {
              return;
            }
            handleViewPlayerClick(player, e);
          }
        }}
        className={clsx(
          "flex flex-col items-center w-[94px] relative transition-all duration-200 shrink-0",
          isEditMode ? "cursor-pointer" : (hasAdminAccess && player ? "cursor-pointer active:scale-95" : "pointer-events-none"),
          (isEditMode && !player && !isSelected && !isDeleteMode) ? "opacity-70 hover:opacity-100" : "opacity-100",
          jiggleClass
        )}
      >
        <div 
          style={isSelected ? { borderColor: activeBrandColor, boxShadow: `0 0 0 2px ${activeBrandColor}` } : {}}
          className={clsx(
            "w-16 h-16 rounded-2xl flex items-center justify-center relative transition-all duration-200 shrink-0 box-border z-0 origin-center",
            isSelected && !hasTeamColor ? "ring-2 ring-brand scale-110" : isSelected ? "scale-110 border" : "",
            player ? "shadow-lg border border-surface-border bg-surface-level3" : isSelected ? "bg-surface-base" : "bg-surface-base border border-dashed border-content-muted"
          )}
        >
          {player ? (
            <>
              <Avatar 
                photoUrl={playerImage}
                firstName={player.first_name}
                lastName={player.last_name}
                className={clsx(
                  "w-full h-full rounded-2xl origin-center",
                  isRemoving ? "animate-slot-exit" : (userInteracted ? "animate-slot-enter" : "")
                )}
                fallbackClassName="bg-surface-level3 text-brand text-[14px]"
              />
              
              {!isEditMode && (player.is_captain || player.is_assistant) && (
                <div 
                  style={{ backgroundColor: activeBrandColor, color: contrastBadgeText }}
                  className="absolute -top-1 -right-2 w-[20px] h-[20px] rounded-full shadow-sm flex items-center justify-center text-[10px] font-black z-20"
                >
                  {player.is_captain ? 'К' : 'А'}
                </div>
              )}

              {!isEditMode && player.jersey_number != null && (
                <div className="absolute -bottom-1 -right-2 w-[24px] h-[24px] bg-content-muted rounded-full shadow-sm flex items-center justify-center text-[14px] font-bold text-content-dark z-10">
                  {player.jersey_number}
                </div>
              )}

              {isDeleteMode && !isRemoving && (
                <button 
                  onClick={(e) => handleDeletePlayer(lineNum, pos, e)}
                  className="absolute -top-1.5 -right-1.5 w-[22px] h-[22px] bg-red-500 rounded-full flex items-center justify-center shadow-md z-20"
                >
                  <Icon name="close" className="w-3 h-3 text-white" strokeWidth={3.5} />
                </button>
              )}

              <div className="absolute -bottom-2 bg-surface-level2 rounded-md px-1.5 py-0.5 border border-surface-border shadow-sm z-10">
                <span className="text-[8px] font-black text-content-muted uppercase tracking-widest leading-none block">
                  {labelText || pos}
                </span>
              </div>
            </>
          ) : (
            <span className="text-[14px] font-black text-content-muted uppercase tracking-widest select-none">
              {labelText || pos}
            </span>
          )}
        </div>
        <div className="w-full mt-4 flex flex-col items-center justify-center h-6 overflow-visible">
          {player ? (
            <>
              <span className="text-[14px] font-bold text-content-main leading-none w-full text-center pointer-events-none whitespace-nowrap">
                {player.last_name}
              </span>
              <span className="text-[10px] font-medium text-content-muted leading-none w-full text-center pointer-events-none whitespace-nowrap mt-1">
                {player.first_name}
              </span>
            </>
          ) : (
            <span className="text-[10px] font-bold text-transparent leading-none select-none">_</span>
          )}
        </div>
      </div>
    );

    // ДЕКЛАРАТИВНАЯ ОЧЕРЕДЬ КЛИЕНТСКИХ ОГРАНИЧЕНИЙ: Подписка в приоритете, затем временной дедлайн
    if (!isEditMode && player && hasAdminAccess) {
      if (!hasPlayerParamsAccess) {
        return (
          <HintPopover status="no_subscription" key={`${lineNum}-${pos}`}>
            {slotContent}
          </HintPopover>
        );
      }
      if (timeToMatch < DEADLINES.ROSTER_SUBMIT_MINUTES) {
        return (
          <HintPopover status="deadline_player_params" key={`${lineNum}-${pos}`}>
            {slotContent}
          </HintPopover>
        );
      }
    }
    return slotContent;
  };

  const renderLineBlock = (lineNum) => (
    <div key={`line-${lineNum}`} className="w-full flex flex-col items-center pb-1 mt-2 ">
      <div className="flex justify-center gap-4 w-full mb-6">
        {renderSlot(lineNum, 'LW', 'ЛН')}
        {renderSlot(lineNum, 'C', 'ЦН')}
        {renderSlot(lineNum, 'RW', 'ПН')}
      </div>
      <div className="flex justify-center gap-8 w-full">
        {renderSlot(lineNum, 'LD', 'ЛЗ')}
        {renderSlot(lineNum, 'RD', 'ПЗ')}
      </div>
    </div>
  );

  const renderGoaliesBlock = () => (
    <div className="w-full flex flex-col items-center pb-6 mt-2">
       <div className="flex justify-center gap-4 w-full">
          {renderSlot(5, 'G', 'Осн')}
          {renderSlot(6, 'G', 'Зап')}
          {renderSlot(7, 'G', 'Рез')}
       </div>
    </div>
  );

  const renderChipButton = (p) => {
    const isSelected = activeSelection?.type === 'chip' && activeSelection?.id === p.id;
    const contrastChipText = getContrastTextColor(hasTeamColor ? event.team_color : null) === 'text-white' ? 'text-white' : 'text-content-dark';

    return (
      <button
        key={p.id}
        onClick={(e) => {
          if (isDeleteMode) { setIsDeleteMode(false); return; }
          handleChipClick(p.id);
        }}
        style={isSelected ? { backgroundColor: activeBrandColor, borderColor: activeBrandColor } : {}}
        className={clsx(
          "px-3 py-1.5 rounded-xl text-[14px] font-semibold transition-colors border border-solid shrink-0 w-auto",
          isSelected 
            ? (hasTeamColor ? contrastChipText : "bg-brand text-content-dark border-brand") 
            : "bg-surface-level2 text-content-main border-surface-border hover:bg-surface-border"
        )}
      >
        {p.last_name} {p.first_name?.[0]}.
      </button>
    );
  };

  return (
    <FadeIn className="flex flex-col relative">
      <div className="flex flex-col" onClick={() => { if (isDeleteMode) setIsDeleteMode(false); }}>

      <style>
        {`
          .grid-expand-transition { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 0.3s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.2s ease-out; opacity: 0; pointer-events: none; }
          .grid-expand-transition.expanded { grid-template-rows: 1fr; opacity: 1; pointer-events: auto; }
          .grid-expand-transition.expanded { grid-template-rows: 1fr; opacity: 1; pointer-events: auto; }
          .grid-expand-inner { min-height: 0; overflow: hidden; }
          @keyframes slotEnter { 0% { transform: scale(0.2); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
          @keyframes slotExit { 0% { transform: scale(1); opacity: 1; } 100% { transform: scale(0.2); opacity: 0; } }
          .animate-slot-enter { animation: slotEnter 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) both; }
          .animate-slot-exit { animation: slotExit 0.2s cubic-bezier(0.6, -0.28, 0.735, 0.045) both; }
          @keyframes jiggle { 0% { transform: rotate(-1.5deg); } 50% { transform: rotate(1.5deg); } 100% { transform: rotate(-1.5deg); } }
          .animate-jiggle { animation: jiggle 0.3s ease-in-out infinite; }
          .jiggle-delay-0 { animation-delay: 0s; }
          .jiggle-delay-1 { animation-delay: 0.1s; }
          .jiggle-delay-2 { animation-delay: 0.2s; }
        `}
      </style>

      {/* КНОПКИ УПРАВЛЕНИЯ ПЯТЕРКАМИ С УЧЕТОМ СТАТУСА ТАРИФА ПОДПИСКИ ИЛИ ВРЕМЕННЫХ ДЕДЛАЙНОВ */}
      {(isEditMode || hasCoachAccess || hasAdminAccess || (hasShareRoleAccess && draftLines.length > 0)) && (
        <div className="flex justify-center items-center gap-2.5 pb-2 mb-4 w-full bg-transparent flex-wrap">
          {isEditMode ? (
            <>
              <button
                onClick={(e) => handleHeaderActionClick(e)}
                disabled={isPublishing}
                className="flex flex-1 justify-center items-center gap-1 px-3 py-2 rounded-full text-[14px] font-semibold bg-surface-base text-danger transition-all active:scale-95 hover:bg-surface-border outline-none cursor-pointer select-none"
              >
                <Icon name="close" className="w-5 h-5 shrink-0" strokeWidth={3} />
                Отмена
              </button>

              <button
                onClick={handlePublish}
                disabled={isPublishing}
                className="flex flex-1 justify-center items-center gap-1 px-3 py-2 rounded-full text-[14px] font-semibold bg-surface-base text-success transition-all active:scale-95 outline-none cursor-pointer select-none shadow-sm"
              >
                {isPublishing ? (
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-success border-t-transparent animate-spin shrink-0" />
                ) : (
                  <Icon name="save" className="w-5 h-5 shrink-0" strokeWidth={2.5} />
                )}
                Сохранить
              </button>
            </>
          ) : (
            <>
              {hasAdminAccess && (
                hasRosterSubmitAccess ? (
                  timeToMatch < DEADLINES.ROSTER_SUBMIT_MINUTES ? (
                    <HintPopover status="deadline_roster_submit" className="flex-1">
                      <button
                        type="button"
                        className="flex w-full justify-center items-center gap-1 px-3 py-2 rounded-full text-[14px] font-semibold bg-surface-base border border-content-subtle text-content-muted opacity-40 cursor-pointer select-none outline-none"
                      >
                        <Icon name="roster" className="w-4 h-4 shrink-0" />
                        Отправить
                      </button>
                    </HintPopover>
                  ) : (
                    <button
                      onClick={(e) => handleSubmitOfficialRoster(e)}
                      disabled={isSubmittingRoster}
                      style={{ color: isPublished ? '#fff' : activeBrandColor, borderColor: activeBrandColor, backgroundColor: isPublished ? activeBrandColor : undefined }}
                      className={clsx(
                        "flex flex-1 justify-center items-center gap-1 px-3 py-2 rounded-full text-[14px] font-semibold bg-surface-base border transition-all outline-none select-none active:scale-95 cursor-pointer",
                        !isPublished && "bg-surface-base hover:opacity-80"
                      )}
                    >
                      {isSubmittingRoster ? (
                        <div className={clsx("w-3.5 h-3.5 rounded-full border-2 border-t-transparent animate-spin shrink-0", isPublished ? "border-white" : "border-current")} />
                      ) : (
                        <Icon name="roster" className="w-3.5 h-3.5 shrink-0" />
                      )}
                      {isPublished ? 'Отправлено' : 'Отправить'}
                    </button>
                  )
                ) : (
                  <HintPopover status="no_subscription" className="flex-1">
                    <button
                      type="button"
                      className="flex w-full justify-center items-center gap-1 px-3 py-2 rounded-full text-[14px] font-semibold bg-surface-base border border-content-subtle text-content-muted opacity-40 cursor-pointer select-none outline-none"
                    >
                      <Icon name="roster" className="w-4 h-4 shrink-0" />
                      Отправить
                    </button>
                  </HintPopover>
                )
              )}

              {hasShareRoleAccess && draftLines.length > 0 && (
                hasShareAccess ? (
                  <button
                    onClick={isShareReady ? handleShareLines : regenerateFormationImage}
                    disabled={isSharing || isGeneratingFormation}
                    style={{ color: activeBrandColor, borderColor: activeBrandColor }}
                    className="flex flex-1 justify-center items-center gap-1 px-3 py-2 rounded-full text-[14px] font-semibold border bg-surface-base transition-all active:scale-95 hover:opacity-80 outline-none cursor-pointer select-none disabled:opacity-60 disabled:active:scale-100"
                  >
                    {(isSharing || isGeneratingFormation) ? (
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin shrink-0" />
                    ) : (
                      <Icon name={isShareReady ? 'share' : 'refresh'} className="w-4 h-4 shrink-0" />
                    )}
                    {isGeneratingFormation ? 'Генерация…' : !isShareReady ? 'Генерация' : isSharing ? 'Готовим…' : 'Поделиться'}
                  </button>
                ) : (
                  <HintPopover status="no_subscription" className="flex-1">
                    <button
                      type="button"
                      className="flex w-full justify-center items-center gap-1 px-3 py-2 rounded-full text-[14px] font-semibold border border-content-subtle bg-surface-base text-content-muted opacity-40 cursor-pointer select-none outline-none"
                    >
                      <Icon name="share" className="w-4 h-4 shrink-0" />
                      Поделиться
                    </button>
                  </HintPopover>
                )
              )}

              {hasCoachAccess && (
                hasLinesManageAccess ? (
                  timeToMatch <= DEADLINES.MIDDLE_EDIT_MINUTES ? (
                    <HintPopover status="deadline_lines_edit" className="flex-1">
                      <button
                        type="button"
                        className="flex w-full justify-center items-center gap-1 px-3 py-2 rounded-full text-[14px] font-semibold border border-content-subtle bg-surface-base text-content-muted opacity-40 cursor-pointer select-none outline-none"
                      >
                        <Icon name="users" className="w-4 h-4 shrink-0" />
                        Состав
                      </button>
                    </HintPopover>
                  ) : (
                    <button
                      onClick={(e) => handleHeaderActionClick(e)}
                      style={{ color: activeBrandColor, borderColor: activeBrandColor }}
                      className="flex flex-1 justify-center items-center gap-1 px-3 py-2 rounded-full text-[14px] font-semibold border bg-surface-base transition-all active:scale-95 hover:opacity-80 outline-none cursor-pointer select-none"
                    >
                      <Icon name="users" className="w-4 h-4 shrink-0" />
                      Состав
                    </button>
                  )
                ) : (
                  <HintPopover status="no_subscription" className="flex-1">
                    <button
                      type="button"
                      className="flex w-full justify-center items-center gap-1 px-3 py-2 rounded-full text-[14px] font-semibold border border-content-subtle bg-surface-base text-content-muted opacity-40 cursor-pointer select-none outline-none"
                    >
                      <Icon name="users" className="w-4 h-4 shrink-0" />
                      Состав
                    </button>
                  </HintPopover>
                )
              )}
            </>
          )}
        </div>
      )}

      {isEditMode && (
      <div className="-mx-0">
        <div className={clsx("grid-expand-transition", isEditMode && "expanded")}>
          <div className="grid-expand-inner pb-2">
            <ContainerContent title="Доступные игроки" count={unassignedPlayers.length}>
              <div 
                ref={chipsScrollRef}
                className="overflow-x-auto scrollbar-hide w-full pb-1 h-[116px]"
              >
                {unassignedPlayers.length > 0 ? (
                  <div className="flex flex-col gap-1 min-w-max">
                    {row1.length > 0 && (
                      <div className="flex flex-row gap-1 flex-nowrap">
                        {row1.map(p => renderChipButton(p))}
                      </div>
                    )}
                    {row2.length > 0 && (
                      <div className="flex flex-row gap-1 flex-nowrap">
                        {row2.map(p => renderChipButton(p))}
                      </div>
                    )}
                    {row3.length > 0 && (
                      <div className="flex flex-row gap-1 flex-nowrap">
                        {row3.map(p => renderChipButton(p))}
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-[10px] text-content-muted italic py-1 pl-1 w-full">
                    Все игроки распределены
                  </span>
                )}
              </div>
            </ContainerContent>
          </div>
        </div>
      </div>
      )}

      {isEditMode ? (
        <div className="relative w-full">
          <div ref={carouselRef} onScroll={handleCarouselScroll} className="flex overflow-x-auto flex-nowrap snap-x snap-mandatory scrollbar-hide pt-2 w-full gap-3 px-1">
            {[1, 2, 3, 4].map(lineNum => (
               <div key={`slide-${lineNum}`} className="min-w-[calc(100%-8px)] snap-center snap-always shrink-0 box-border">
                  <ContainerContent title={`Звено #${lineNum}`}>
                    {renderLineBlock(lineNum)}
                  </ContainerContent>
               </div>
            ))}
            <div className="min-w-[calc(100%-8px)] snap-center snap-always shrink-0 box-border">
               <ContainerContent title="Вратари">
                 {renderGoaliesBlock()}
               </ContainerContent>
            </div>
          </div>

          <div className="flex justify-center items-center gap-2 mt-6">
            {[0, 1, 2, 3, 4].map((index) => (
              <button
                key={`dot-${index}`}
                onClick={(e) => { e.stopPropagation(); scrollToSlide(index); }}
                className="p-2 -m-2 focus:outline-none cursor-pointer" 
              >
                <div className={clsx(
                  "h-2 rounded-full transition-all duration-300 ease-out",
                  currentSlide === index
                    ? "w-8 bg-content-muted opacity-100"
                    : "w-2 bg-content-subtle opacity-30"
                )} />
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4 w-full">
          {[1, 2, 3, 4].map(lineNum => (
            <ContainerContent key={`view-line-${lineNum}`} title={`Звено #${lineNum}`} className="shadow-sm">
              {renderLineBlock(lineNum)}
            </ContainerContent>
          ))}
          <ContainerContent title="Вратари" className="shadow-sm">
            {renderGoaliesBlock()}
          </ContainerContent>
        </div>
      )}

      {/* ШТОРКА РЕДАКТИРОВАНИЯ ИГРОВЫХ ПАРАМЕТРОВ */}
      <BottomSheet isOpen={isRosterSheetOpen} onClose={() => setIsRosterSheetOpen(false)}>
        {selectedPlayer && (
          <div className="flex flex-col gap-6 pt-2 text-left">
            <div className="flex items-center gap-4 border-b border-surface-border pb-4">
              <div className="w-20 h-20 rounded-3xl bg-surface-level3 overflow-hidden border border-surface-border shrink-0">
                <Avatar 
                  photoUrl={selectedPlayer.team_photo || selectedPlayer.avatar_url} 
                  firstName={selectedPlayer.first_name} 
                  lastName={selectedPlayer.last_name} 
                  className="w-full h-full"
                />
              </div>
              <div className="flex flex-col">
                <span className="text-[18px] font-black text-content-main uppercase tracking-wide">
                  {selectedPlayer.last_name}
                </span>
                <span className="text-[18px] font-medium text-content-muted">
                  {selectedPlayer.first_name}
                </span>
              </div>
            </div>

            {sheetError && (
              <div className="p-3 rounded-xl bg-danger-muted text-danger text-[14px] font-normal">
                {sheetError}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-black text-content-muted uppercase tracking-widest ml-2">
                Игровой номер на матч
              </label>
              <input 
                type="number" 
                pattern="[0-9]*"
                inputMode="numeric"
                value={editJersey}
                onChange={(e) => setEditJersey(e.target.value)}
                placeholder="Не назначен"
                className="w-full h-11 bg-surface-level2 border border-surface-border rounded-2xl px-4 text-ms font-bold text-content-main focus:border-brand focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-3 border border-surface-border rounded-2xl p-4">
              <CheckboxLP 
                label="Капитан команды (C)" 
                checked={editCaptain} 
                activeColor={hasTeamColor ? event.team_color : null}
                onChange={(val) => {
                  setEditCaptain(val);
                  if (val) setEditAssistant(false);
                }} 
              />
              <div className="h-px bg-surface-border0" />
              <CheckboxLP 
                label="Ассистент капитана (A)" 
                checked={editAssistant} 
                activeColor={hasTeamColor ? event.team_color : null}
                onChange={(val) => {
                  setEditAssistant(val);
                  if (val) setEditCaptain(false);
                }} 
              />
            </div>

            <div className="pt-4">
              <ButtonLP 
                onClick={handleSavePlayerParams} 
                isLoading={isSheetSaving}
                activeColor={hasTeamColor ? event.team_color : null}
              >
                Сохранить параметры
              </ButtonLP>
            </div>
          </div>
        )}
      </BottomSheet>

      <Toast
        isOpen={toast.isOpen}
        message={toast.message}
        type={toast.type}
        onClose={() => setToast(prev => ({ ...prev, isOpen: false }))}
        activeColor={hasTeamColor ? event.team_color : null}
      />

      {/* Off-screen карточка-источник для генерации картинки составов (html-to-image) */}
      <div aria-hidden="true" style={{ position: 'fixed', left: -99999, top: 0, pointerEvents: 'none' }}>
        <MatchLinesShareCard
          ref={shareCardRef}
          lines={draftLines}
          accent={activeBrandColor}
          opponentName={shareHeader.opponentName}
          dateDisplay={shareHeader.dateDisplay}
          timeDisplay={shareHeader.timeDisplay}
          arenaDisplay={shareHeader.arenaDisplay}
          jerseyLabel={shareHeader.jerseyLabel}
        />
      </div>

      </div>
    </FadeIn>
  );
};