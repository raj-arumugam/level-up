import express, { Request, Response } from 'express';
import { schedulerService } from '../services/schedulerService';
import { authenticateToken } from '../middleware/auth';
import { logger } from '../lib/logger';
import { body, param, query, validationResult } from 'express-validator';

const router = express.Router();

/**
 * @route GET /api/scheduler/status
 * @desc Get scheduler status information
 * @access Private (Admin)
 */
router.get('/status', authenticateToken, async (req: Request, res: Response) => {
  try {
    const status = schedulerService.getSchedulerStatus();
    
    return res.json({
      success: true,
      data: status
    });
  } catch (error: any) {
    console.error('Error getting scheduler status:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get scheduler status'
    });
  }
});

/**
 * @route POST /api/scheduler/start
 * @desc Start the daily update scheduler
 * @access Private (Admin)
 */
router.post('/start', authenticateToken, async (req: Request, res: Response) => {
  try {
    if (schedulerService.isSchedulerRunning()) {
      return res.status(400).json({
        success: false,
        error: 'Scheduler is already running'
      });
    }

    schedulerService.startDailyUpdateScheduler();
    
    return res.json({
      success: true,
      message: 'Daily update scheduler started successfully',
      data: schedulerService.getSchedulerStatus()
    });
  } catch (error: any) {
    console.error('Error starting scheduler:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to start scheduler'
    });
  }
});

/**
 * @route POST /api/scheduler/stop
 * @desc Stop the daily update scheduler
 * @access Private (Admin)
 */
router.post('/stop', authenticateToken, async (req: Request, res: Response) => {
  try {
    if (!schedulerService.isSchedulerRunning()) {
      return res.status(400).json({
        success: false,
        error: 'Scheduler is not running'
      });
    }

    schedulerService.stopDailyUpdateScheduler();
    
    return res.json({
      success: true,
      message: 'Daily update scheduler stopped successfully',
      data: schedulerService.getSchedulerStatus()
    });
  } catch (error: any) {
    console.error('Error stopping scheduler:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to stop scheduler'
    });
  }
});

/**
 * @route POST /api/scheduler/trigger
 * @desc Manually trigger daily updates for all users
 * @access Private (Admin)
 */
router.post('/trigger', authenticateToken, async (req: Request, res: Response) => {
  try {
    console.log(`Manual daily update triggered by user: ${req.user?.id}`);
    
    const stats = await schedulerService.triggerManualDailyUpdate();
    
    return res.json({
      success: true,
      message: 'Daily update process completed',
      data: stats
    });
  } catch (error: any) {
    console.error('Error triggering manual daily update:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to trigger daily update'
    });
  }
});

/**
 * @route POST /api/scheduler/trigger/:userId
 * @desc Manually trigger daily update for a specific user
 * @access Private (Admin)
 */
router.post('/trigger/:userId', 
  authenticateToken,
  [
    param('userId').isString().notEmpty().withMessage('User ID is required')
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const { userId } = req.params;
      
      console.log(`Manual daily update triggered for user ${userId} by admin: ${req.user?.id}`);
      
      await schedulerService.processDailyUpdateForUser(userId);
      
      return res.json({
        success: true,
        message: `Daily update completed for user ${userId}`
      });
    } catch (error: any) {
      console.error(`Error triggering daily update for user ${req.params.userId}:`, error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to trigger daily update for user'
      });
    }
  }
);

/**
 * @route GET /api/scheduler/logs
 * @desc Get recent scheduler execution logs
 * @access Private (Admin)
 */
router.get('/logs', 
  authenticateToken,
  [
    query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('Limit must be between 1 and 1000'),
    query('category').optional().isString().withMessage('Category must be a string')
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const limit = parseInt(req.query.limit as string) || 100;
      const category = req.query.category as string || 'scheduler';

      const logs = await logger.getRecentLogs(category, limit);
      
      return res.json({
        success: true,
        data: {
          logs,
          count: logs.length,
          category,
          limit
        }
      });
    } catch (error: any) {
      console.error('Error getting scheduler logs:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to get scheduler logs'
      });
    }
  }
);

/**
 * @route GET /api/scheduler/stats
 * @desc Get scheduler execution statistics
 * @access Private (Admin)
 */
router.get('/stats',
  authenticateToken,
  [
    query('days').optional().isInt({ min: 1, max: 30 }).withMessage('Days must be between 1 and 30')
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const days = parseInt(req.query.days as string) || 7;
      const stats = await logger.getSchedulerStats(days);
      
      return res.json({
        success: true,
        data: {
          ...stats,
          period: `${days} days`,
          currentStatus: schedulerService.getSchedulerStatus()
        }
      });
    } catch (error: any) {
      console.error('Error getting scheduler stats:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to get scheduler statistics'
      });
    }
  }
);

/**
 * @route GET /api/scheduler/health
 * @desc Health check for scheduler service
 * @access Private (Admin)
 */
router.get('/health', authenticateToken, async (req: Request, res: Response) => {
  try {
    const status = schedulerService.getSchedulerStatus();
    const isHealthy = !status.isProcessing; // Not stuck in processing
    
    return res.status(isHealthy ? 200 : 503).json({
      success: isHealthy,
      data: {
        healthy: isHealthy,
        status: status,
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      }
    });
  } catch (error: any) {
    console.error('Error checking scheduler health:', error);
    return res.status(503).json({
      success: false,
      error: 'Scheduler health check failed',
      data: {
        healthy: false,
        timestamp: new Date().toISOString()
      }
    });
  }
});

export default router;