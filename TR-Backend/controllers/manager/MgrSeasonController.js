import pool from '../../config/db.js';

export const getSeasonApplications = async (req, res) => {
  try {
    const { teamId } = req.params;

    // Заготовка под выборку активных заявок команды на сезон из roster_requests
    return res.status(200).json({
      success: true,
      message: 'Эндпоинт управления сезонными заявками активен (Заглушка)',
      teamId,
      applications: []
    });
  } catch (error) {
    console.error('Error in getSeasonApplications:', error);
    return res.status(500).json({ success: false, error: 'Внутренняя ошибка сервера' });
  }
};