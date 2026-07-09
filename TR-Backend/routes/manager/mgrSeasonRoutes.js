import express from 'express';
import { verifyToken, requireTeamPermission } from '../../middleware/auth.js';
import upload from '../../config/upload.js';
import {
  getAvailableDivisions,
  getTeamApplications,
  getApplicationById,
  getTeamRosterForPicker,
  createApplication,
  deleteApplication,
  sendApplicationForReview,
  uploadApplicationPaper,
  deleteApplicationPaper,
  addPlayersToApplication,
  removePlayerFromApplication,
  updateRosterEntry,
  uploadRosterDocs,
  addStaffToApplication,
  removeStaffFromApplication
} from '../../controllers/manager/MgrSeasonController.js';

const router = express.Router();

router.get('/:teamId/available-divisions', verifyToken, requireTeamPermission('MGR_SEASON_ROSTERS'), getAvailableDivisions);
router.get('/:teamId/applications', verifyToken, requireTeamPermission('MGR_SEASON_ROSTERS'), getTeamApplications);
router.post('/:teamId/applications', verifyToken, requireTeamPermission('MGR_SEASON_ROSTERS'), upload.single('file'), createApplication);
router.get('/:teamId/applications/:appId', verifyToken, requireTeamPermission('MGR_SEASON_ROSTERS'), getApplicationById);
router.delete('/:teamId/applications/:appId', verifyToken, requireTeamPermission('MGR_SEASON_ROSTERS'), deleteApplication);
router.post('/:teamId/applications/:appId/send-review', verifyToken, requireTeamPermission('MGR_SEASON_ROSTERS'), sendApplicationForReview);
router.post('/:teamId/applications/:appId/paper', verifyToken, requireTeamPermission('MGR_SEASON_ROSTERS'), upload.single('file'), uploadApplicationPaper);
router.delete('/:teamId/applications/:appId/paper', verifyToken, requireTeamPermission('MGR_SEASON_ROSTERS'), deleteApplicationPaper);

router.get('/:teamId/applications/:appId/roster-picker', verifyToken, requireTeamPermission('MGR_SEASON_ROSTERS'), getTeamRosterForPicker);
router.post('/:teamId/applications/:appId/roster', verifyToken, requireTeamPermission('MGR_SEASON_ROSTERS'), addPlayersToApplication);
router.delete('/:teamId/applications/:appId/roster/:rosterId', verifyToken, requireTeamPermission('MGR_SEASON_ROSTERS'), removePlayerFromApplication);
router.patch('/:teamId/applications/:appId/roster/:rosterId', verifyToken, requireTeamPermission('MGR_SEASON_ROSTERS'), updateRosterEntry);
router.post('/:teamId/applications/:appId/roster/:rosterId/docs', verifyToken, requireTeamPermission('MGR_SEASON_ROSTERS'), upload.fields([
  { name: 'insurance', maxCount: 1 },
  { name: 'medical', maxCount: 1 },
  { name: 'consent', maxCount: 1 }
]), uploadRosterDocs);

router.post('/:teamId/applications/:appId/staff', verifyToken, requireTeamPermission('MGR_SEASON_ROSTERS'), addStaffToApplication);
router.delete('/:teamId/applications/:appId/staff/:userId', verifyToken, requireTeamPermission('MGR_SEASON_ROSTERS'), removeStaffFromApplication);

export default router;
