import pool from '../config/db.js';

export const getMyTeams = async (req, res) => {
    try {
        const userId = req.user.id;
        const query = `
            SELECT DISTINCT t.id, t.name, t.logo_url
            FROM teams t
            LEFT JOIN team_members tm ON tm.team_id = t.id AND tm.left_at IS NULL
            LEFT JOIN club_members cm ON cm.club_id = t.club_id AND cm.left_at IS NULL
            WHERE (tm.user_id = $1 OR cm.user_id = $1)
            ORDER BY t.name
        `;
        const { rows } = await pool.query(query, [userId]);
        res.json({ teams: rows });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getTeamDetails = async (req, res) => {
    try {
        const teamId = req.params.id;
        
        // Добавили birth_date, height, weight
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
        
        const [rosterRes, staffRes] = await Promise.all([
            pool.query(rosterQuery, [teamId]),
            pool.query(staffQuery, [teamId])
        ]);
        
        res.json({ roster: rosterRes.rows, staff: staffRes.rows });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
};