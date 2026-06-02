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
 * Получение списка только АКТИВНЫХ сторонних турниров (согласно новому правилу и флагу is_active)
 */
export const getExternalTournaments = async (req, res) => {
  try {
    const { search } = req.query;
    let query = `
      SELECT id, name, is_active 
      FROM team_external_tournaments 
      WHERE is_active = true
    `;
    const params = [];

    if (search && search.trim()) {
      query += ` AND name ILIKE $1`;
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