import pool from '../config/db.js';
import s3 from '../config/s3.js';
import path from 'path';
import { PERMISSIONS } from '../utils/permissions.js';
import { processAvatar } from '../utils/imageProcessor.js';
import { sendPushToTeamExcept } from '../services/pushService.js';

/**
 * Р’РЅСѓС‚СЂРµРЅРЅСЏСЏ С„СѓРЅРєС†РёСЏ РґР»СЏ РїСЂРѕРІРµСЂРєРё РіСЂР°РЅСѓР»СЏСЂРЅС‹С… РїСЂР°РІ РґРѕСЃС‚СѓРїР° Рё РїРѕРґРїРёСЃРєРё
 */
async function checkPermissionInternal(userId, teamId, permissionKey, client = pool) {
  if (!userId) return false;

  const userRes = await client.query(
    'SELECT global_role, subscription_expires_at FROM users WHERE id = $1',
    [userId]
  );
  if (userRes.rows.length === 0) return false;
  const { global_role, subscription_expires_at } = userRes.rows[0];

  if (global_role === 'admin') return true;

  const permission = PERMISSIONS[permissionKey];
  if (!permission) return false;

  const hasSubscription = subscription_expires_at && new Date(subscription_expires_at) > new Date();
  let userRoles = [];

  if (teamId) {
    const teamOwnerRes = await client.query('SELECT owner_id FROM teams WHERE id = $1', [teamId]);
    if (teamOwnerRes.rows.length > 0 && teamOwnerRes.rows[0].owner_id === userId) {
      userRoles.push('owner');
    }

    const trRes = await client.query(`
      SELECT tr.role FROM team_roles tr 
      JOIN team_members tm ON tr.member_id = tm.id 
      WHERE tm.user_id = $1 AND tm.team_id = $2 AND tr.left_at IS NULL AND tm.left_at IS NULL
    `, [userId, teamId]);
    userRoles.push(...trRes.rows.map(r => r.role));

    const crRes = await client.query(`
      SELECT cr.role FROM club_roles cr
      JOIN teams t ON t.club_id = cr.club_id
      JOIN club_members cm ON cm.club_id = cr.club_id AND cm.user_id = cr.user_id
      WHERE cr.user_id = $1 AND t.id = $2 AND cr.left_at IS NULL AND cm.left_at IS NULL
    `, [userId, teamId]);
    userRoles.push(...crRes.rows.map(r => r.role));

    const memberRes = await client.query(`
      SELECT id FROM team_members 
      WHERE user_id = $1 AND team_id = $2 AND left_at IS NULL
    `, [userId, teamId]);
    if (memberRes.rows.length > 0) {
      userRoles.push('player');
    }
  }

  return userRoles.some(role => {
    if (!permission.allowedRoles.includes(role)) return false;

    let roleRequiresSub = false;
    if (permission.requiresSubscription === true) {
      roleRequiresSub = true;
    } else if (Array.isArray(permission.requiresSubscription)) {
      roleRequiresSub = permission.requiresSubscription.includes(role);
    }

    if (roleRequiresSub && !hasSubscription) return false;
    return true;
  });
}

// РџРѕР»СѓС‡РµРЅРёРµ РІСЃРµС… РєРѕРјР°РЅРґ С‚РµРєСѓС‰РµРіРѕ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ
export const getMyTeams = async (req, res) => {
    try {
        const userId = req.user.id;

        // 1. Р‘Р°Р·РѕРІС‹Р№ СЃРїРёСЃРѕРє РєРѕРјР°РЅРґ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ
        const teamsQuery = `
            SELECT DISTINCT t.id, t.name, t.short_name, t.logo_url, t.city, t.description,
                            t.jersey_dark_url, t.jersey_light_url, t.color_home_1, t.color_home_2,
                            t.color_away_1, t.color_away_2, t.owner_id
            FROM teams t
            LEFT JOIN team_members tm ON tm.team_id = t.id AND tm.left_at IS NULL
            LEFT JOIN club_members cm ON cm.club_id = t.club_id AND cm.left_at IS NULL
            WHERE (tm.user_id = $1 OR cm.user_id = $1 OR t.owner_id = $1)
            ORDER BY t.name
        `;
        const { rows: teams } = await pool.query(teamsQuery, [userId]);

        if (teams.length === 0) {
            return res.json({ teams: [] });
        }

        const teamIds = teams.map(t => t.id);

        // 2. Р РѕР»Рё РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РІ РєРѕРјР°РЅРґР°С… (team_roles)
        const teamRolesRes = await pool.query(`
            SELECT tm.team_id, tr.role
            FROM team_roles tr
            JOIN team_members tm ON tr.member_id = tm.id
            WHERE tm.user_id = $1 AND tm.team_id = ANY($2) AND tr.left_at IS NULL AND tm.left_at IS NULL
        `, [userId, teamIds]);

        // 3. Р РѕР»Рё РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ С‡РµСЂРµР· РєР»СѓР± (club_roles в†’ РєРѕРјР°РЅРґС‹ РєР»СѓР±Р°)
        const clubRolesRes = await pool.query(`
            SELECT t.id AS team_id, cr.role
            FROM club_roles cr
            JOIN teams t ON t.club_id = cr.club_id
            JOIN club_members cm ON cm.club_id = cr.club_id AND cm.user_id = cr.user_id
            WHERE cr.user_id = $1 AND t.id = ANY($2) AND cr.left_at IS NULL AND cm.left_at IS NULL
        `, [userId, teamIds]);

        // 4. РЎС‚Р°С‚СѓСЃ РїРѕРґРїРёСЃРєРё РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ
        const subRes = await pool.query(
            'SELECT subscription_expires_at FROM users WHERE id = $1',
            [userId]
        );
        const subExpires = subRes.rows[0]?.subscription_expires_at;
        const hasSubscription = subExpires ? new Date(subExpires) > new Date() : false;

        // 5. РЎРєР»РµРёРІР°РµРј СЂРѕР»Рё РІ РєР°СЂС‚Сѓ РїРѕ team_id
        const rolesByTeam = {};
        for (const { team_id, role } of teamRolesRes.rows) {
            if (!rolesByTeam[team_id]) rolesByTeam[team_id] = new Set();
            rolesByTeam[team_id].add(role);
        }
        for (const { team_id, role } of clubRolesRes.rows) {
            if (!rolesByTeam[team_id]) rolesByTeam[team_id] = new Set();
            rolesByTeam[team_id].add(role);
        }

        // 6. РЎРѕР±РёСЂР°РµРј РёС‚РѕРіРѕРІС‹Р№ РјР°СЃСЃРёРІ РєРѕРјР°РЅРґ СЃ СЂРѕР»СЏРјРё
        const enrichedTeams = teams.map(team => {
            const isOwner = team.owner_id === userId;
            const roles = Array.from(rolesByTeam[team.id] || []);
            if (isOwner) roles.unshift('owner');

            return {
                ...team,
                user_role: roles.join(','),       // СЃС‚СЂРѕРєР° РґР»СЏ РѕР±СЂР°С‚РЅРѕР№ СЃРѕРІРјРµСЃС‚РёРјРѕСЃС‚Рё СЃ С„РѕР»Р±РµРєРѕРј
                user_roles: roles,                 // РјР°СЃСЃРёРІ РґР»СЏ accessMatrix
                has_subscription: hasSubscription,
                is_owner: isOwner,
            };
        });

        res.json({ teams: enrichedTeams });
    } catch (error) {
        console.error('[Get My Teams Error]:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// РџРѕР»СѓС‡РµРЅРёРµ РґРµС‚Р°Р»РёР·РёСЂРѕРІР°РЅРЅС‹С… СЃРїРёСЃРєРѕРІ СѓС‡Р°СЃС‚РЅРёРєРѕРІ С…РѕРєРєРµР№РЅРѕР№ РєРѕРјР°РЅРґС‹
export const getTeamDetails = async (req, res) => {
    try {
        const teamId = req.params.id;
        
        // 1. Р—Р°РїСЂРѕСЃ РїРѕР»РЅРѕРіРѕ СЃРїРёСЃРєР° С‡Р»РµРЅРѕРІ РєРѕРјР°РЅРґС‹ (Р°РєС‚РёРІРЅС‹Рµ СѓС‡Р°СЃС‚РЅРёРєРё СЃРѕСЃС‚Р°РІР°)
        const membersQuery = `
            SELECT 
                tm.id as member_id, u.id as user_id, 
                u.first_name, u.last_name, u.birth_date, u.height, u.weight,
                COALESCE(tm.photo_url, u.avatar_url) as avatar_url,
                tr.position, tr.jersey_number, tr.is_captain, tr.is_assistant
            FROM team_members tm
            JOIN users u ON u.id = tm.user_id
            LEFT JOIN team_rosters tr ON tm.id = tr.member_id AND tr.left_at IS NULL
            WHERE tm.team_id = $1 AND tm.left_at IS NULL
            ORDER BY u.last_name, u.first_name
        `;

        // 2. Р—Р°РїСЂРѕСЃ Р°РєС‚РёРІРЅРѕРіРѕ РёРіСЂРѕРІРѕРіРѕ СЂРѕСЃС‚РµСЂР° РЅР° С‚СѓСЂРЅРёСЂС‹
        const rosterQuery = `
            SELECT 
                tm.id as member_id, u.id as user_id, 
                u.first_name, u.last_name, u.birth_date, u.height, u.weight,
                COALESCE(tm.photo_url, u.avatar_url) as avatar_url,
                tr.position, tr.jersey_number, tr.is_captain, tr.is_assistant
            FROM team_rosters tr
            JOIN team_members tm ON tm.id = tr.member_id
            JOIN users u ON u.id = tm.user_id
            WHERE tm.team_id = $1 AND tm.left_at IS NULL AND tr.left_at IS NULL
            ORDER BY tr.jersey_number
        `;
        
        // 3. Р—Р°РїСЂРѕСЃ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РёРІРЅРѕРіРѕ Рё С‚СЂРµРЅРµСЂСЃРєРѕРіРѕ С€С‚Р°Р±Р°
        const staffQuery = `
            SELECT 
                tm.id as member_id, u.id as user_id, 
                u.first_name, u.last_name, u.birth_date,
                COALESCE(tm.photo_url, u.avatar_url) as avatar_url,
                string_agg(trole.role, ', ') as roles
            FROM team_roles trole
            JOIN team_members tm ON tm.id = trole.member_id
            JOIN users u ON u.id = tm.user_id
            WHERE tm.team_id = $1 AND tm.left_at IS NULL AND trole.left_at IS NULL
            GROUP BY tm.id, u.id, u.first_name, u.last_name, tm.photo_url, u.avatar_url, u.birth_date
            ORDER BY u.last_name, u.first_name
        `;
        
        const [membersRes, rosterRes, staffRes] = await Promise.all([
            pool.query(membersQuery, [teamId]),
            pool.query(rosterQuery, [teamId]),
            pool.query(staffQuery, [teamId])
        ]);
        
        res.json({ 
            members: membersRes.rows, 
            roster: rosterRes.rows, 
            staff: staffRes.rows 
        });
    } catch (error) {
        console.error('[Get Team Details Error]:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// РџРѕР»СѓС‡РµРЅРёРµ Р°РЅРєРµС‚С‹ СѓС‡Р°СЃС‚РЅРёРєР° РєРѕРјР°РЅРґС‹ СЃ СЃРµР»РµРєС‚РёРІРЅРѕР№ Р·Р°С‰РёС‚РѕР№ РІРёСЂС‚СѓР°Р»СЊРЅРѕРіРѕ РєРѕРґР° Рё РІС‹РґР°С‡РµР№ РєР°СЂС‚С‹ РїСЂР°РІ
export const getTeamMemberDetails = async (req, res) => {
  const { teamId, userId } = req.params;
  const reqUserId = req.user?.id;

  try {
    if (!reqUserId) {
      return res.status(401).json({ error: 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РёРґРµРЅС‚РёС„РёС†РёСЂРѕРІР°РЅ' });
    }

    // Р’С‹С‡РёСЃР»СЏРµРј РґРёРЅР°РјРёС‡РµСЃРєРёРµ РїСЂР°РІР° РЅР° РѕСЃРЅРѕРІРµ СЌС‚Р°Р»РѕРЅРЅРѕР№ РјР°С‚СЂРёС†С‹ permissions.js
    const canEditRoles = await checkPermissionInternal(reqUserId, teamId, 'EDIT_USER_BLOCK_ROLES');
    const canEditGameProfile = await checkPermissionInternal(reqUserId, teamId, 'EDIT_USER_BLOCK_HOCKEY');
    const canEditHeader = await checkPermissionInternal(reqUserId, teamId, 'EDIT_USER_BLOCK_BASE');
    const canViewVirtualCode = await checkPermissionInternal(reqUserId, teamId, 'VIEW_VIRTUAL_CODE');

    const query = `
      SELECT 
        u.id as user_id, tm.id as member_id, u.first_name, u.last_name, u.middle_name, 
        u.phone, u.birth_date, u.height, u.weight, u.grip, u.virtual_code,
        tm.photo_url as team_photo_url,
        COALESCE(tm.photo_url, u.avatar_url) as avatar_url,
        tr.id as roster_id, tr.position, tr.jersey_number, tr.is_captain, tr.is_assistant,
        (
          SELECT string_agg(trole.role, ', ') 
          FROM team_roles trole 
          WHERE trole.member_id = tm.id AND trole.left_at IS NULL
        ) as roles
      FROM team_members tm
      JOIN users u ON u.id = tm.user_id
      LEFT JOIN team_rosters tr ON tm.id = tr.member_id AND tr.left_at IS NULL
      WHERE tm.team_id = $1 AND u.id = $2 AND tm.left_at IS NULL
    `;

    const { rows } = await pool.query(query, [teamId, userId]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'РЈС‡Р°СЃС‚РЅРёРє РєРѕРјР°РЅРґС‹ РЅРµ РЅР°Р№РґРµРЅ' });
    }

    const memberData = rows[0];

    // Р•СЃР»Рё Сѓ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РЅРµС‚ РїСЂР°РІ (РёР»Рё РЅРµС‚ РїРѕРґРїРёСЃРєРё) вЂ” СЃРєСЂС‹РІР°РµРј РІРёСЂС‚СѓР°Р»СЊРЅС‹Р№ РєРѕРґ
    if (!canViewVirtualCode) {
      delete memberData.virtual_code;
    }

    res.json({ 
      success: true, 
      member: memberData, 
      isManager: canViewVirtualCode,
      isOwnProfile: reqUserId === memberData.user_id,
      permissions: {
        canEditRoles,
        canEditGameProfile,
        canEditHeader
      }
    });
  } catch (error) {
    console.error('[Get Team Member Details Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// РЎС‚Р°С‚РёСЃС‚РёРєР° РёРіСЂРѕРєР° РІРЅСѓС‚СЂРё РєРѕРЅРєСЂРµС‚РЅРѕР№ РєРѕРјР°РЅРґС‹ (РїР°РЅРµР»СЊ "РЎС‚Р°С‚РёСЃС‚РёРєР° РІ РєРѕРјР°РЅРґРµ").
// РџРѕРєР° СЃС‡РёС‚Р°РµРј РїРѕСЃРµС‰Р°РµРјРѕСЃС‚СЊ РєРѕРјР°РЅРґРЅС‹С… С‚СЂРµРЅРёСЂРѕРІРѕРє Рё РјР°С‚С‡РµР№; РІ Р±СѓРґСѓС‰РµРј СЃСЋРґР° Р¶Рµ
// РґРѕР±Р°РІСЏС‚СЃСЏ РґСЂСѓРіРёРµ Р±Р»РѕРєРё (СЃРѕР±СЂР°РЅРёСЏ Рё С‚.Рї.).
//
// РўСЂРµРЅРёСЂРѕРІРєРё Рё РќР•РѕС„РёС†РёР°Р»СЊРЅС‹Рµ РјР°С‚С‡Рё (friendly_pwa/friendly_ext/tournament_ext)
// СЃС‡РёС‚Р°РµРј С‚РѕР»СЊРєРѕ Р·Р° С‚Рµ РїРµСЂРёРѕРґС‹, РєРѕРіРґР° РёРіСЂРѕРє СЂРµР°Р»СЊРЅРѕ С‡РёСЃР»РёР»СЃСЏ РІ РёРіСЂРѕРІРѕРј СЃРѕСЃС‚Р°РІРµ
// РєРѕРјР°РЅРґС‹ (team_rosters): Р·Р°РєСЂС‹С‚С‹Рµ РїРµСЂРёРѕРґС‹ Р±РµСЂС‘Рј РёР· РёСЃС‚РѕСЂРёРё team_roster_periods
// (РµС‘ Р·Р°РїРѕР»РЅСЏРµС‚ Р‘Р”-С‚СЂРёРіРіРµСЂ trg_team_rosters_close_period РїСЂРё РєР°Р¶РґРѕРј РёСЃРєР»СЋС‡РµРЅРёРё
// РёРіСЂРѕРєР° вЂ” РёР· Р»СЋР±РѕРіРѕ РїСЂРёР»РѕР¶РµРЅРёСЏ, Team-Room РёР»Рё LMS), С‚РµРєСѓС‰РёР№ РЅРµР·Р°РєСЂС‹С‚С‹Р№ РїРµСЂРёРѕРґ вЂ”
// РЅР°РїСЂСЏРјСѓСЋ РёР· team_rosters.left_at IS NULL.
//
// РћР¤РР¦РРђР›Р¬РќР«Р• РјР°С‚С‡Рё (game_type = 'official', РїСЂРёРІСЏР·Р°РЅС‹ Рє РґРёРІРёР·РёРѕРЅСѓ) СЃС‡РёС‚Р°РµРј
// РїРѕ РґСЂСѓРіРѕРјСѓ РєСЂРёС‚РµСЂРёСЋ вЂ” РЅРµ РїРѕ team_rosters, Р° РїРѕ С„Р°РєС‚Сѓ РѕРґРѕР±СЂРµРЅРЅРѕР№ Р·Р°СЏРІРєРё
// РёРіСЂРѕРєР° РЅР° РґРёРІРёР·РёРѕРЅ (tournament_rosters.application_status = 'approved',
// tournament_team_id -> tournament_teams.division_id), СЃ СѓС‡С‘С‚РѕРј period_start/
// period_end Р·Р°СЏРІРєРё, РµСЃР»Рё РѕРЅРё Р·Р°РґР°РЅС‹ (С‡Р°СЃС‚РёС‡РЅР°СЏ Р·Р°СЏРІРєР° РЅР° С‡Р°СЃС‚СЊ СЃРµР·РѕРЅР°).
//
// В«РџРѕСЃРµС‚РёР»В» РјР°С‚С‡ вЂ” РќР• РѕС‚РјРµС‚РєР° РІ team_game_attendance (СЌС‚Рѕ С‚РѕР»СЊРєРѕ РѕРїСЂРѕСЃ
// РЅР°РјРµСЂРµРЅРёР№ РґРѕ С„РѕСЂРјРёСЂРѕРІР°РЅРёСЏ СЃРѕСЃС‚Р°РІР°), Р° С„Р°РєС‚ РїРѕРїР°РґР°РЅРёСЏ РІ РёС‚РѕРіРѕРІС‹Р№ РїСЂРѕС‚РѕРєРѕР»
// РјР°С‚С‡Р°: РЅР°Р»РёС‡РёРµ СЃС‚СЂРѕРєРё РІ game_rosters (game_id + player_id + team_id).
// РРіСЂРѕРє РјРѕРі РѕС‚РјРµС‚РёС‚СЊСЃСЏ РЅР° РёРіСЂСѓ, РЅРѕ РЅРµ РїРѕРїР°СЃС‚СЊ РІ СЃРѕСЃС‚Р°РІ вЂ” СЌС‚Рѕ РЅРµ СЃС‡РёС‚Р°РµС‚СЃСЏ.
//
// РњР°С‚С‡Рё РѕС‚РґР°СЋС‚СЃСЏ С„СЂРѕРЅС‚Сѓ РЎР«Р Р«Рњ СЃРїРёСЃРєРѕРј СЃ "Р±РёСЂРєР°РјРё" (Р»РёРіР°/СЃРµР·РѕРЅ/РґРёРІРёР·РёРѕРЅ РёР»Рё
// РІРЅРµС€РЅРёР№ С‚СѓСЂРЅРёСЂ) вЂ” РїРѕСЃРµС‰Р°РµРјРѕСЃС‚СЊ, РїРѕР±РµРґС‹/РЅРёС‡СЊРё/РїРѕСЂР°Р¶РµРЅРёСЏ Рё С„РёР»СЊС‚СЂ РїРѕ С‚СѓСЂРЅРёСЂСѓ
// СЃС‡РёС‚Р°СЋС‚СЃСЏ РІ Р±СЂР°СѓР·РµСЂРµ РїСЂРё РїРµСЂРµРєР»СЋС‡РµРЅРёРё С„РёР»СЊС‚СЂР°, Р±РµР· РїРѕРІС‚РѕСЂРЅС‹С… Р·Р°РїСЂРѕСЃРѕРІ.
export const getMemberTeamStats = async (req, res) => {
  const { teamId, userId } = req.params;

  try {
    const infoQuery = `
      SELECT
        u.first_name, u.last_name, u.middle_name,
        COALESCE(tm.photo_url, u.avatar_url) as avatar_url
      FROM team_members tm
      JOIN users u ON u.id = tm.user_id
      WHERE tm.team_id = $1 AND tm.user_id = $2
    `;

    const trainingQuery = `
      WITH member AS (
        SELECT id AS member_id FROM team_members WHERE team_id = $1 AND user_id = $2
      ),
      periods AS (
        SELECT trp.joined_at, trp.left_at::timestamp AS left_at
        FROM team_roster_periods trp, member
        WHERE trp.team_id = $1 AND trp.member_id = member.member_id
        UNION ALL
        SELECT tr.joined_at, NULL::timestamp AS left_at
        FROM team_rosters tr, member
        WHERE tr.team_id = $1 AND tr.member_id = member.member_id AND tr.left_at IS NULL
      )
      SELECT
        COUNT(DISTINCT tt.id) AS total,
        COUNT(DISTINCT ta.team_training_id) AS attended
      FROM team_training tt
      JOIN periods p ON tt.training_date >= p.joined_at AND (p.left_at IS NULL OR tt.training_date < p.left_at)
      LEFT JOIN team_training_attendance ta ON ta.team_training_id = tt.id AND ta.user_id = $2
      WHERE tt.team_id = $1
    `;

    // Р•РґРёРЅС‹Р№ СЃРїРёСЃРѕРє Р’РЎР•РҐ РґРѕСЃС‚СѓРїРЅС‹С… РґР»СЏ РїРѕРґСЃС‡С‘С‚Р° РјР°С‚С‡РµР№ (РЅРµ С‚РѕР»СЊРєРѕ СЃС‹РіСЂР°РЅРЅС‹С…)
    // СЃ "Р±РёСЂРєР°РјРё" Р»РёРіРё/СЃРµР·РѕРЅР°/РґРёРІРёР·РёРѕРЅР° РёР»Рё РІРЅРµС€РЅРµРіРѕ С‚СѓСЂРЅРёСЂР° вЂ” РѕС‚РґР°С‘Рј РµРіРѕ
    // С„СЂРѕРЅС‚Сѓ С†РµР»РёРєРѕРј (variant Р‘), Р° РїРѕСЃРµС‰Р°РµРјРѕСЃС‚СЊ/СЂРµР·СѓР»СЊС‚Р°С‚С‹/С„РёР»СЊС‚СЂ РїРѕ С‚СѓСЂРЅРёСЂСѓ
    // СЃС‡РёС‚Р°СЋС‚СЃСЏ СѓР¶Рµ РІ Р±СЂР°СѓР·РµСЂРµ РїСЂРё РїРµСЂРµРєР»СЋС‡РµРЅРёРё С„РёР»СЊС‚СЂР°, Р±РµР· РЅРѕРІС‹С… Р·Р°РїСЂРѕСЃРѕРІ.
    //
    // РћС„РёС†РёР°Р»СЊРЅС‹Рµ вЂ” С‡РµСЂРµР· division_periods (РѕРґРѕР±СЂРµРЅРЅР°СЏ Р·Р°СЏРІРєР° РЅР° РґРёРІРёР·РёРѕРЅ),
    // РЅРµРѕС„РёС†РёР°Р»СЊРЅС‹Рµ (friendly_pwa/friendly_ext/tournament_ext) вЂ” С‡РµСЂРµР·
    // roster_periods (С‚РѕС‚ Р¶Рµ РєСЂРёС‚РµСЂРёР№, С‡С‚Рѕ Рё Сѓ С‚СЂРµРЅРёСЂРѕРІРѕРє). "РџРѕСЃРµС‚РёР»" (attended)
    // РІ РѕР±РµРёС… РІРµС‚РєР°С… вЂ” РЅР°Р»РёС‡РёРµ СЃС‚СЂРѕРєРё РІ game_rosters, РєР°Рє РґРѕРіРѕРІРѕСЂРёР»РёСЃСЊ СЂР°РЅСЊС€Рµ.
    const matchesQuery = `
      WITH member AS (
        SELECT id AS member_id FROM team_members WHERE team_id = $1 AND user_id = $2
      ),
      roster_periods AS (
        SELECT trp.joined_at, trp.left_at::timestamp AS left_at
        FROM team_roster_periods trp, member
        WHERE trp.team_id = $1 AND trp.member_id = member.member_id
        UNION ALL
        SELECT tr.joined_at, NULL::timestamp AS left_at
        FROM team_rosters tr, member
        WHERE tr.team_id = $1 AND tr.member_id = member.member_id AND tr.left_at IS NULL
      ),
      division_periods AS (
        SELECT tt.division_id, tro.period_start, tro.period_end
        FROM tournament_rosters tro
        JOIN tournament_teams tt ON tro.tournament_team_id = tt.id
        WHERE tt.team_id = $1 AND tro.player_id = $2 AND tro.application_status = 'approved'
      )
      SELECT
        g.id, g.game_date, g.game_type,
        CASE WHEN g.home_team_id = $1 THEN g.home_score ELSE g.away_score END AS my_score,
        CASE WHEN g.home_team_id = $1 THEN g.away_score ELSE g.home_score END AS opp_score,
        CASE WHEN g.home_team_id = $1
          THEN COALESCE(t_away.short_name, t_away.name, eo.short_name, eo.name, g.external_title)
          ELSE COALESCE(t_home.short_name, t_home.name)
        END AS opponent_name,
        (gr.id IS NOT NULL) AS attended,
        d.id AS division_id, d.name AS division_name, d.logo_url AS division_logo, s.name AS season_name, l.short_name AS league_name,
        NULL::int AS ext_tournament_id, NULL::text AS ext_tournament_name, NULL::text AS ext_tournament_logo
      FROM games g
      JOIN division_periods dp ON dp.division_id = g.division_id
        AND (dp.period_start IS NULL OR g.game_date::date >= dp.period_start)
        AND (dp.period_end IS NULL OR g.game_date::date <= dp.period_end)
      LEFT JOIN game_rosters gr ON gr.game_id = g.id AND gr.player_id = $2 AND gr.team_id = $1
      LEFT JOIN divisions d ON g.division_id = d.id
      LEFT JOIN seasons s ON d.season_id = s.id
      LEFT JOIN leagues l ON s.league_id = l.id
      LEFT JOIN teams t_home ON g.home_team_id = t_home.id
      LEFT JOIN teams t_away ON g.away_team_id = t_away.id
      LEFT JOIN external_opponents eo ON g.away_external_id = eo.id
      WHERE g.status = 'finished' AND g.game_type = 'official' AND (g.home_team_id = $1 OR g.away_team_id = $1)

      UNION ALL

      SELECT
        g.id, g.game_date, g.game_type,
        CASE WHEN g.home_team_id = $1 THEN g.home_score ELSE g.away_score END AS my_score,
        CASE WHEN g.home_team_id = $1 THEN g.away_score ELSE g.home_score END AS opp_score,
        CASE WHEN g.home_team_id = $1
          THEN COALESCE(t_away.short_name, t_away.name, eo.short_name, eo.name, g.external_title)
          ELSE COALESCE(t_home.short_name, t_home.name)
        END AS opponent_name,
        (gr.id IS NOT NULL) AS attended,
        NULL::int AS division_id, NULL::text AS division_name, NULL::text AS division_logo, NULL::text AS season_name, NULL::text AS league_name,
        et.id AS ext_tournament_id, et.name AS ext_tournament_name, et.logo_url AS ext_tournament_logo
      FROM games g
      JOIN roster_periods p ON g.game_date >= p.joined_at AND (p.left_at IS NULL OR g.game_date < p.left_at)
      LEFT JOIN game_rosters gr ON gr.game_id = g.id AND gr.player_id = $2 AND gr.team_id = $1
      LEFT JOIN team_external_tournaments et ON g.external_tournament_id = et.id
      LEFT JOIN teams t_home ON g.home_team_id = t_home.id
      LEFT JOIN teams t_away ON g.away_team_id = t_away.id
      LEFT JOIN external_opponents eo ON g.away_external_id = eo.id
      WHERE g.status = 'finished'
        AND g.game_type IN ('friendly_pwa', 'friendly_ext', 'tournament_ext')
        AND (g.home_team_id = $1 OR g.away_team_id = $1)

      ORDER BY game_date DESC
    `;

    const [infoRes, trainingRes, matchesRes] = await Promise.all([
      pool.query(infoQuery, [teamId, userId]),
      pool.query(trainingQuery, [teamId, userId]),
      pool.query(matchesQuery, [teamId, userId]),
    ]);

    if (infoRes.rows.length === 0) {
      return res.status(404).json({ error: 'РЈС‡Р°СЃС‚РЅРёРє РєРѕРјР°РЅРґС‹ РЅРµ РЅР°Р№РґРµРЅ' });
    }

    const toCounts = (total, attended) => {
      const t = Number(total || 0);
      const a = Number(attended || 0);
      return { total: t, attended: a, percent: t > 0 ? Math.round((a / t) * 100) : null };
    };

    const trainingTotal = Number(trainingRes.rows[0]?.total || 0);
    const trainingAttended = Number(trainingRes.rows[0]?.attended || 0);

    const matches = matchesRes.rows.map(row => ({
      gameId: row.id,
      gameDate: row.game_date,
      gameType: row.game_type,
      myScore: Number(row.my_score),
      oppScore: Number(row.opp_score),
      opponentName: row.opponent_name,
      attended: row.attended,
      division: row.division_id != null
        ? { id: row.division_id, name: row.division_name, logo: row.division_logo, seasonName: row.season_name, leagueName: row.league_name }
        : null,
      externalTournament: row.ext_tournament_id != null
        ? { id: row.ext_tournament_id, name: row.ext_tournament_name, logo: row.ext_tournament_logo }
        : null
    }));

    res.json({
      success: true,
      info: infoRes.rows[0],
      training: toCounts(trainingTotal, trainingAttended),
      matches
    });
  } catch (error) {
    console.error('[Get Member Team Stats Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// РРЅС‚РµСЂР°РєС‚РёРІРЅРѕРµ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРѕРµ СЃРѕС…СЂР°РЅРµРЅРёРµ РїР°СЂР°РјРµС‚СЂРѕРІ СѓС‡Р°СЃС‚РЅРёРєР° РєРѕРјР°РЅРґС‹ СЂСѓРєРѕРІРѕРґРёС‚РµР»РµРј / Р°РґРјРёРЅРѕРј
export const updateMemberDetails = async (req, res) => {
  const { teamId, memberId } = req.params;
  const { position, jerseyNumber, roles, isCaptain, isAssistant } = req.body;
  const reqUserId = req.user?.id;

  try {
    await pool.query('BEGIN');

    // 1. РџР РћР’Р•Р РљРђ РџР РђР’ Р”Р›РЇ РР“Р РћР’РћР“Рћ РџР РћР¤РР›Р¬РќРћР“Рћ Р‘Р›РћРљРђ
    if (position !== undefined || jerseyNumber !== undefined) {
      const hasAccess = await checkPermissionInternal(reqUserId, teamId, 'EDIT_USER_BLOCK_HOCKEY');
      if (!hasAccess) {
        return res.status(403).json({ error: 'РќРµРґРѕСЃС‚Р°С‚РѕС‡РЅРѕ РїСЂР°РІ РёР»Рё С‚СЂРµР±СѓРµС‚СЃСЏ РїСЂРѕРґР»РёС‚СЊ РїРѕРґРїРёСЃРєСѓ РґР»СЏ РёР·РјРµРЅРµРЅРёСЏ РёРіСЂРѕРІРѕРіРѕ РїСЂРѕС„РёР»СЏ' });
      }

      if (jerseyNumber) {
        const numCheck = await pool.query(
          `SELECT 1 FROM team_rosters 
           WHERE team_id = $1 AND jersey_number = $2 AND member_id != $3 AND left_at IS NULL`,
          [teamId, jerseyNumber, memberId]
        );
        if (numCheck.rows.length > 0) {
          return res.status(400).json({ error: 'Р­С‚РѕС‚ РёРіСЂРѕРІРѕР№ РЅРѕРјРµСЂ СѓР¶Рµ Р·Р°РЅСЏС‚ РґСЂСѓРіРёРј Р°РєС‚РёРІРЅС‹Рј РёРіСЂРѕРєРѕРј' });
        }
      }

      await pool.query(
        `UPDATE team_rosters 
         SET position = COALESCE($1, position), 
             jersey_number = COALESCE($2, jersey_number)
         WHERE member_id = $3 AND team_id = $4 AND left_at IS NULL`,
        [position, jerseyNumber, memberId, teamId]
      );
    }

    // 2. РџР РћР’Р•Р РљРђ РџР РђР’ Р”Р›РЇ Р‘Р›РћРљРђ РЁРђРџРљР/РљРђРџРРўРђРќРЎРўР’Рђ
    if (isCaptain !== undefined || isAssistant !== undefined) {
      const hasAccess = await checkPermissionInternal(reqUserId, teamId, 'EDIT_USER_BLOCK_BASE');
      if (!hasAccess) {
        return res.status(403).json({ error: 'РќРµРґРѕСЃС‚Р°С‚РѕС‡РЅРѕ РїСЂР°РІ РёР»Рё С‚СЂРµР±СѓРµС‚СЃСЏ РїСЂРѕРґР»РёС‚СЊ РїРѕРґРїРёСЃРєСѓ РґР»СЏ РёР·РјРµРЅРµРЅРёСЏ РєР°РїРёС‚Р°РЅСЃРєРёС… СЃС‚Р°С‚СѓСЃРѕРІ' });
      }

      if (isCaptain !== undefined) {
        if (isCaptain === true) {
          await pool.query(
            `UPDATE team_rosters SET is_captain = false WHERE team_id = $1 AND left_at IS NULL`,
            [teamId]
          );
          await pool.query(
            `UPDATE team_rosters SET is_captain = true, is_assistant = false WHERE member_id = $1 AND team_id = $2 AND left_at IS NULL`,
            [memberId, teamId]
          );
        } else {
          await pool.query(
            `UPDATE team_rosters SET is_captain = false WHERE member_id = $1 AND team_id = $2 AND left_at IS NULL`,
            [memberId, teamId]
          );
        }
      }

      if (isAssistant !== undefined) {
        if (isAssistant === true) {
          const assistCheck = await pool.query(
            `SELECT COUNT(*) FROM team_rosters 
             WHERE team_id = $1 AND is_assistant = true AND member_id != $2 AND left_at IS NULL`,
            [teamId, memberId]
          );
          if (parseInt(assistCheck.rows[0].count) >= 2) {
            return res.status(400).json({ error: 'Р’ СЂРѕСЃС‚РµСЂРµ РєРѕРјР°РЅРґС‹ СѓР¶Рµ Р·Р°С„РёРєСЃРёСЂРѕРІР°РЅРѕ 2 Р°СЃСЃРёСЃС‚РµРЅС‚Р°' });
          }
          await pool.query(
            `UPDATE team_rosters SET is_assistant = true, is_captain = false WHERE member_id = $1 AND team_id = $2 AND left_at IS NULL`,
            [memberId, teamId]
          );
        } else {
          await pool.query(
            `UPDATE team_rosters SET is_assistant = false WHERE member_id = $1 AND team_id = $2 AND left_at IS NULL`,
            [memberId, teamId]
          );
        }
      }
    }

    // 3. РџР РћР’Р•Р РљРђ РџР РђР’ Р”Р›РЇ РђР”РњРРќРРЎРўР РђРўРР’РќР«РҐ РЎРўРђРўРЈРЎРћР’ (РЈРїСЂР°РІР»РµРЅРёРµ СЂРѕР»СЏРјРё)
    if (roles !== undefined) {
      const hasAccess = await checkPermissionInternal(reqUserId, teamId, 'EDIT_USER_BLOCK_ROLES');
      if (!hasAccess) {
        return res.status(403).json({ error: 'РќРµРґРѕСЃС‚Р°С‚РѕС‡РЅРѕ РїСЂР°РІ РёР»Рё С‚СЂРµР±СѓРµС‚СЃСЏ РїСЂРѕРґР»РёС‚СЊ РїРѕРґРїРёСЃРєСѓ РґР»СЏ РёР·РјРµРЅРµРЅРёСЏ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РёРІРЅРѕРіРѕ СЃС‚Р°С‚СѓСЃР°' });
      }

      const memberUserRes = await pool.query(
        `SELECT user_id FROM team_members WHERE id = $1`,
        [memberId]
      );
      
      const rolesArray = roles.split(',').map(r => r.trim()).filter(Boolean);

      // Р—Р°С‰РёС‚Р° РѕС‚ СЃР°РјРѕСЂР°Р·Р¶Р°Р»РѕРІР°РЅРёСЏ СЂСѓРєРѕРІРѕРґРёС‚РµР»СЏ
      if (memberUserRes.rows.length > 0 && memberUserRes.rows[0].user_id === reqUserId) {
        if (!rolesArray.includes('team_manager')) {
          return res.status(400).json({ error: 'Р’С‹ РЅРµ РјРѕР¶РµС‚Рµ Р»РёС€РёС‚СЊ СЃР°РјРѕРіРѕ СЃРµР±СЏ СЂРѕР»Рё Р СѓРєРѕРІРѕРґРёС‚РµР»СЏ РєРѕРјР°РЅРґС‹' });
        }
      }

      if (rolesArray.length > 0) {
        await pool.query(
          `UPDATE team_roles 
           SET left_at = CURRENT_DATE 
           WHERE member_id = $1 AND left_at IS NULL AND NOT (role = ANY($2))`,
          [memberId, rolesArray]
        );
      } else {
        await pool.query(
          `UPDATE team_roles 
           SET left_at = CURRENT_DATE 
           WHERE member_id = $1 AND left_at IS NULL`,
          [memberId]
        );
      }

      for (const role of rolesArray) {
        await pool.query(
          `INSERT INTO team_roles (member_id, role, joined_at, left_at) 
           VALUES ($1, $2, NOW(), NULL)
           ON CONFLICT (member_id, role) 
           DO UPDATE SET left_at = NULL`,
          [memberId, role]
        );
      }
    }

    await pool.query('COMMIT');
    res.json({ success: true, message: 'РР·РјРµРЅРµРЅРёСЏ СѓСЃРїРµС€РЅРѕ СЃРѕС…СЂР°РЅРµРЅС‹' });
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('[Update Member Details Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Р’СЃРїРѕРјРѕРіР°С‚РµР»СЊРЅС‹Р№ РјРµС‚РѕРґ Р·Р°РіСЂСѓР·РєРё РІ S3-С…СЂР°РЅРёР»РёС‰Рµ
const uploadBufferToS3 = async (file, bucketKey) => {
  const params = {
    Bucket: process.env.S3_BUCKET || 'hockeyeco-s3-storage',
    Key: bucketKey,
    Body: file.buffer,
    ContentType: file.mimetype,
    ACL: 'public-read'
  };

  if (s3 && typeof s3.send === 'function') {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    return s3.send(new PutObjectCommand(params));
  }
  if (s3 && typeof s3.putObject === 'function') {
    const request = s3.putObject(params);
    return typeof request.promise === 'function' ? request.promise() : request;
  }
  throw new Error('S3 Client РЅРµ РЅР°СЃС‚СЂРѕРµРЅ РЅР° СЃРµСЂРІРµСЂРµ');
};

// РњРµС‚РѕРґ Р·Р°РіСЂСѓР·РєРё/Р·Р°РјРµРЅС‹ РєР°СЃС‚РѕРјРЅРѕР№ Р°РІР°С‚Р°СЂРєРё РёРіСЂРѕРєР° РІ S3
export const updateMemberPhoto = async (req, res) => {
  const { teamId, memberId } = req.params;
  if (!req.file) {
    return res.status(400).json({ error: 'Р¤Р°Р№Р» С„РѕС‚РѕРіСЂР°С„РёРё РЅРµ РїСЂРµРґРѕСЃС‚Р°РІР»РµРЅ' });
  }

  try {
    const memberRes = await pool.query(
      `SELECT user_id FROM team_members WHERE id = $1 AND team_id = $2 AND left_at IS NULL`,
      [memberId, teamId]
    );
    if (memberRes.rows.length === 0) {
      return res.status(404).json({ error: 'РЈС‡Р°СЃС‚РЅРёРє СЃРѕСЃС‚Р°РІР° РЅРµ РЅР°Р№РґРµРЅ РёР»Рё Р·Р°Р°СЂС…РёРІРёСЂРѕРІР°РЅ' });
    }
    const userId = memberRes.rows[0].user_id;

    // Р РµСЃР°Р№Р· РґРѕ 400Г—400 + РєРѕРЅРІРµСЂС‚Р°С†РёСЏ РІ WebP РїРµСЂРµРґ Р·Р°Р»РёРІРєРѕР№ (РІСЃРµРіРґР° .webp)
    const bucketKey = `uploads/teams_${teamId}_users_${userId}_photo.webp`;

    const processedBuffer = await processAvatar(req.file.buffer);
    await uploadBufferToS3({ buffer: processedBuffer, mimetype: 'image/webp' }, bucketKey);
    const photoUrl = `/${bucketKey}`;

    await pool.query(
      `UPDATE team_members SET photo_url = $1 WHERE id = $2 AND team_id = $3`,
      [photoUrl, memberId, teamId]
    );

    res.json({ success: true, photo_url: photoUrl });
  } catch (error) {
    console.error('[Update Member Photo Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// РњРµС‚РѕРґ СѓРґР°Р»РµРЅРёСЏ РєР°СЃС‚РѕРјРЅРѕРіРѕ С„РѕС‚Рѕ СѓС‡Р°СЃС‚РЅРёРєР°
export const deleteMemberPhoto = async (req, res) => {
  const { teamId, memberId } = req.params;
  try {
    await pool.query(
      `UPDATE team_members SET photo_url = NULL WHERE id = $1 AND team_id = $2 AND left_at IS NULL`,
      [memberId, teamId]
    );
    res.json({ success: true, message: 'Р¤РѕС‚РѕРіСЂР°С„РёСЏ СѓСЃРїРµС€РЅРѕ СѓРґР°Р»РµРЅР°' });
  } catch (error) {
    console.error('[Delete Member Photo Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// РћР±РЅРѕРІР»РµРЅРёРµ РІРёР·СѓР°Р»СЊРЅРѕРіРѕ РїСЂРѕС„РёР»СЏ С…РѕРєРєРµР№РЅРѕР№ РєРѕРјР°РЅРґС‹
export const updateTeamProfile = async (req, res) => {
  try {
    const teamId = req.params.id;
    const { 
      name, short_name, city, description, 
      color_home_1, color_home_2, color_away_1, color_away_2,
      delete_logo, delete_jersey_dark, delete_jersey_light
    } = req.body;

    let logo_url = undefined;
    let jersey_dark_url = undefined;
    let jersey_light_url = undefined;

    if (req.files?.['logo']?.[0]) {
      const file = req.files['logo'][0];
      const ext = path.extname(file.originalname) || '.png';
      const key = `uploads/teams_${teamId}_logo${ext}`;
      await uploadBufferToS3(file, key);
      logo_url = `/${key}`;
    } else if (delete_logo === 'true') {
      logo_url = null;
    }

    if (req.files?.['jersey_dark']?.[0]) {
      const file = req.files['jersey_dark'][0];
      const ext = path.extname(file.originalname) || '.png';
      const key = `uploads/teams_${teamId}_jersey_dark${ext}`;
      await uploadBufferToS3(file, key);
      jersey_dark_url = `/${key}`;
    } else if (delete_jersey_dark === 'true') {
      jersey_dark_url = null;
    }

    if (req.files?.['jersey_light']?.[0]) {
      const file = req.files['jersey_light'][0];
      const ext = path.extname(file.originalname) || '.png';
      const key = `uploads/teams_${teamId}_jersey_light${ext}`;
      await uploadBufferToS3(file, key);
      jersey_light_url = `/${key}`;
    } else if (delete_jersey_light === 'true') {
      jersey_light_url = null;
    }

    const updateFields = [];
    const queryValues = [];
    let counter = 1;

    const pushField = (columnName, value) => {
      if (value !== undefined) {
        updateFields.push(`"${columnName}" = $${counter}`);
        queryValues.push(value);
        counter++;
      }
    };

    pushField('name', name);
    pushField('short_name', short_name);
    pushField('city', city);
    pushField('description', description);
    pushField('color_home_1', color_home_1);
    pushField('color_home_2', color_home_2);
    pushField('color_away_1', color_away_1);
    pushField('color_away_2', color_away_2);

    if (logo_url !== undefined) pushField('logo_url', logo_url);
    if (jersey_dark_url !== undefined) pushField('jersey_dark_url', jersey_dark_url);
    if (jersey_light_url !== undefined) pushField('jersey_light_url', jersey_light_url);

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    queryValues.push(teamId);
    const sqlQuery = `
      UPDATE teams 
      SET ${updateFields.join(', ')}, updated_at = NOW() 
      WHERE id = $${counter} 
      RETURNING *
    `;

    const { rows } = await pool.query(sqlQuery, queryValues);
    res.json({ success: true, team: rows[0] });

  } catch (error) {
    console.error('[Update Team Profile Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// РСЃРєР»СЋС‡РµРЅРёРµ СѓС‡Р°СЃС‚РЅРёРєР° РёР· РёРіСЂРѕРІРѕРіРѕ СЂРѕСЃС‚РµСЂР° РЅР° С‚СѓСЂРЅРёСЂ
export const excludeFromRoster = async (req, res) => {
  const { teamId, memberId } = req.params;
  try {
    const updateRosterQuery = `
      UPDATE team_rosters 
      SET left_at = CURRENT_DATE 
      WHERE member_id = $1 AND team_id = $2 AND left_at IS NULL
    `;
    await pool.query(updateRosterQuery, [memberId, teamId]);
    res.json({ success: true, message: 'РРіСЂРѕРє СѓСЃРїРµС€РЅРѕ РёСЃРєР»СЋС‡РµРЅ РёР· С‚СѓСЂРЅРёСЂРЅРѕРіРѕ СЂРѕСЃС‚РµСЂР°' });
  } catch (error) {
    console.error('[Exclude From Roster Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// РџРѕР»РЅРѕРµ РёСЃРєР»СЋС‡РµРЅРёРµ РёР· С‡Р»РµРЅСЃС‚РІР° РєРѕРјР°РЅРґС‹ (СЃРѕСЃС‚Р°РІ + СЂРѕСЃС‚РµСЂ)
export const excludeFromMembership = async (req, res) => {
  const { teamId, memberId } = req.params;
  try {
    await pool.query('BEGIN');

    const updateMemberQuery = `
      UPDATE team_members 
      SET left_at = CURRENT_DATE 
      WHERE id = $1 AND team_id = $2 AND left_at IS NULL
    `;
    await pool.query(updateMemberQuery, [memberId, teamId]);

    const updateRosterQuery = `
      UPDATE team_rosters 
      SET left_at = CURRENT_DATE 
      WHERE member_id = $1 AND team_id = $2 AND left_at IS NULL
    `;
    await pool.query(updateRosterQuery, [memberId, teamId]);

    await pool.query('COMMIT');

    // Push: СѓС‡Р°СЃС‚РЅРёРє РїРѕРєРёРЅСѓР» РєРѕРјР°РЅРґСѓ
    const { rows: [excluded] } = await pool.query(
      'SELECT u.last_name, u.first_name FROM team_members tm JOIN users u ON u.id = tm.user_id WHERE tm.id = $1',
      [memberId]
    );
    const eName = excluded ? `${excluded.last_name} ${excluded.first_name}` : 'РЈС‡Р°СЃС‚РЅРёРє';
    sendPushToTeamExcept(teamId, null, 'team_news', {
      title: 'РЈС…РѕРґ РёР· РєРѕРјР°РЅРґС‹', body: `${eName} РїРѕРєРёРЅСѓР» РєРѕРјР°РЅРґСѓ`,
      url: '/my-team', tag: `member-leave-${memberId}`,
    }).catch(() => {});

    res.json({ success: true, message: 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РїРѕР»РЅРѕСЃС‚СЊСЋ СѓРґР°Р»РµРЅ РёР· СЃРѕСЃС‚Р°РІР° Рё СЂРѕСЃС‚РµСЂРѕРІ РєРѕРјР°РЅРґС‹' });
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('[Exclude From Membership Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// РџРѕРёСЃРє Р·Р°СЂРµРіРёСЃС‚СЂРёСЂРѕРІР°РЅРЅРѕРіРѕ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РїРѕ РЅРѕРјРµСЂСѓ С‚РµР»РµС„РѕРЅР°
export const searchUserByPhone = async (req, res) => {
  const { teamId } = req.params;
  const { phone } = req.query;

  if (!phone) {
    return res.status(400).json({ error: 'РџР°СЂР°РјРµС‚СЂ phone РѕР±СЏР·Р°С‚РµР»РµРЅ' });
  }

  try {
    const cleanPhone = phone.replace(/\D/g, '');
    const last10Digits = cleanPhone.slice(-10);

    const query = `
      SELECT u.id, u.first_name, u.last_name, u.avatar_url, u.virtual_code, u.status,
             (tm.id IS NOT NULL AND tm.left_at IS NULL) as is_already_in_team,
             (tm.id IS NOT NULL AND tm.left_at IS NOT NULL) as is_archived_in_team
      FROM users u
      LEFT JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = $1
      WHERE right(regexp_replace(u.phone, '\\D', '', 'g'), 10) = $2
      LIMIT 1
    `;

    const { rows } = await pool.query(query, [teamId, last10Digits]);

    if (rows.length === 0) {
      return res.json({ success: false, message: 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ СЃ С‚Р°РєРёРј РЅРѕРјРµСЂРѕРј РЅРµ Р·Р°СЂРµРіРёСЃС‚СЂРёСЂРѕРІР°РЅ' });
    }

    res.json({ success: true, user: rows[0] });
  } catch (error) {
    console.error('[Search User By Phone Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Р”РѕР±Р°РІР»РµРЅРёРµ РёР»Рё РІРѕСЃСЃС‚Р°РЅРѕРІР»РµРЅРёРµ С‡Р»РµРЅСЃС‚РІР° РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РІ РєРѕРјР°РЅРґРµ
export const addOrRestoreTeamMember = async (req, res) => {
  const { teamId } = req.params;
  const { userId } = req.body;

  try {
    const checkQuery = `SELECT id, left_at FROM team_members WHERE team_id = $1 AND user_id = $2`;
    const { rows } = await pool.query(checkQuery, [teamId, userId]);

    if (rows.length > 0) {
      const existing = rows[0];
      if (existing.left_at === null) {
        return res.status(400).json({ error: 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ СѓР¶Рµ РЅР°С…РѕРґРёС‚СЃСЏ РІ СЃРѕСЃС‚Р°РІРµ РєРѕРјР°РЅРґС‹' });
      }

      await pool.query(
        `UPDATE team_members SET left_at = NULL, joined_at = CURRENT_DATE WHERE id = $1`, 
        [existing.id]
      );
      // Push: СѓС‡Р°СЃС‚РЅРёРє РІРµСЂРЅСѓР»СЃСЏ
      const { rows: [restored] } = await pool.query('SELECT last_name, first_name FROM users WHERE id = $1', [userId]);
      const rName = restored ? `${restored.last_name} ${restored.first_name}` : 'РЈС‡Р°СЃС‚РЅРёРє';
      sendPushToTeamExcept(teamId, userId, 'team_news', {
        title: 'Р’РѕР·РІСЂР°С‰РµРЅРёРµ РІ РєРѕРјР°РЅРґСѓ', body: `${rName} РІРµСЂРЅСѓР»СЃСЏ РІ СЃРѕСЃС‚Р°РІ`,
        url: '/my-team', tag: `member-join-${userId}`,
      }).catch(() => {});

      return res.json({ success: true, message: 'Р§Р»РµРЅСЃС‚РІРѕ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РІ РєРѕРјР°РЅРґРµ СѓСЃРїРµС€РЅРѕ РІРѕСЃСЃС‚Р°РЅРѕРІР»РµРЅРѕ' });
    }

    await pool.query(
      `INSERT INTO team_members (team_id, user_id, joined_at) VALUES ($1, $2, CURRENT_DATE)`,
      [teamId, userId]
    );

    // Push: РЅРѕРІС‹Р№ СѓС‡Р°СЃС‚РЅРёРє
    const { rows: [added] } = await pool.query('SELECT last_name, first_name FROM users WHERE id = $1', [userId]);
    const aName = added ? `${added.last_name} ${added.first_name}` : 'РќРѕРІС‹Р№ СѓС‡Р°СЃС‚РЅРёРє';
    sendPushToTeamExcept(teamId, userId, 'team_news', {
      title: 'РќРѕРІС‹Р№ СѓС‡Р°СЃС‚РЅРёРє', body: `${aName} РґРѕР±Р°РІР»РµРЅ РІ СЃРѕСЃС‚Р°РІ`,
      url: '/my-team', tag: `member-join-${userId}`,
    }).catch(() => {});

    res.json({ success: true, message: 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ СѓСЃРїРµС€РЅРѕ РґРѕР±Р°РІР»РµРЅ РІ СЃРѕСЃС‚Р°РІ РєРѕРјР°РЅРґС‹' });
  } catch (error) {
    console.error('[Add/Restore Member Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Р’РєР»СЋС‡РµРЅРёРµ С‡Р»РµРЅР° РѕСЃРЅРѕРІРЅРѕРіРѕ СЃРѕСЃС‚Р°РІР° РІ С‚СѓСЂРЅРёСЂРЅС‹Р№ РёРіСЂРѕРІРѕР№ СЂРѕСЃС‚РµСЂ
export const addTeamMemberToRoster = async (req, res) => {
  const { teamId } = req.params;
  const { memberId, position, jerseyNumber } = req.body;

  try {
    const numCheck = `
      SELECT tr.id FROM team_rosters tr
      WHERE tr.team_id = $1 AND tr.jersey_number = $2 AND tr.left_at IS NULL
    `;
    const { rows: numRows } = await pool.query(numCheck, [teamId, jerseyNumber]);
    if (numRows.length > 0) {
      return res.status(400).json({ error: 'Р­С‚РѕС‚ РёРіСЂРѕРІРѕР№ РЅРѕРјРµСЂ СѓР¶Рµ Р·Р°РЅСЏС‚ Р°РєС‚РёРІРЅС‹Рј РёРіСЂРѕРєРѕРј СЂРѕСЃС‚РµСЂР°' });
    }

    const teamRes = await pool.query(`SELECT club_id FROM teams WHERE id = $1`, [teamId]);
    const clubId = teamRes.rows[0]?.club_id || null;

    const rosterCheck = `SELECT id, left_at FROM team_rosters WHERE member_id = $1`;
    const { rows: rosterRows } = await pool.query(rosterCheck, [memberId]);

    if (rosterRows.length > 0) {
      const existingRoster = rosterRows[0];
      await pool.query(`
        UPDATE team_rosters 
        SET left_at = NULL, team_id = $1, club_id = $2, position = $3, jersey_number = $4, joined_at = NOW()
        WHERE id = $5
      `, [teamId, clubId, position, jerseyNumber, existingRoster.id]);
    } else {
      await pool.query(`
        INSERT INTO team_rosters (club_id, team_id, member_id, position, jersey_number, joined_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
      `, [clubId, teamId, memberId, position, jerseyNumber]);
    }

    res.json({ success: true, message: 'РРіСЂРѕРє СѓСЃРїРµС€РЅРѕ РґРѕР±Р°РІР»РµРЅ РІ Р°РєС‚РёРІРЅС‹Р№ СЂРѕСЃС‚РµСЂ' });
  } catch (error) {
    console.error('[Add Member To Roster Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
