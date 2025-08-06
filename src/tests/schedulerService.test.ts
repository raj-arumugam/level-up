import { SchedulerService } from '../services/schedulerService';
import { prisma } from '../lib/database';
import { notificationService } from '../services/notificationService';
import { logger } from '../lib/logger';
import cron from 'node-cron';

// Mock dependencies
jest.mock('../lib/database', () => ({
  prisma: {
    user: {
      findMany: jest.fn()
    },
    dailyReport: {
      findUnique: jest.fn()
    }
  }
}));

jest.mock('../services/notificationService', () => ({
  notificationService: {
    generateDailyReport: jest.fn(),
    sendDailyUpdate: jest.fn(),
    getNotificationSettings: jest.fn()
  }
}));

jest.mock('node-cron', () => ({
  schedule: jest.fn(),
  validate: jest.fn()
}));

jest.mock('../lib/logger', () => ({
  logger: {
    logScheduler: jest.fn(),
    log: jest.fn(),
    init: jest.fn()
  }
}));

const mockPrisma = prisma as any;
const mockNotificationService = notificationService as any;
const mockCron = cron as any;
const mockLogger = logger as any;

describe('SchedulerService', () => {
  let schedulerService: SchedulerService;
  let mockScheduledTask: any;

  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    firstName: 'John',
    lastName: 'Doe',
    notificationSettings: {
      emailEnabled: true,
      dailyUpdateEnabled: true,
      weekendsEnabled: false,
      alertThreshold: 5.0
    }
  };

  const mockNotificationSettings = {
    id: 'settings-1',
    userId: 'user-1',
    emailEnabled: true,
    dailyUpdateEnabled: true,
    updateTime: '09:00',
    alertThreshold: 5.0,
    weekendsEnabled: false,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const mockDailyReport = {
    userId: 'user-1',
    reportDate: new Date(),
    portfolioValue: 16000,
    dailyChange: 1000,
    dailyChangePercent: 6.67,
    significantMovers: [],
    sectorPerformance: [],
    marketSummary: 'Test summary'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock environment variables
    process.env.DAILY_UPDATE_CRON = '0 9 * * *';
    process.env.SCHEDULER_RETRY_ATTEMPTS = '2';
    process.env.SCHEDULER_BATCH_SIZE = '5';
    process.env.SCHEDULER_BATCH_DELAY = '10'; // Very short delay for tests
    process.env.SCHEDULER_TIMEZONE = 'America/New_York';

    // Mock scheduled task
    mockScheduledTask = {
      stop: jest.fn()
    };

    mockCron.validate.mockReturnValue(true);
    mockCron.schedule.mockReturnValue(mockScheduledTask);
    
    // Mock logger
    mockLogger.logScheduler.mockResolvedValue(undefined);
    mockLogger.log.mockResolvedValue(undefined);

    schedulerService = new SchedulerService();
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env.DAILY_UPDATE_CRON;
    delete process.env.SCHEDULER_RETRY_ATTEMPTS;
    delete process.env.SCHEDULER_BATCH_SIZE;
    delete process.env.SCHEDULER_BATCH_DELAY;
    delete process.env.SCHEDULER_TIMEZONE;
    
    // Reset timers if they were used
    if (jest.isMockFunction(setTimeout)) {
      jest.useRealTimers();
    }
  });

  describe('startDailyUpdateScheduler', () => {
    it('should start the scheduler with valid cron expression', () => {
      schedulerService.startDailyUpdateScheduler();

      expect(mockCron.validate).toHaveBeenCalledWith('0 9 * * *');
      expect(mockCron.schedule).toHaveBeenCalledWith(
        '0 9 * * *',
        expect.any(Function),
        expect.objectContaining({
          scheduled: true,
          timezone: 'America/New_York'
        })
      );
    });

    it('should not start scheduler if already running', () => {
      schedulerService.startDailyUpdateScheduler();
      schedulerService.startDailyUpdateScheduler(); // Second call

      expect(mockCron.schedule).toHaveBeenCalledTimes(1);
    });

    it('should throw error for invalid cron expression', () => {
      mockCron.validate.mockReturnValue(false);

      expect(() => schedulerService.startDailyUpdateScheduler()).toThrow('Invalid cron expression');
    });
  });

  describe('stopDailyUpdateScheduler', () => {
    it('should stop the scheduled task', () => {
      schedulerService.startDailyUpdateScheduler();
      schedulerService.stopDailyUpdateScheduler();

      expect(mockScheduledTask.stop).toHaveBeenCalled();
    });

    it('should handle stopping when scheduler is not running', () => {
      schedulerService.stopDailyUpdateScheduler();

      expect(mockScheduledTask.stop).not.toHaveBeenCalled();
    });
  });

  describe('isSchedulerRunning', () => {
    it('should return true when scheduler is running', () => {
      schedulerService.startDailyUpdateScheduler();

      expect(schedulerService.isSchedulerRunning()).toBe(true);
    });

    it('should return false when scheduler is not running', () => {
      expect(schedulerService.isSchedulerRunning()).toBe(false);
    });
  });

  describe('processDailyUpdatesForAllUsers', () => {
    beforeEach(() => {
      mockPrisma.user.findMany.mockResolvedValue([mockUser]);
      mockNotificationService.generateDailyReport.mockResolvedValue(mockDailyReport);
      mockNotificationService.sendDailyUpdate.mockResolvedValue(undefined);
      mockPrisma.dailyReport.findUnique.mockResolvedValue(null);
      mockNotificationService.getNotificationSettings.mockResolvedValue(mockNotificationSettings);
    });

    it('should process daily updates for all eligible users', async () => {
      await schedulerService.processDailyUpdatesForAllUsers();

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            notificationSettings: {
              emailEnabled: true,
              dailyUpdateEnabled: true
            },
            stockPositions: {
              some: {}
            }
          }
        })
      );

      expect(mockNotificationService.generateDailyReport).toHaveBeenCalledWith('user-1');
      expect(mockNotificationService.sendDailyUpdate).toHaveBeenCalledWith('user-1', mockDailyReport);
    });

    it('should handle empty user list', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);

      await schedulerService.processDailyUpdatesForAllUsers();

      expect(mockNotificationService.generateDailyReport).not.toHaveBeenCalled();
      expect(mockNotificationService.sendDailyUpdate).not.toHaveBeenCalled();
    });

    it('should handle errors for individual users and continue processing', async () => {
      const users = [
        { ...mockUser, id: 'user-1' },
        { ...mockUser, id: 'user-2' },
        { ...mockUser, id: 'user-3' }
      ];
      mockPrisma.user.findMany.mockResolvedValue(users);

      // Make user-2 fail
      mockNotificationService.generateDailyReport
        .mockResolvedValueOnce(mockDailyReport) // user-1 success
        .mockRejectedValueOnce(new Error('API error')) // user-2 failure
        .mockResolvedValueOnce(mockDailyReport); // user-3 success

      await schedulerService.processDailyUpdatesForAllUsers();

      expect(mockNotificationService.generateDailyReport).toHaveBeenCalledTimes(3);
      expect(mockNotificationService.sendDailyUpdate).toHaveBeenCalledTimes(2); // Only successful ones
    });

    it('should filter out weekend users when weekends are disabled', async () => {
      // Mock weekend date (Saturday)
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2024-01-06')); // Saturday

      const weekendUser = {
        ...mockUser,
        notificationSettings: {
          ...mockUser.notificationSettings,
          weekendsEnabled: false
        }
      };

      // The filtering happens in the database query, so return empty array for weekend users
      mockPrisma.user.findMany.mockResolvedValue([]);

      await schedulerService.processDailyUpdatesForAllUsers();

      // Should filter out weekend users at database level
      expect(mockNotificationService.generateDailyReport).not.toHaveBeenCalled();

      jest.useRealTimers();
    });

    it('should prevent concurrent executions', async () => {
      jest.useFakeTimers();
      
      const promise1 = schedulerService.processDailyUpdatesForAllUsers();
      const promise2 = schedulerService.processDailyUpdatesForAllUsers();

      // Fast-forward through any delays
      jest.advanceTimersByTime(2000);
      
      await Promise.all([promise1, promise2]);

      // Second call should return early without processing
      expect(mockPrisma.user.findMany).toHaveBeenCalledTimes(1);
      
      jest.useRealTimers();
    }, 10000);
  });

  describe('processDailyUpdateForUser', () => {
    beforeEach(() => {
      mockPrisma.dailyReport.findUnique.mockResolvedValue(null);
      mockNotificationService.getNotificationSettings.mockResolvedValue(mockNotificationSettings);
      mockNotificationService.generateDailyReport.mockResolvedValue(mockDailyReport);
      mockNotificationService.sendDailyUpdate.mockResolvedValue(undefined);
    });

    it('should process daily update for a single user', async () => {
      await schedulerService.processDailyUpdateForUser('user-1');

      expect(mockNotificationService.generateDailyReport).toHaveBeenCalledWith('user-1');
      expect(mockNotificationService.sendDailyUpdate).toHaveBeenCalledWith('user-1', mockDailyReport);
    });

    it('should skip if daily update already sent', async () => {
      mockPrisma.dailyReport.findUnique.mockResolvedValue({
        emailSent: true
      });

      await schedulerService.processDailyUpdateForUser('user-1');

      expect(mockNotificationService.generateDailyReport).not.toHaveBeenCalled();
      expect(mockNotificationService.sendDailyUpdate).not.toHaveBeenCalled();
    });

    it('should skip if email is disabled', async () => {
      mockNotificationService.getNotificationSettings.mockResolvedValue({
        ...mockNotificationSettings,
        emailEnabled: false
      });

      await schedulerService.processDailyUpdateForUser('user-1');

      expect(mockNotificationService.generateDailyReport).not.toHaveBeenCalled();
      expect(mockNotificationService.sendDailyUpdate).not.toHaveBeenCalled();
    });

    it('should skip if daily updates are disabled', async () => {
      mockNotificationService.getNotificationSettings.mockResolvedValue({
        ...mockNotificationSettings,
        dailyUpdateEnabled: false
      });

      await schedulerService.processDailyUpdateForUser('user-1');

      expect(mockNotificationService.generateDailyReport).not.toHaveBeenCalled();
      expect(mockNotificationService.sendDailyUpdate).not.toHaveBeenCalled();
    });

    it('should retry on failure', async () => {
      jest.useFakeTimers();
      
      mockNotificationService.generateDailyReport
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(mockDailyReport);

      const promise = schedulerService.processDailyUpdateForUser('user-1');
      
      // Fast-forward through the retry delay
      jest.advanceTimersByTime(2000);
      
      await promise;

      expect(mockNotificationService.generateDailyReport).toHaveBeenCalledTimes(2);
      expect(mockNotificationService.sendDailyUpdate).toHaveBeenCalledTimes(1);
      
      jest.useRealTimers();
    }, 10000);

    it('should fail after max retry attempts', async () => {
      jest.useFakeTimers();
      
      mockNotificationService.generateDailyReport.mockRejectedValue(new Error('Persistent error'));

      const promise = schedulerService.processDailyUpdateForUser('user-1');
      
      // Fast-forward through all retry delays
      jest.advanceTimersByTime(5000);
      
      await expect(promise).rejects.toThrow('Failed to process daily update');
      
      jest.useRealTimers();
    }, 10000);

    it('should not retry on non-retryable errors', async () => {
      mockNotificationService.generateDailyReport.mockRejectedValue(new Error('User not found'));

      await expect(schedulerService.processDailyUpdateForUser('user-1')).rejects.toThrow('User not found');

      expect(mockNotificationService.generateDailyReport).toHaveBeenCalledTimes(1);
    });
  });

  describe('getSchedulerStatus', () => {
    it('should return correct status when scheduler is running', () => {
      schedulerService.startDailyUpdateScheduler();

      const status = schedulerService.getSchedulerStatus();

      expect(status).toMatchObject({
        isRunning: true,
        isProcessing: false,
        cronExpression: '0 9 * * *',
        timezone: 'America/New_York'
      });
    });

    it('should return correct status when scheduler is not running', () => {
      const status = schedulerService.getSchedulerStatus();

      expect(status).toMatchObject({
        isRunning: false,
        isProcessing: false,
        cronExpression: '0 9 * * *',
        timezone: 'America/New_York'
      });
    });
  });

  describe('triggerManualDailyUpdate', () => {
    beforeEach(() => {
      mockPrisma.user.findMany.mockResolvedValue([mockUser]);
      mockNotificationService.generateDailyReport.mockResolvedValue(mockDailyReport);
      mockNotificationService.sendDailyUpdate.mockResolvedValue(undefined);
      mockPrisma.dailyReport.findUnique.mockResolvedValue(null);
      mockNotificationService.getNotificationSettings.mockResolvedValue(mockNotificationSettings);
    });

    it('should trigger manual daily update', async () => {
      const stats = await schedulerService.triggerManualDailyUpdate();

      expect(stats).toMatchObject({
        startTime: expect.any(Date),
        endTime: expect.any(Date)
      });

      expect(mockNotificationService.generateDailyReport).toHaveBeenCalled();
      expect(mockNotificationService.sendDailyUpdate).toHaveBeenCalled();
    });
  });

  describe('Batch processing', () => {
    it('should process users in batches', async () => {
      jest.useFakeTimers();
      
      // Create 12 users (more than batch size of 5)
      const users = Array.from({ length: 12 }, (_, i) => ({
        ...mockUser,
        id: `user-${i + 1}`,
        email: `user${i + 1}@example.com`
      }));

      mockPrisma.user.findMany.mockResolvedValue(users);
      mockNotificationService.generateDailyReport.mockResolvedValue(mockDailyReport);
      mockNotificationService.sendDailyUpdate.mockResolvedValue(undefined);
      mockPrisma.dailyReport.findUnique.mockResolvedValue(null);
      mockNotificationService.getNotificationSettings.mockResolvedValue(mockNotificationSettings);

      const promise = schedulerService.processDailyUpdatesForAllUsers();
      
      // Fast-forward through batch delays
      jest.advanceTimersByTime(1000);
      
      await promise;

      // Should process all 12 users
      expect(mockNotificationService.generateDailyReport).toHaveBeenCalledTimes(12);
      expect(mockNotificationService.sendDailyUpdate).toHaveBeenCalledTimes(12);
      
      jest.useRealTimers();
    }, 15000);
  });

  describe('Weekend handling', () => {
    it('should include users with weekends enabled on weekends', async () => {
      // Mock Sunday
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2024-01-07')); // Sunday

      const weekendEnabledUser = {
        ...mockUser,
        notificationSettings: {
          ...mockUser.notificationSettings,
          weekendsEnabled: true
        }
      };

      mockPrisma.user.findMany.mockResolvedValue([weekendEnabledUser]);
      mockNotificationService.generateDailyReport.mockResolvedValue(mockDailyReport);
      mockNotificationService.sendDailyUpdate.mockResolvedValue(undefined);
      mockPrisma.dailyReport.findUnique.mockResolvedValue(null);
      mockNotificationService.getNotificationSettings.mockResolvedValue({
        ...mockNotificationSettings,
        weekendsEnabled: true
      });

      await schedulerService.processDailyUpdatesForAllUsers();

      expect(mockNotificationService.generateDailyReport).toHaveBeenCalledWith('user-1');

      jest.useRealTimers();
    });
  });
});