import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { getAuthHeaders, getContrastTextColor, getImageUrl } from '../../../utils/helpers';
import { useAccess } from '../../../hooks/useAccess';
import { PERMISSIONS } from '../../../utils/permissions';
import { Avatar } from '../../../ui/Avatar';
import { Icon } from '../../../ui/Icon';
import { ContainerContent } from '../../../ui/ContainerContent';
import { Toast } from '../../../ui/Toast';
import { HintPopover } from '../../../ui/HintPopover';
import clsx from 'clsx';
import { PageLoader } from '../../../ui/Loader';
import { FadeIn } from '../../../ui/FadeIn';
import { toBlob } from 'html-to-image';
import { TrainingLinesShareCard } from './TrainingLinesShareCard';
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

// ── Константы ────────────────────────────────────────────────────────────
const LINE_POSITIONS = ['LW', 'C', 'RW', 'LD', 'RD'];
const LINE_LABELS    = { LW: 'ЛН', C: 'ЦН', RW: 'ПН', LD: 'ЛЗ', RD: 'ПЗ' };
const SLOT_POSITIONS = ['S1','S2','S3','S4','S5','S6','S7','S8','S9'];
const MIN_BLOCKS_GROUPS = 2;
const DEFAULT_BLOCKS_LINES = 4;
const MAX_BLOCKS = 6;
const INITIAL_GROUP_SLOTS = 4;
const MAX_GROUP_SLOTS = 9;
const LINE_SLOT_COUNT = 5;
const GOALIE_COUNT = 4;
const GOALIE_LINE_START = 100;

const JERSEY_COLORS = [
  { value: null,       label: '—',       plural: null,      hex: null },
  { value: 'White',    label: 'Белый',   plural: 'Белые',   hex: '#ffffff' },
  { value: 'Black',    label: 'Чёрный',  plural: 'Чёрные',  hex: '#1a1a1a' },
  { value: 'Cardinal', label: 'Красный', plural: 'Красные', hex: '#dc2626' },
  { value: 'Yellow',   label: 'Жёлтый',  plural: 'Жёлтые',  hex: '#eab308' },
  { value: 'Green',    label: 'Зелёный', plural: 'Зелёные', hex: '#16a34a' },
  { value: 'Blue',     label: 'Синий',   plural: 'Синие',   hex: '#2563eb' },
];

const isGroupPos = (pos) => pos && pos.startsWith('S');

const lineToGroupPositions = (players) =>
  players.map((p, i) => ({ ...p, position_in_line: SLOT_POSITIONS[i] }));

const groupToLinePositions = (players) => {
  const sorted = [...players].sort((a, b) => {
    const ai = SLOT_POSITIONS.indexOf(a.position_in_line);
    const bi = SLOT_POSITIONS.indexOf(b.position_in_line);
    return ai - bi;
  });
  return sorted.slice(0, LINE_SLOT_COUNT).map((p, i) => ({ ...p, position_in_line: LINE_POSITIONS[i] }));
};

// ── Селектор цвета джерси ─────────────────────────────────────────────────
function JerseyColorPicker({ blockNum, blockColors, setBlockColors, isEditMode }) {
  const [open, setOpen] = useState(false);
  const current = blockColors[blockNum] || null;
  const currentColor = JERSEY_COLORS.find(c => c.value === current);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); if (isEditMode) setOpen(o => !o); }}
        className={clsx("flex items-center outline-none transition-all", isEditMode && "active:scale-95")}
        title={currentColor?.label || 'Цвет формы'}
      >
        <div className="flex items-center gap-1.5">
          {current && <span className="text-[10px] font-bold text-content-muted uppercase tracking-wider">{currentColor?.plural}</span>}
          {current ? (
            <div className="w-4 h-4 rounded-full border border-surface-border shrink-0" style={{ backgroundColor: currentColor?.hex }} />
          ) : (
            <div className="w-4 h-4 rounded-full border border-dashed border-content-subtle shrink-0" />
          )}
        </div>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 flex gap-1.5 bg-surface-level1 border border-surface-border rounded-xl px-2 py-1.5 shadow-xl z-50">
            {JERSEY_COLORS.map(c => (
              <button
                key={c.value ?? 'none'}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setBlockColors(prev => {
                    const next = { ...prev };
                    if (c.value) next[blockNum] = c.value;
                    else delete next[blockNum];
                    return next;
                  });
                  setOpen(false);
                }}
                className={clsx(
                  "w-6 h-6 rounded-full border-2 transition-all active:scale-90 outline-none",
                  current === c.value ? "border-brand scale-110" : "border-surface-border"
                )}
                style={c.hex ? { backgroundColor: c.hex } : {}}
                title={c.label}
              >
                {!c.hex && <span className="text-[10px] text-content-subtle font-bold">✕</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Компонент ────────────────────────────────────────────────────────────
export const TrainingLines = ({ event, initialAttendees = [], initialStaffMembers = [], initialFormationFile = null, refreshData }) => {
  const [attendees, setAttendees] = useState(initialAttendees);
  const [draftLines, setDraftLines] = useState([]);
  const [staffMembers, setStaffMembers] = useState(initialStaffMembers);
  const [loading, setLoading] = useState(true);

  const [isEditMode, setIsEditMode] = useState(false);
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [mode, setMode] = useState('lines');
  const [blockCount, setBlockCount] = useState(DEFAULT_BLOCKS_LINES);
  const [groupSlots, setGroupSlots] = useState({});
  const [blockColors, setBlockColors] = useState({});

  const [toast, setToast] = useState({ isOpen: false, message: '', type: 'success' });
  const [currentSlide, setCurrentSlide] = useState(0);
  const [activeSelection, setActiveSelection] = useState(null);
  const [userInteracted, setUserInteracted] = useState(false);
  const [removingSlot, setRemovingSlot] = useState(null);

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

  const { user, checkAccess, selectedTeam } = useAccess(localUser, localTeam);
  const hasLinesManageAccess = checkAccess('TRAINING_LINES_MANAGE', event?.my_team_id);
  const hasShareAccess = checkAccess('TRAINING_LINES_SHARE', event?.my_team_id);

  const carouselRef = useRef(null);
  const shareCardRef = useRef(null);
  const chipsScrollRef = useRef(null);
  const pressTimer = useRef(null);
  const longPressFired = useRef(false);
  // Снимок сохранённого состава на момент входа в редактирование —
  // нужен, чтобы при «Отмене» вернуть исходную расстановку (режим, звенья, цвета),
  // а не оставить несохранённые изменения вроде переключения «Звенья → Группы».
  const editSnapshot = useRef(null);

  const tokenUser = useMemo(() => getSafeUserFromToken(), []);
  const activeUserId = user?.id || tokenUser?.id || tokenUser?.userId;
  const activeGlobalRole = useMemo(() =>
    String(user?.global_role || user?.globalRole || tokenUser?.global_role || tokenUser?.globalRole || '').toLowerCase(),
  [user, tokenUser]);

  const isColorsEnabled = localStorage.getItem('tr_use_team_colors') !== 'false';
  const hasTeamColor = isColorsEnabled && !!event?.team_color;
  const activeBrandColor = hasTeamColor ? event.team_color : 'var(--color-brand)';

  useEffect(() => { setAttendees(initialAttendees); }, [initialAttendees]);
  useEffect(() => { setStaffMembers(initialStaffMembers); }, [initialStaffMembers]);

  const userRoles = useMemo(() => {
    const rolesSet = new Set();
    if (activeGlobalRole) rolesSet.add(activeGlobalRole);
    if (selectedTeam?.user_role) selectedTeam.user_role.split(',').forEach(r => rolesSet.add(r.trim().toLowerCase()));
    if (staffMembers.length > 0 && activeUserId) {
      const myStaff = staffMembers.find(s => String(s.user_id) === String(activeUserId));
      if (myStaff?.roles) myStaff.roles.split(',').forEach(r => rolesSet.add(r.trim().toLowerCase()));
    }
    return Array.from(rolesSet);
  }, [activeGlobalRole, selectedTeam?.user_role, staffMembers, activeUserId]);

  const hasCoachAccess = useMemo(() => {
    if (userRoles.includes('admin')) return true;
    const allowed = (PERMISSIONS.TRAINING_LINES_MANAGE?.allowedRoles || []).map(r => String(r).toLowerCase());
    return userRoles.some(role => allowed.includes(role));
  }, [userRoles]);

  const hasShareRoleAccess = useMemo(() => {
    if (userRoles.includes('admin')) return true;
    const allowed = (PERMISSIONS.TRAINING_LINES_SHARE?.allowedRoles || []).map(r => String(r).toLowerCase());
    return userRoles.some(role => allowed.includes(role));
  }, [userRoles]);

  // ── Загрузка данных ────────────────────────────────────────────────────
  useEffect(() => {
    if (!event?.event_id || !event?.my_team_id) { setLoading(false); return; }
    const load = async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_URL || '';
        const headers = getAuthHeaders();
        const res = await fetch(
          `${apiUrl}/api/trainings/${event.event_id}/lines?teamId=${event.my_team_id}&eventType=${event.event_type}`,
          { headers }
        );
        const data = await res.json();
        if (data.success) {
          const lines = data.lines || [];
          setDraftLines(lines);

          const nonGoalie = lines.filter(l => l.position_in_line !== 'G');
          const hasGroups = nonGoalie.some(l => isGroupPos(l.position_in_line));
          const lineNums = [...new Set(nonGoalie.map(l => l.line_number))].sort((a, b) => a - b);

          const colors = {};
          lineNums.forEach(ln => {
            const first = nonGoalie.find(l => l.line_number === ln && l.jersey_color);
            if (first) colors[ln] = first.jersey_color;
          });
          setBlockColors(colors);

          if (hasGroups) {
            setMode('groups');
            const count = Math.max(MIN_BLOCKS_GROUPS, lineNums.length);
            setBlockCount(count);
            const slots = {};
            lineNums.forEach(ln => {
              const cnt = nonGoalie.filter(l => l.line_number === ln).length;
              slots[ln] = Math.max(INITIAL_GROUP_SLOTS, cnt);
            });
            setGroupSlots(slots);
          } else {
            setMode('lines');
            setBlockCount(Math.max(DEFAULT_BLOCKS_LINES, lineNums.length));
          }
        }
      } catch (err) {
        console.error('Ошибка загрузки расстановки:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [event?.event_id, event?.my_team_id, event?.event_type]);

  // ── Авто-расширение слотов группы ──────────────────────────────────────
  useEffect(() => {
    if (mode !== 'groups' || !isEditMode) return;
    setGroupSlots(prev => {
      const next = { ...prev };
      let changed = false;
      for (let bn = 1; bn <= blockCount; bn++) {
        const filled = draftLines.filter(l => l.line_number === bn && isGroupPos(l.position_in_line)).length;
        const current = next[bn] || INITIAL_GROUP_SLOTS;
        if (filled >= current && current < MAX_GROUP_SLOTS) {
          next[bn] = current + 1;
          changed = true;
        }
        // Авто-сжатие: если последний слот пуст и количество > INITIAL_GROUP_SLOTS
        if (filled < current - 1 && current > INITIAL_GROUP_SLOTS) {
          next[bn] = Math.max(INITIAL_GROUP_SLOTS, filled + 1);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [draftLines, mode, blockCount, isEditMode]);

  // ── Номера блоков ──────────────────────────────────────────────────────
  const blockNumbers = useMemo(() =>
    Array.from({ length: blockCount }, (_, i) => i + 1),
  [blockCount]);

  const totalSlides = blockCount + 1;

  // ── Переключение режима ────────────────────────────────────────────────
  const switchMode = (newMode) => {
    if (newMode === mode) return;
    setDraftLines(prev => {
      const goalies = prev.filter(l => l.position_in_line === 'G');
      const nonGoalie = prev.filter(l => l.position_in_line !== 'G');

      if (newMode === 'groups') {
        const byLine = {};
        nonGoalie.forEach(l => {
          if (!byLine[l.line_number]) byLine[l.line_number] = [];
          byLine[l.line_number].push(l);
        });
        const converted = [];
        const slots = {};
        Object.entries(byLine).forEach(([ln, players]) => {
          const mapped = lineToGroupPositions(players);
          converted.push(...mapped);
          slots[Number(ln)] = Math.max(INITIAL_GROUP_SLOTS, mapped.length);
        });
        setGroupSlots(slots);
        return [...converted, ...goalies];
      } else {
        const byLine = {};
        nonGoalie.forEach(l => {
          if (!byLine[l.line_number]) byLine[l.line_number] = [];
          byLine[l.line_number].push(l);
        });
        const converted = [];
        Object.entries(byLine).forEach(([ln, players]) => {
          converted.push(...groupToLinePositions(players));
        });
        return [...converted, ...goalies];
      }
    });
    setMode(newMode);
    if (newMode === 'lines') setBlockCount(prev => Math.max(DEFAULT_BLOCKS_LINES, prev));
    else setBlockCount(prev => Math.max(MIN_BLOCKS_GROUPS, Math.min(prev, MAX_BLOCKS)));
    setActiveSelection(null);
  };

  // ── Доступные игроки ───────────────────────────────────────────────────
  const unassignedPlayers = useMemo(() =>
    attendees.filter(a => !draftLines.some(l => String(l.player_id) === String(a.id || a.user_id))),
  [attendees, draftLines]);

  const { row1, row2, row3 } = useMemo(() => {
    const r1 = [], r2 = [], r3 = [];
    unassignedPlayers.forEach((p, i) => {
      if (i % 3 === 0) r1.push(p); else if (i % 3 === 1) r2.push(p); else r3.push(p);
    });
    return { row1: r1, row2: r2, row3: r3 };
  }, [unassignedPlayers]);

  useEffect(() => {
    const el = chipsScrollRef.current;
    if (!el) return;
    const handleWheel = (e) => { if (e.deltaY !== 0) { e.preventDefault(); el.scrollLeft += e.deltaY; } };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [isEditMode, attendees]);

  // ── Сохранение ─────────────────────────────────────────────────────────
  const handlePublish = async () => {
    setIsPublishing(true);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const headers = getAuthHeaders();
      const res = await fetch(`${apiUrl}/api/trainings/${event.event_id}/lines`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: event.my_team_id,
          eventType: event.event_type,
          lines: draftLines.map(l => ({
            player_id: l.player_id || l.id,
            line_number: l.line_number,
            position_in_line: l.position_in_line,
            jersey_color: l.position_in_line === 'G' ? null : (blockColors[l.line_number] || null),
          }))
        })
      });
      const data = await res.json();
      if (data.success) {
        setIsEditMode(false);
        setIsDeleteMode(false);
        setActiveSelection(null);
        // Перегенерируем и заливаем картинку расстановки в S3 (не блокируя выход из редактирования)
        regenerateFormationImage();
        if (refreshData) refreshData();
      } else {
        setToast({ isOpen: true, message: data.error || 'Не удалось сохранить расстановку', type: 'danger' });
      }
    } catch (err) { console.error(err); }
    finally { setIsPublishing(false); }
  };

  // ── Шеринг ─────────────────────────────────────────────────────────────
  // Текстовый состав — фолбэк, если картинку сгенерировать/расшарить не удалось
  const buildLinesText = () => {
    const textParts = [];
    for (let bn = 1; bn <= blockCount; bn++) {
      const players = draftLines.filter(l => l.line_number === bn && l.position_in_line !== 'G');
      if (players.length === 0) continue;
      const isGroup = players.some(l => isGroupPos(l.position_in_line));
      textParts.push(isGroup ? `ГРУППА #${bn}` : `ЗВЕНО #${bn}`);
      if (isGroup) {
        players.sort((a, b) => SLOT_POSITIONS.indexOf(a.position_in_line) - SLOT_POSITIONS.indexOf(b.position_in_line));
        players.forEach(p => textParts.push(`- ${p.last_name || ''} ${p.first_name || ''}`));
      } else {
        ['LW','C','RW','LD','RD'].forEach(pos => {
          const p = players.find(l => l.position_in_line === pos);
          if (p) textParts.push(`${LINE_LABELS[pos]} - ${p.last_name || ''} ${p.first_name || ''}`);
        });
      }
      textParts.push('');
    }
    const goalies = draftLines.filter(l => l.position_in_line === 'G').sort((a, b) => a.line_number - b.line_number);
    if (goalies.length > 0) {
      textParts.push('ВРАТАРИ');
      goalies.forEach((g, i) => textParts.push(`G${i + 1} - ${g.last_name || ''} ${g.first_name || ''}`));
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
      } catch { setToast({ isOpen: true, message: 'Не удалось скопировать', type: 'danger' }); }
    }
  };

  // Снимок off-screen карточки в PNG-файл (pixelRatio: 3 → ретина-чёткая)
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
      return { blob, file: new File([blob], 'rasstanovka_trenirovka.png', { type: 'image/png' }) };
    } catch (e) {
      console.error('Не удалось подготовить картинку расстановки:', e);
      return null;
    }
  }, []);

  // Готовый к шерингу файл (загружен из S3 или собран после сохранения)
  const preparedShareRef = useRef(null); // { blob, file } | null
  const [isGeneratingFormation, setIsGeneratingFormation] = useState(false);
  const [isShareReady, setIsShareReady] = useState(false); // есть ли готовый файл (для подписи кнопки)

  // Готовый файл прилетает уже загруженным из S3 родителем (EventDetailsTraining) на старте страницы —
  // поэтому при открытии вкладки «Расстановка» шеринг сразу готов, без запроса в момент клика.
  useEffect(() => {
    if (initialFormationFile) {
      preparedShareRef.current = initialFormationFile;
      setIsShareReady(true);
    } else if (!preparedShareRef.current) {
      setIsShareReady(false);
    }
  }, [initialFormationFile]);

  // Сгенерировать картинку и перезаписать в S3 — после сохранения расстановки или по клику «Генерация»
  const regenerateFormationImage = useCallback(async () => {
    setIsGeneratingFormation(true);
    try {
      const result = await buildShareFile();
      if (!result) return;
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const fd = new FormData();
      fd.append('teamId', event.my_team_id);
      fd.append('image', result.file, result.file.name);
      const resp = await fetch(`${apiUrl}/api/trainings/${event.event_id}/lines/formation-image?teamId=${event.my_team_id}`, {
        method: 'POST',
        headers: getAuthHeaders(), // без Content-Type — boundary проставит FormData
        body: fd,
      });
      if (resp.ok) {
        preparedShareRef.current = result; // сразу готов к моментальному шерингу
        setIsShareReady(true);
      }
    } catch (e) {
      console.error('Не удалось обновить картинку расстановки в S3:', e);
    } finally {
      setIsGeneratingFormation(false);
    }
  }, [buildShareFile, event?.my_team_id, event?.event_id]);

  // Клик «Поделиться»
  const handleShareLines = async () => {
    if (draftLines.length === 0) return;

    // Быстрый путь (моб./PWA): файл уже готов → share СИНХРОННО, сохраняя user activation
    const prepared = preparedShareRef.current;
    if (prepared && navigator.canShare && navigator.canShare({ files: [prepared.file] })) {
      navigator.share({ files: [prepared.file] }).catch(() => { /* пользователь закрыл окно */ });
      return;
    }

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
          setToast({ isOpen: true, message: 'Картинка расстановки скопирована в буфер обмена', type: 'success' });
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
      setToast({ isOpen: true, message: 'Картинка расстановки сохранена', type: 'success' });
    } catch (err) {
      console.error('Не удалось сгенерировать картинку расстановки:', err);
      await shareAsText();
    } finally {
      setIsSharing(false);
    }
  };

  // ── Управление ─────────────────────────────────────────────────────────
  const handleHeaderActionClick = () => {
    if (isEditMode) {
      // Отмена без сохранения — откатываем расстановку к снимку, снятому при входе
      if (editSnapshot.current) {
        const snap = editSnapshot.current;
        setMode(snap.mode);
        setDraftLines(snap.draftLines);
        setBlockCount(snap.blockCount);
        setGroupSlots(snap.groupSlots);
        setBlockColors(snap.blockColors);
        editSnapshot.current = null;
      }
      setIsEditMode(false); setIsDeleteMode(false); setActiveSelection(null);
      if (refreshData) refreshData();
    } else {
      // Вход в редактирование — фиксируем текущее (сохранённое) состояние
      editSnapshot.current = { mode, draftLines, blockCount, groupSlots, blockColors };
      setIsEditMode(true);
    }
  };

  const handleCarouselScroll = (e) => {
    if (!isEditMode) return;
    const c = e.target;
    if (c.clientWidth > 0) {
      const idx = Math.round(c.scrollLeft / c.clientWidth);
      if (idx !== currentSlide) setCurrentSlide(idx);
    }
  };

  const scrollToSlide = (index) => {
    if (carouselRef.current) {
      carouselRef.current.scrollTo({ left: carouselRef.current.clientWidth * index, behavior: 'smooth' });
      setCurrentSlide(index);
    }
  };

  const addBlock = () => {
    if (blockCount >= MAX_BLOCKS) return;
    const newCount = blockCount + 1;
    setBlockCount(newCount);
    if (mode === 'groups') setGroupSlots(prev => ({ ...prev, [newCount]: INITIAL_GROUP_SLOTS }));
    requestAnimationFrame(() => scrollToSlide(newCount - 1));
  };

  const minBlocks = mode === 'groups' ? MIN_BLOCKS_GROUPS : DEFAULT_BLOCKS_LINES;

  const removeBlock = () => {
    if (blockCount <= minBlocks) return;
    const removing = blockCount;
    setDraftLines(prev => prev.filter(l => l.line_number !== removing || l.position_in_line === 'G'));
    setBlockCount(removing - 1);
    if (mode === 'groups') setGroupSlots(prev => { const n = { ...prev }; delete n[removing]; return n; });
    if (currentSlide >= removing - 1) scrollToSlide(removing - 2);
  };

  // ── Тапы по слотам ─────────────────────────────────────────────────────
  const handleSlotClick = (lineNum, pos) => {
    if (!isEditMode) return;
    setUserInteracted(true);
    const existingIdx = draftLines.findIndex(l => l.line_number === lineNum && l.position_in_line === pos);
    const existing = existingIdx !== -1 ? draftLines[existingIdx] : null;

    if (activeSelection) {
      if (activeSelection.type === 'chip') {
        const newPlayer = attendees.find(a => a.id === activeSelection.id);
        let newLines = [...draftLines];
        if (existing) newLines.splice(existingIdx, 1);
        newLines.push({ player_id: newPlayer.id, line_number: lineNum, position_in_line: pos, ...newPlayer });
        setDraftLines(newLines);
        setActiveSelection(null);
      } else if (activeSelection.type === 'slot') {
        if (activeSelection.line === lineNum && activeSelection.pos === pos) { setActiveSelection(null); return; }
        const source = draftLines.find(l => l.line_number === activeSelection.line && l.position_in_line === activeSelection.pos);
        if (!source && !existing) { setActiveSelection({ type: 'slot', line: lineNum, pos }); return; }
        let newLines = draftLines.filter(l =>
          !(l.line_number === lineNum && l.position_in_line === pos) &&
          !(l.line_number === activeSelection.line && l.position_in_line === activeSelection.pos)
        );
        if (source) newLines.push({ ...source, line_number: lineNum, position_in_line: pos });
        if (existing) newLines.push({ ...existing, line_number: activeSelection.line, position_in_line: activeSelection.pos });
        setDraftLines(newLines);
        setActiveSelection(null);
      }
    } else {
      setActiveSelection({ type: 'slot', line: lineNum, pos });
    }
  };

  const handleChipClick = (playerId) => {
    if (!isEditMode) return;
    setUserInteracted(true);
    if (activeSelection) {
      if (activeSelection.type === 'slot') {
        const newPlayer = attendees.find(a => a.id === playerId);
        const existingIdx = draftLines.findIndex(l => l.line_number === activeSelection.line && l.position_in_line === activeSelection.pos);
        let newLines = [...draftLines];
        if (existingIdx !== -1) newLines.splice(existingIdx, 1);
        newLines.push({ player_id: newPlayer.id, line_number: activeSelection.line, position_in_line: activeSelection.pos, ...newPlayer });
        setDraftLines(newLines);
        setActiveSelection(null);
      } else if (activeSelection.type === 'chip' && activeSelection.id === playerId) { setActiveSelection(null); }
      else { setActiveSelection({ type: 'chip', id: playerId }); }
    } else {
      setActiveSelection({ type: 'chip', id: playerId });
    }
  };

  const handleDeletePlayer = (lineNum, pos, e) => {
    e.stopPropagation();
    setUserInteracted(true);
    setRemovingSlot({ line: lineNum, pos });
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
      setIsDeleteMode(true); setActiveSelection(null);
      if (window.navigator?.vibrate) window.navigator.vibrate(50);
    }, 500);
  };
  const cancelPress = () => { if (pressTimer.current) clearTimeout(pressTimer.current); };

  // ── renderSlot ─────────────────────────────────────────────────────────
  const renderSlot = (lineNum, pos, labelText = null) => {
    const player = draftLines.find(l => l.line_number === lineNum && l.position_in_line === pos);
    const isSelected = activeSelection?.type === 'slot' && activeSelection?.line === lineNum && activeSelection?.pos === pos;
    const isRemoving = removingSlot?.line === lineNum && removingSlot?.pos === pos;
    const playerImage = player?.team_photo || player?.avatar_url;
    const jiggleDelay = (lineNum + (['LW','S1','S4','S7'].includes(pos) ? 0 : ['C','S2','S5','S8'].includes(pos) ? 1 : 2)) % 3;
    const jiggleClass = isDeleteMode && player && !isRemoving ? `animate-jiggle jiggle-delay-${jiggleDelay}` : '';

    return (
      <div
        key={`${lineNum}-${pos}`}
        onPointerDown={handlePointerDown} onPointerUp={cancelPress} onPointerLeave={cancelPress} onPointerCancel={cancelPress}
        onClick={(e) => {
          if (longPressFired.current) { longPressFired.current = false; e.stopPropagation(); return; }
          if (isDeleteMode) { if (!player) setIsDeleteMode(false); e.stopPropagation(); return; }
          if (isEditMode) handleSlotClick(lineNum, pos);
        }}
        className={clsx(
          "flex flex-col items-center w-[94px] relative transition-all duration-200 shrink-0",
          isEditMode ? "cursor-pointer" : "pointer-events-none",
          isEditMode && !player && !isSelected && !isDeleteMode ? "opacity-70 hover:opacity-100" : "opacity-100",
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
              <Avatar photoUrl={playerImage} firstName={player.first_name} lastName={player.last_name}
                className={clsx("w-full h-full rounded-2xl origin-center", isRemoving ? "animate-slot-exit" : userInteracted ? "animate-slot-enter" : "")}
                fallbackClassName="bg-surface-level3 text-brand text-[14px]"
              />
              {isDeleteMode && !isRemoving && (
                <button onClick={(e) => handleDeletePlayer(lineNum, pos, e)}
                  className="absolute -top-1.5 -right-1.5 w-[22px] h-[22px] bg-red-500 rounded-full flex items-center justify-center shadow-md z-20">
                  <Icon name="close" className="w-3 h-3 text-white" strokeWidth={3.5} />
                </button>
              )}
              <div className="absolute -bottom-2 bg-surface-level2 rounded-md px-1.5 py-0.5 border border-surface-border shadow-sm z-10">
                <span className="text-[8px] font-black text-content-muted uppercase tracking-widest leading-none block">{labelText || pos}</span>
              </div>
            </>
          ) : (
            <span className="text-[14px] font-black text-content-muted uppercase tracking-widest select-none">{labelText || pos}</span>
          )}
        </div>
        <div className="w-full mt-4 flex flex-col items-center justify-center h-6 overflow-visible">
          {player ? (
            <>
              <span className="text-[14px] font-bold text-content-main leading-none w-full text-center pointer-events-none whitespace-nowrap">{player.last_name}</span>
              <span className="text-[10px] font-medium text-content-muted leading-none w-full text-center pointer-events-none whitespace-nowrap mt-1">{player.first_name}</span>
            </>
          ) : (
            <span className="text-[10px] font-bold text-transparent leading-none select-none">_</span>
          )}
        </div>
      </div>
    );
  };

  // ── Блок звена (позиции) ───────────────────────────────────────────────
  const renderLineBlock = (lineNum) => (
    <div key={`line-${lineNum}`} className="w-full flex flex-col items-center pb-1 mt-2">
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

  // ── Блок группы (сетка слотов) ─────────────────────────────────────────
  const renderGroupBlock = (lineNum) => {
    const slotCount = groupSlots[lineNum] || INITIAL_GROUP_SLOTS;
    const positions = SLOT_POSITIONS.slice(0, slotCount);
    return (
      <div key={`group-${lineNum}`} className="w-full flex flex-col items-center pb-1 mt-2">
        <div className="grid grid-cols-3 gap-x-4 gap-y-6 justify-items-center">
          {positions.map((pos, i) => renderSlot(lineNum, pos, `${i + 1}`))}
        </div>
      </div>
    );
  };

  // ── Вратари ─────────────────────────────────────────────────────────────
  const renderGoaliesBlock = () => {
    if (mode === 'lines') {
      return (
        <div className="w-full flex flex-col items-center pb-6 mt-2">
          <div className="flex justify-center gap-4 w-full">
            {renderSlot(GOALIE_LINE_START, 'G', 'Осн')}
            {renderSlot(GOALIE_LINE_START + 1, 'G', 'Зап')}
            {renderSlot(GOALIE_LINE_START + 2, 'G', 'Рез')}
          </div>
        </div>
      );
    }
    return (
      <div className="w-full flex flex-col items-center pb-6 mt-2">
        <div className="grid grid-cols-2 gap-x-8 gap-y-6 justify-items-center">
          {Array.from({ length: GOALIE_COUNT }, (_, i) => renderSlot(GOALIE_LINE_START + i, 'G', `G${i + 1}`))}
        </div>
    </div>
    );
  };

  // ── Чипсы доступных игроков ────────────────────────────────────────────
  const renderChipButton = (p) => {
    const isSelected = activeSelection?.type === 'chip' && activeSelection?.id === p.id;
    const contrastChipText = getContrastTextColor(hasTeamColor ? event.team_color : null) === 'text-white' ? 'text-white' : 'text-content-dark';
    return (
      <button key={p.id}
        onClick={() => { if (isDeleteMode) { setIsDeleteMode(false); return; } handleChipClick(p.id); }}
        style={isSelected ? { backgroundColor: activeBrandColor, borderColor: activeBrandColor } : {}}
        className={clsx(
          "px-3 py-1.5 rounded-xl text-[14px] font-semibold transition-colors border border-solid shrink-0 w-auto",
          isSelected ? (hasTeamColor ? contrastChipText : "bg-brand text-content-dark border-brand") : "bg-surface-level2 text-content-main border-surface-border hover:bg-surface-border"
        )}
      >
        {p.last_name} {p.first_name?.[0]}.
      </button>
    );
  };

  // ── Рендер контента блока ──────────────────────────────────────────────
  const renderBlock = (bn) => mode === 'groups' ? renderGroupBlock(bn) : renderLineBlock(bn);
  const blockTitle = (bn) => mode === 'groups' ? `Группа #${bn}` : `Звено #${bn}`;

  // ── Данные для картинки-карточки расстановки ─────────────────────────────
  const shareHeader = useMemo(() => {
    const arenaTz = event?.arena_timezone || 'UTC';
    const target  = event?.event_date || event?.game_date;
    const dObj    = target ? dayjs.utc(target).tz(arenaTz) : null;
    const daysMap = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ'];
    return {
      arenaDisplay: event?.arena_name || '',
      timeDisplay:  dObj ? dObj.format('HH:mm') : '',
      dateDisplay:  dObj ? `${dObj.format('D MMMM')}, ${daysMap[dObj.day()]}` : '',
    };
  }, [event]);

  const shareBlocks = useMemo(() => {
    const LINE_FW  = [['LW', 'ЛН'], ['C', 'ЦН'], ['RW', 'ПН']];
    const LINE_DEF = [['LD', 'ЛЗ'], ['RD', 'ПЗ']];
    return blockNumbers.map((bn) => {
      const players = draftLines.filter(l => l.line_number === bn && l.position_in_line !== 'G');
      if (players.length === 0) return null;
      const color = JERSEY_COLORS.find(c => c.value === (blockColors[bn] || null));
      const find  = (pos) => players.find(l => l.position_in_line === pos) || null;
      const base = {
        num: bn,
        title: blockTitle(bn),
        mode,
        jerseyHex: color?.hex || null,
        jerseyPlural: color?.plural || null,
      };
      if (mode === 'groups') {
        // Группы свободные — показываем только заполненные слоты, нумеруем по порядку
        const ordered = [...players].sort(
          (a, b) => SLOT_POSITIONS.indexOf(a.position_in_line) - SLOT_POSITIONS.indexOf(b.position_in_line)
        );
        base.slots = ordered.map((p, i) => ({ player: p, label: `${i + 1}` }));
      } else {
        base.forwards = LINE_FW.map(([pos, label]) => ({ player: find(pos), label }));
        base.defense  = LINE_DEF.map(([pos, label]) => ({ player: find(pos), label }));
      }
      return base;
    }).filter(Boolean);
  }, [draftLines, blockNumbers, mode, blockColors]);

  const shareGoalies = useMemo(() => {
    const gs = draftLines.filter(l => l.position_in_line === 'G');
    if (gs.length === 0) return null;
    const labels = mode === 'lines' ? ['Осн', 'Зап', 'Рез'] : ['G1', 'G2', 'G3', 'G4'];
    const count  = mode === 'lines' ? 3 : GOALIE_COUNT;
    const slots = Array.from({ length: count }, (_, i) => ({
      player: gs.find(g => g.line_number === GOALIE_LINE_START + i) || null,
      label: labels[i],
    }));
    return { slots };
  }, [draftLines, mode]);

  if (loading) return <PageLoader />;

  return (
    <FadeIn className="flex flex-col relative">
      <div className="flex flex-col" onClick={() => { if (isDeleteMode) setIsDeleteMode(false); }}>

      <style>{`
        .grid-expand-transition { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 0.3s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.2s ease-out; opacity: 0; pointer-events: none; }
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
      `}</style>

      {/* КНОПКИ УПРАВЛЕНИЯ */}
      {(isEditMode || hasCoachAccess || (hasShareRoleAccess && draftLines.length > 0)) && (
        <div className="flex justify-center items-center gap-2.5 pb-2 mb-4 w-full bg-transparent flex-wrap ">
          {isEditMode ? (
            <>
              <button onClick={handleHeaderActionClick} disabled={isPublishing}
                className="flex flex-1 justify-center items-center gap-1 px-3 py-2 rounded-full text-[14px] font-semibold bg-surface-base text-danger transition-all active:scale-95 hover:bg-surface-border outline-none cursor-pointer select-none">
                <Icon name="close" className="w-5 h-5 shrink-0" strokeWidth={3} /> Отмена
              </button>
              <button onClick={handlePublish} disabled={isPublishing}
                className="flex flex-1 justify-center items-center gap-1 px-3 py-2 rounded-full text-[14px] font-semibold bg-surface-base text-success transition-all active:scale-95 outline-none cursor-pointer select-none shadow-sm">
                {isPublishing
                  ? <div className="w-3.5 h-3.5 rounded-full border-2 border-success border-t-transparent animate-spin shrink-0" />
                  : <Icon name="save" className="w-5 h-5 shrink-0" strokeWidth={2.5} />}
                Сохранить
              </button>
            </>
          ) : (
            <>
              {hasShareRoleAccess && draftLines.length > 0 && (
                hasShareAccess ? (
                  <button onClick={isShareReady ? handleShareLines : regenerateFormationImage} disabled={isSharing || isGeneratingFormation} style={{ color: activeBrandColor, borderColor: activeBrandColor }}
                    className="flex flex-1 justify-center items-center gap-1 px-3 py-2 rounded-full text-[14px] font-semibold border bg-surface-base transition-all active:scale-95 hover:opacity-80 outline-none cursor-pointer select-none disabled:opacity-60 disabled:active:scale-100">
                    {(isSharing || isGeneratingFormation)
                      ? <div className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin shrink-0" />
                      : <Icon name={isShareReady ? 'share' : 'refresh'} className="w-4 h-4 shrink-0" />}
                    {isGeneratingFormation ? 'Генерация…' : !isShareReady ? 'Генерация' : isSharing ? 'Готовим…' : 'Поделиться'}
                  </button>
                ) : (
                  <HintPopover status="no_subscription">
                    <button type="button" className="flex w-full justify-center items-center gap-1 px-3 py-2 rounded-full text-[14px] font-semibold border border-content-subtle bg-surface-base text-content-muted opacity-40 cursor-pointer select-none outline-none">
                      <Icon name="share" className="w-4 h-4 shrink-0" /> Поделиться
                    </button>
                  </HintPopover>
                )
              )}
              {hasCoachAccess && (
                hasLinesManageAccess ? (
                  <button onClick={handleHeaderActionClick} style={{ color: activeBrandColor, borderColor: activeBrandColor }}
                    className="flex flex-1 justify-center items-center gap-1 px-3 py-2 rounded-full text-[14px] font-semibold border bg-surface-base transition-all active:scale-95 hover:opacity-80 outline-none cursor-pointer select-none">
                    <Icon name="users" className="w-4 h-4 shrink-0" /> Состав
                  </button>
                ) : (
                  <HintPopover status="no_subscription">
                    <button type="button" className="flex w-full justify-center items-center gap-1 px-3 py-2 rounded-full text-[14px] font-semibold border border-content-subtle bg-surface-level2 text-content-muted opacity-40 cursor-pointer select-none outline-none">
                      <Icon name="users" className="w-4 h-4 shrink-0" /> Состав
                    </button>
                  </HintPopover>
                )
              )}
            </>
          )}
        </div>
      )}

      {/* ПЕРЕКЛЮЧАТЕЛЬ + ДОСТУПНЫЕ ИГРОКИ (только в edit mode) */}
      {isEditMode && (
        <div className="-mx-0">
          <div className={clsx("grid-expand-transition", "expanded")}>
            <div className="grid-expand-inner pb-2">
              {/* Тумблер Звенья / Группы */}
              <div className="flex items-center justify-center gap-1 mb-3">
                {['lines', 'groups'].map(m => (
                  <button key={m} onClick={() => switchMode(m)}
                    style={mode === m ? { borderColor: activeBrandColor, color: activeBrandColor } : {}}
                    className={clsx(
                      "px-4 py-1 rounded-full text-[14px] font-semibold uppercase tracking-widest transition-all outline-none select-none border",
                      mode === m ? "bg-surface-base" : "bg-surface-base text-content-muted border-surface-border"
                    )}>
                    {m === 'lines' ? 'Звенья' : 'Группы'}
                  </button>
                ))}
              </div>

              <ContainerContent title="Доступные игроки" count={unassignedPlayers.length}>
                <div ref={chipsScrollRef} className="overflow-x-auto scrollbar-hide w-full pb-1 h-[116px]">
                  {unassignedPlayers.length > 0 ? (
                    <div className="flex flex-col gap-1 min-w-max">
                      {row1.length > 0 && <div className="flex flex-row gap-1 flex-nowrap">{row1.map(renderChipButton)}</div>}
                      {row2.length > 0 && <div className="flex flex-row gap-1 flex-nowrap">{row2.map(renderChipButton)}</div>}
                      {row3.length > 0 && <div className="flex flex-row gap-1 flex-nowrap">{row3.map(renderChipButton)}</div>}
                    </div>
                  ) : (
                    <span className="text-[10px] text-content-muted italic py-1 pl-1 w-full">Все игроки распределены</span>
                  )}
                </div>
              </ContainerContent>
            </div>
          </div>
        </div>
      )}

      {/* КАРУСЕЛЬ / СПИСОК */}
      {isEditMode ? (
        <div className="relative w-full">
          <div ref={carouselRef} onScroll={handleCarouselScroll}
            className="flex overflow-x-auto flex-nowrap snap-x snap-mandatory scrollbar-hide pt-2 w-full gap-3 px-1">
            {blockNumbers.map(bn => (
              <div key={`slide-${bn}`} className="min-w-[calc(100%-8px)] snap-center snap-always shrink-0 box-border">
                <ContainerContent title={blockTitle(bn)} action={<JerseyColorPicker blockNum={bn} blockColors={blockColors} setBlockColors={setBlockColors} isEditMode />}>{renderBlock(bn)}</ContainerContent>
              </div>
            ))}
            <div className="min-w-[calc(100%-8px)] snap-center snap-always shrink-0 box-border">
              <ContainerContent title="Вратари">{renderGoaliesBlock()}</ContainerContent>
            </div>
          </div>

          {/* Индикатор + кнопки добавления/удаления блоков */}
          <div className="flex justify-between items-center mt-4 px-2">
            <button onClick={removeBlock} disabled={blockCount <= minBlocks}
              className={clsx("w-8 h-8 rounded-lg border flex items-center justify-center transition-all outline-none",
                blockCount <= minBlocks ? "border-surface-border text-content-subtle opacity-30 cursor-not-allowed" : "border-content-subtle bg-surface-level2 text-content-main active:scale-90 cursor-pointer")}>
              <Icon name="minus" className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2 px-2">
              {Array.from({ length: totalSlides }, (_, i) => (
                <button key={`dot-${i}`} onClick={(e) => { e.stopPropagation(); scrollToSlide(i); }} className="p-1.5 -m-1.5 focus:outline-none cursor-pointer">
                  <div className={clsx("h-2 rounded-full transition-all duration-300 ease-out",
                    currentSlide === i ? "w-8 bg-content-muted opacity-100" : "w-2 bg-content-subtle opacity-30")} />
                </button>
              ))}
            </div>

            <button onClick={addBlock} disabled={blockCount >= MAX_BLOCKS}
              className={clsx("w-8 h-8 rounded-lg border flex items-center justify-center transition-all outline-none",
                blockCount >= MAX_BLOCKS ? "border-surface-border text-content-subtle opacity-30 cursor-not-allowed" : "border-content-subtle bg-surface-level2 text-content-main active:scale-90 cursor-pointer")}>
              <Icon name="plus" className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        draftLines.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-center px-4">
            <span className="text-[14px] font-normal text-content-muted max-w-[240px]">
              Состав ещё не сформирован
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-4 w-full">
            {blockNumbers.map(bn => {
              const players = draftLines.filter(l => l.line_number === bn && l.position_in_line !== 'G');
              if (players.length === 0) return null;
              return (
                <ContainerContent key={`view-${bn}`} title={blockTitle(bn)} className="shadow-sm" action={<JerseyColorPicker blockNum={bn} blockColors={blockColors} setBlockColors={setBlockColors} isEditMode={false} />}>
                  {renderBlock(bn)}
                </ContainerContent>
              );
            })}
            {draftLines.some(l => l.position_in_line === 'G') && (
              <ContainerContent title="Вратари" className="shadow-sm">{renderGoaliesBlock()}</ContainerContent>
            )}
          </div>
        )
      )}

      <Toast isOpen={toast.isOpen} message={toast.message} type={toast.type}
        onClose={() => setToast(prev => ({ ...prev, isOpen: false }))} activeColor={hasTeamColor ? event.team_color : null} />

      {/* Off-screen карточка-источник для генерации картинки расстановки (html-to-image) */}
      <div aria-hidden="true" style={{ position: 'fixed', left: -99999, top: 0, pointerEvents: 'none' }}>
        <TrainingLinesShareCard
          ref={shareCardRef}
          blocks={shareBlocks}
          goalies={shareGoalies}
          dateDisplay={shareHeader.dateDisplay}
          timeDisplay={shareHeader.timeDisplay}
          arenaDisplay={shareHeader.arenaDisplay}
          accent={activeBrandColor}
        />
      </div>
      </div>
    </FadeIn>
  );
};
