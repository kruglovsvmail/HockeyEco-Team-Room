import pool from '../../config/db.js';

/**
 * GET /api/manager/handbooks/arenas
 * Получение списка ледовых арен из системного справочника с поддержкой поиска
 */
export const getArenas = async (req, res) => {
  try {
    const { search } = req.query;
    let query = `
      SELECT id, name, city, address, timezone 
      FROM arenas 
      WHERE status = 'active'
    `;
    const params = [];

    if (search && search.trim()) {
      query += ` AND (name ILIKE $1 OR city ILIKE $1)`;
      params.push(`%${search.trim()}%`);
    }

    query += ` ORDER BY city ASC, name ASC LIMIT 30;`;

    const result = await pool.query(query, params);
    return res.json({ success: true, arenas: result.rows });
  } catch (err) {
    console.error('[Handbook Arenas Error]:', err);
    return res.status(500).json({ success: false, error: 'Ошибка сервера при получении списка арен' });
  }
};

/**
 * GET /api/manager/handbooks/pwa-teams
 * Получение списка внутрисистемных команд лиги PWA для отправки вызова (кроме своей собственной)
 */
export const getPwaTeams = async (req, res) => {
  try {
    const { search } = req.query;
    let query = `
      SELECT id, name, city, logo_url 
      FROM teams 
      WHERE is_virtual = false
    `;
    const params = [];

    if (search && search.trim()) {
      query += ` AND (name ILIKE $1 OR city ILIKE $1)`;
      params.push(`%${search.trim()}%`);
    }

    query += ` ORDER BY name ASC LIMIT 30;`;

    const result = await pool.query(query, params);
    return res.json({ success: true, teams: result.rows });
  } catch (err) {
    console.error('[Handbook PWA Teams Error]:', err);
    return res.status(500).json({ success: false, error: 'Ошибка сервера при получении команд лиги' });
  }
};

/**
 * GET /api/manager/handbooks/external-opponents
 * Получение списка внешних соперников из блокнота команды
 */
export const getExternalOpponents = async (req, res) => {
  try {
    const { search } = req.query;
    let query = `
      SELECT id, name, short_name, city, logo_url 
      FROM external_opponents 
      WHERE status = 'active'
    `;
    const params = [];

    if (search && search.trim()) {
      query += ` AND (name ILIKE $1 OR city ILIKE $1)`;
      params.push(`%${search.trim()}%`);
    }

    query += ` ORDER BY name ASC LIMIT 30;`;

    const result = await pool.query(query, params);
    return res.json({ success: true, opponents: result.rows });
  } catch (err) {
    console.error('[Handbook External Opponents Error]:', err);
    return res.status(500).json({ success: false, error: 'Ошибка сервера при получении сторонних ХК' });
  }
};

/**
 * POST /api/manager/handbooks/external-opponents
 * Быстрое создание и сохранение нового внешнего соперника в базу прямо из шторки фронтенда
 */
export const createExternalOpponent = async (req, res) => {
  try {
    const { name, short_name, city } = req.body;

    if (!name || !city) {
      return res.status(400).json({ success: false, error: 'Название и город соперника обязательны' });
    }

    const insertQuery = `
      INSERT INTO external_opponents (name, short_name, city, status)
      VALUES ($1, $2, $3, 'active')
      RETURNING id, name, short_name, city, logo_url;
    `;

    const result = await pool.query(insertQuery, [
      name.trim(),
      (short_name || name.trim().slice(0, 3)).toUpperCase(),
      city.trim()
    ]);

    return res.json({ success: true, opponent: result.rows[0] });
  } catch (err) {
    console.error('[Handbook Create Opponent Error]:', err);
    return res.status(500).json({ success: false, error: 'Не удалось сохранить нового соперника в базу' });
  }
};

/**
 * GET /api/manager/handbooks/external-tournaments
 * ИСПРАВЛЕНО: Добавлена строгая изоляция по team_id, чтобы менеджеры видели только турниры своего клуба
 */
export const getExternalTournaments = async (req, res) => {
  try {
    const { teamId, search } = req.query;

    if (!teamId) {
      return res.status(400).json({ success: false, error: 'Идентификатор команды обязателен' });
    }

    let query = `
      SELECT id, name, is_active 
      FROM team_external_tournaments 
      WHERE is_active = true AND team_id = $1
    `;
    const params = [teamId];

    if (search && search.trim()) {
      query += ` AND name ILIKE $2`;
      params.push(`%${search.trim()}%`);
    }

    query += ` ORDER BY name ASC;`;

    const result = await pool.query(query, params);
    return res.json({ success: true, tournaments: result.rows });
  } catch (err) {
    console.error('[Handbook External Tournaments Error]:', err);
    return res.status(500).json({ success: false, error: 'Ошибка сервера при получении списка турниров' });
  }
};

/**
 * GET /api/manager/handbooks/external-tournaments/:tournamentId/opponents
 * Получение соперников, привязанных к конкретному выбранному турниру через таблицу связей external_tournaments_opponents
 */
export const getExternalTournamentOpponents = async (req, res) => {
  try {
    const { tournamentId } = req.params;
    const { search } = req.query;

    if (!tournamentId) {
      return res.status(400).json({ success: false, error: 'Не указан ID целевого турнира' });
    }

    let query = `
      SELECT eo.id, eo.name, eo.short_name, eo.city, eo.logo_url
      FROM external_tournaments_opponents eto
      JOIN external_opponents eo ON eto.external_opponent_id = eo.id
      WHERE eto.tournament_id = $1 AND eo.status = 'active'
    `;
    const params = [tournamentId];

    if (search && search.trim()) {
      query += ` AND (eo.name ILIKE $2 OR eo.city ILIKE $2)`;
      params.push(`%${search.trim()}%`);
    }

    query += ` ORDER BY eo.name ASC;`;

    const result = await pool.query(query, params);
    return res.json({ success: true, opponents: result.rows });
  } catch (err) {
    console.error('[Handbook Tournament Opponents Error]:', err);
    return res.status(500).json({ success: false, error: 'Ошибка сервера при получении участников турнира' });
  }
};

// =========================================================================
// 📂 РАСШИРЕННЫЕ МЕТОДЫ ДЛЯ СТРАНИЦЫ HANDBOOKSPAGE.JSX (Extended CRUD)
// =========================================================================

/**
 * GET /api/manager/handbooks/opponents-extended
 * Выгрузка реестра соперников с подсчетом количества сыгранных матчей (games_count) для защиты удаления
 */
export const getOpponentsExtended = async (req, res) => {
  try {
    const { search } = req.query;
    let query = `
      SELECT eo.id, eo.name, eo.short_name, eo.city, eo.logo_url,
             (SELECT COUNT(*)::int FROM games WHERE away_external_id = eo.id) as games_count,
             (SELECT COUNT(*)::int FROM games WHERE away_external_id = eo.id AND status = 'finished') as finished_games_count
      FROM external_opponents eo
      WHERE eo.status = 'active'
    `;
    const params = [];

    if (search && search.trim()) {
      query += ` AND (eo.name ILIKE $1 OR eo.city ILIKE $1)`;
      params.push(`%${search.trim()}%`);
    }

    query += ` ORDER BY eo.name ASC;`;

    const result = await pool.query(query, params);
    return res.json({ success: true, opponents: result.rows });
  } catch (err) {
    console.error('[Get Opponents Extended Error]:', err);
    return res.status(500).json({ success: false, error: 'Ошибка сервера при получении расширенного списка соперников' });
  }
};

/**
 * PUT /api/manager/handbooks/external-opponents/:id
 * Изменение реквизитов существующего стороннего ХК
 */
export const updateExternalOpponent = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, short_name, city } = req.body;

    if (!name || !city) {
      return res.status(400).json({ success: false, error: 'Название и город обязательны для обновления' });
    }

    const query = `
      UPDATE external_opponents
      SET name = $1, short_name = $2, city = $3, updated_at = NOW()
      WHERE id = $4
      RETURNING id;
    `;
    const result = await pool.query(query, [
      name.trim(),
      (short_name || name.trim().slice(0, 3)).toUpperCase(),
      city.trim(),
      id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Соперник не найден в базе данных' });
    }

    return res.json({ success: true, message: 'Данные соперника успешно обновлены' });
  } catch (err) {
    console.error('[Update External Opponent Error]:', err);
    return res.status(500).json({ success: false, error: 'Ошибка сервера при обновлении соперника' });
  }
};

/**
 * DELETE /api/manager/handbooks/external-opponents/:id
 * Безопасное удаление соперника, если с ним не было сыграно ни одного матча
 */
export const deleteExternalOpponent = async (req, res) => {
  try {
    const { id } = req.params;

    const checkQuery = `SELECT COUNT(*)::int as count FROM games WHERE away_external_id = $1`;
    const checkRes = await pool.query(checkQuery, [id]);
    
    if (checkRes.rows[0].count > 0) {
      return res.status(400).json({ success: false, error: 'Удаление невозможно: за данным соперником закреплены матчи в расписании' });
    }

    const deleteQuery = `DELETE FROM external_opponents WHERE id = $1;`;
    await pool.query(deleteQuery, [id]);

    return res.json({ success: true, message: 'Соперник успешно удален из справочника команды' });
  } catch (err) {
    console.error('[Delete External Opponent Error]:', err);
    return res.status(500).json({ success: false, error: 'Ошибка сервера при удалении соперника' });
  }
};

/**
 * GET /api/manager/handbooks/tournaments-extended
 * ИСПРАВЛЕНО: Добавлен обязательный фильтр по team_id, чтобы выгружались только кубки текущей команды
 */
export const getTournamentsExtended = async (req, res) => {
  try {
    const { teamId, search } = req.query;

    if (!teamId) {
      return res.status(400).json({ success: false, error: 'Идентификатор команды не передан' });
    }

    let query = `
      SELECT tet.id, tet.name, tet.is_active,
             (SELECT COUNT(*)::int FROM games WHERE external_tournament_id = tet.id) as games_count,
             (SELECT COUNT(*)::int FROM games WHERE external_tournament_id = tet.id AND status = 'finished') as finished_games_count,
             (SELECT COUNT(*)::int FROM external_tournaments_opponents WHERE tournament_id = tet.id) as opponents_count
      FROM team_external_tournaments tet
      WHERE tet.team_id = $1
    `;
    const params = [teamId];

    if (search && search.trim()) {
      query += ` AND tet.name ILIKE $2`;
      params.push(`%${search.trim()}%`);
    }

    query += ` ORDER BY tet.is_active DESC, tet.name ASC;`;

    const result = await pool.query(query, params);
    return res.json({ success: true, tournaments: result.rows });
  } catch (err) {
    console.error('[Get Tournaments Extended Error]:', err);
    return res.status(500).json({ success: false, error: 'Ошибка сервера при получении списка чемпионатов' });
  }
};

/**
 * POST /api/manager/handbooks/external-tournaments
 * КРИТИЧЕСКОЕ ИСПРАВЛЕНО: Теперь из req.body извлекается teamId и корректно передается в INSERT, закрывая ошибку 23502
 */
export const createExternalTournament = async (req, res) => {
  try {
    const { teamId, name, is_active } = req.body;

    if (!teamId || !name) {
      return res.status(400).json({ success: false, error: 'Идентификатор команды и наименование турнира обязательны' });
    }

    const query = `
      INSERT INTO team_external_tournaments (team_id, name, is_active)
      VALUES ($1, $2, $3)
      RETURNING id, name, is_active;
    `;
    const result = await pool.query(query, [teamId, name.trim(), is_active !== false]);
    return res.json({ success: true, tournament: result.rows[0] });
  } catch (err) {
    console.error('[Create External Tournament Error]:', err);
    return res.status(500).json({ success: false, error: 'Ошибка сервера при создании турнира' });
  }
};

/**
 * PUT /api/manager/handbooks/external-tournaments/:id
 * Обновление параметров и статуса активности (активен/архив) турнира с валидацией team_id
 */
export const updateExternalTournament = async (req, res) => {
  try {
    const { id } = req.params;
    const { teamId, name, is_active } = req.body;

    if (!name || !teamId) {
      return res.status(400).json({ success: false, error: 'Недостаточно данных для обновления параметров лиги' });
    }

    const query = `
      UPDATE team_external_tournaments
      SET name = $1, is_active = $2, updated_at = NOW()
      WHERE id = $3 AND team_id = $4
      RETURNING id;
    `;
    const result = await pool.query(query, [name.trim(), is_active !== false, id, teamId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Указанный турнир не найден для данной команды' });
    }

    return res.json({ success: true, message: 'Параметры турнира успешно обновлены' });
  } catch (err) {
    console.error('[Update External Tournament Error]:', err);
    return res.status(500).json({ success: false, error: 'Ошибка сервера при изменении турнира' });
  }
};

/**
 * DELETE /api/manager/handbooks/external-tournaments/:id
 * Безопасное удаление турнира из реестра с проверкой team_id
 */
export const deleteExternalTournament = async (req, res) => {
  try {
    const { id } = req.params;
    const { teamId } = req.query;

    if (!teamId) {
      return res.status(400).json({ success: false, error: 'Контекст команды обязателен при удалении' });
    }

    const checkQuery = `SELECT COUNT(*)::int as count FROM games WHERE external_tournament_id = $1`;
    const checkRes = await pool.query(checkQuery, [id]);

    if (checkRes.rows[0].count > 0) {
      return res.status(400).json({ success: false, error: 'Нельзя удалить турнир, внутри которого уже проведены или запланированы матчи' });
    }

    // Очищаем связи участников перед полным удалением кубка
    await pool.query(`DELETE FROM external_tournaments_opponents WHERE tournament_id = $1`, [id]);
    
    const deleteQuery = `DELETE FROM team_external_tournaments WHERE id = $1 AND team_id = $2 RETURNING id;`;
    const deleteRes = await pool.query(deleteQuery, [id, teamId]);

    if (deleteRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Турнир не найден или принадлежит другой команде' });
    }

    return res.json({ success: true, message: 'Турнир успешно удален из системы' });
  } catch (err) {
    console.error('[Delete External Tournament Error]:', err);
    return res.status(500).json({ success: false, error: 'Ошибка сервера при удалении турнира' });
  }
};

/**
 * GET /api/manager/handbooks/external-tournaments/:tournamentId/roster-map
 * Выгрузка полной карты чекбоксов соперников
 */
export const getTournamentRosterMap = async (req, res) => {
  try {
    const { tournamentId } = req.params;

    const query = `
      SELECT eo.id, eo.name, eo.city,
             EXISTS(
               SELECT 1 FROM external_tournaments_opponents 
               WHERE tournament_id = $1 AND external_opponent_id = eo.id
             )::boolean as is_in_tournament
      FROM external_opponents eo
      WHERE eo.status = 'active'
      ORDER BY eo.name ASC;
    `;
    
    const result = await pool.query(query, [tournamentId]);
    return res.json({ success: true, teams: result.rows });
  } catch (err) {
    console.error('[Get Tournament Roster Map Error]:', err);
    return res.status(500).json({ success: false, error: 'Ошибка сервера при формировании карты участников лиги' });
  }
};

/**
 * POST /api/manager/handbooks/external-tournaments/:tournamentId/roster-save
 * Сохранение состава участников лиги пачкой
 */
export const saveTournamentRoster = async (req, res) => {
  const { tournamentId } = req.params;
  const { opponentIds } = req.body;

  if (!Array.isArray(opponentIds)) {
    return res.status(400).json({ success: false, error: 'Неверный формат идентификаторов участников' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`DELETE FROM external_tournaments_opponents WHERE tournament_id = $1`, [tournamentId]);

    if (opponentIds.length > 0) {
      const insertQuery = `
        INSERT INTO external_tournaments_opponents (tournament_id, external_opponent_id)
        SELECT $1, UNNEST($2::int[])
      `;
      await client.query(insertQuery, [tournamentId, opponentIds]);
    }

    await client.query('COMMIT');
    return res.json({ success: true, message: 'Состав участников турнира успешно обновлен' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Save Tournament Roster Error]:', err);
    return res.status(500).json({ success: false, error: 'Ошибка сервера при перезаписи состава лиги' });
  } finally {
    client.release();
  }
};