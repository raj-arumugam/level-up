import request from 'supertest';
import express from 'express';
import { schedulerService } from '../services/schedulerService';
import { prisma } from '../lib/database';
import { notificationService } from '../services/notificationService';
import schedulerRoutes from '../routes/scheduler';

// Mock external dependencies
jest.mock('../services/notificationService');
jest.mock('node-cron');

const mockNotificationService = notificationService as jest.Mocked<typeof notificationService>;

// Create test app
const app = express();
app.use(express.json());
app.use('/api/scheduler', schedulerRoutes);

describe('Scheduler Integration Tests', () => {
  const testUserId = 'test-user-scheduler';
  const testUser = {
    id: testUserId,
    email: 'scheduler-test@example.com',
    firstName: 'Test',
    lastName: 'User',
    passwordHash: 'hashed-password',
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const mockDailyReport = {
    userId: testUserId,
    reportDate: new Date(),
    portfolioValue: 15000,
    dailyChange: 500,
    dailyChangePercent: 3.45,
    significantMovers: [],
    sectorPerformance: [],
    marketSummary: 'Test market summary'
  };

  beforeAll(async () => {
    // Clean up any existing test data
    await prisma.dailyReport.deleteMany({
      where: { userId: testUserId }
    });
    
    await prisma.stockPosition.deleteMany({
      where: { userId: testUserId }
    });
    
    await prisma.notificationSettings.deleteMany({
      where: { userId: testUserId }
    });
    
    await prisma.user.deleteMany({
      where: { id: testUserId }
    });

    // Create test user with notification settings
    await prisma.user.create({
      data: {
        ...testUser,
        notificationSettings: {
          create: {
            emailEnabled: true,
            dailyUpdateEnabled: true,
            updateTime: '09:00',
            alertThreshold: 5.0,
            weekendsEnabled: false
          }
        },
        stockPositions: {
          create: {
            symbol: 'AAPL',
            companyName: 'Apple Inc.',
            quantity: 10,
            purchasePrice: 150.00,
            purchaseDate: new Date('2024-01-01'),
            sector: 'Technology',
            marketCap: 'Large'
          }
        }
      }
    });
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.dailyReport.deleteMany({
      where: { userId: testUserId }
    });
    
    await prisma.stockPosition.deleteMany({
      where: { userId: testUserId }
    });
    
    await prisma.notificationSettings.deleteMany({
      where: { userId: testUserId }
    });
    
    await prisma.user.deleteMany({
      where: { id: testUserId }
    });

    // Stop scheduler if running
    schedulerService.stopDailyUpdateScheduler();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock notification service methods
    mockNotificationService.generateDailyReport.mockResolvedValue(mockDailyReport);
    mockNotificationService.sendDailyUpdate.mockResolvedValue(undefined);
    mockNotificationService.getNotificationSettings.mockResolvedValue({
      id: 'settings-1',
      userId: testUserId,
      emailEnabled: true,
      dailyUpdateEnabled: true,
      updateTime: '09:00',
      alertThreshold: 5.0,
      weekendsEnabled: false,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  });

  describe('Daily Update Processing Integration', () => {
    it('should process daily update for real user from database', async () => {
      // Process daily update for the test user
      await schedulerService.processDailyUpdateForUser(testUserId);

      // Verify notification service was called
      expect(mockNotificationService.generateDailyReport).toHaveBeenCalledWith(testUserId);
      expect(mockNotificationService.sendDailyUpdate).toHaveBeenCalledWith(testUserId, mockDailyReport);

      // Verify daily report was saved to database
      const savedReport = await prisma.dailyReport.findUnique({
        where: {
          userId_reportDate: {
            userId: testUserId,
            reportDate: new Date(new Date().toDateString())
          }
        }
      });

      expect(savedReport).toBeTruthy();
      expect(savedReport?.portfolioValue).toBe(mockDailyReport.portfolioValue);
    });

    it('should skip user if daily update already sent today', async () => {
      // Create a daily report that was already sent
      await prisma.dailyReport.create({
        data: {
          userId: testUserId,
          reportDate: new Date(new Date().toDateString()),
          portfolioValue: 15000,
          dailyChange: 500,
          dailyChangePercent: 3.45,
          significantMovers: '[]',
          sectorPerformance: '[]',
          marketSummary: 'Already sent',
          emailSent: true,
          emailSentAt: new Date()
        }
      });

      // Try to process daily update again
      await schedulerService.processDailyUpdateForUser(testUserId);

      // Should not call notification service since already sent
      expect(mockNotificationService.generateDailyReport).not.toHaveBeenCalled();
      expect(mockNotificationService.sendDailyUpdate).not.toHaveBeenCalled();

      // Clean up
      await prisma.dailyReport.delete({
        where: {
          userId_reportDate: {
            userId: testUserId,
            reportDate: new Date(new Date().toDateString())
          }
        }
      });
    });

    it('should process all eligible users from database', async () => {
      // Create additional test user
      const testUser2Id = 'test-user-2';
      await prisma.user.create({
        data: {
          id: testUser2Id,
          email: 'test2@example.com',
          firstName: 'Test2',
          lastName: 'User2',
          passwordHash: 'hashed-password',
          notificationSettings: {
            create: {
              emailEnabled: true,
              dailyUpdateEnabled: true,
              updateTime: '09:00',
              alertThreshold: 5.0,
              weekendsEnabled: false
            }
          },
          stockPositions: {
            create: {
              symbol: 'GOOGL',
              companyName: 'Alphabet Inc.',
              quantity: 5,
              purchasePrice: 2500.00,
              purchaseDate: new Date('2024-01-01'),
              sector: 'Technology',
              marketCap: 'Large'
            }
          }
        }
      });

      try {
        // Process all users
        await schedulerService.processDailyUpdatesForAllUsers();

        // Should have processed both users
        expect(mockNotificationService.generateDailyReport).toHaveBeenCalledTimes(2);
        expect(mockNotificationService.sendDailyUpdate).toHaveBeenCalledTimes(2);

        // Verify both users were called
        expect(mockNotificationService.generateDailyReport).toHaveBeenCalledWith(testUserId);
        expect(mockNotificationService.generateDailyReport).toHaveBeenCalledWith(testUser2Id);

      } finally {
        // Clean up second user
        await prisma.dailyReport.deleteMany({
          where: { userId: testUser2Id }
        });
        await prisma.stockPosition.deleteMany({
          where: { userId: testUser2Id }
        });
        await prisma.notificationSettings.deleteMany({
          where: { userId: testUser2Id }
        });
        await prisma.user.delete({
          where: { id: testUser2Id }
        });
      }
    });

    it('should handle database errors gracefully', async () => {
      // Create user without notification settings to trigger error
      const errorUserId = 'error-user';
      await prisma.user.create({
        data: {
          id: errorUserId,
          email: 'error@example.com',
          firstName: 'Error',
          lastName: 'User',
          passwordHash: 'hashed-password'
        }
      });

      try {
        // This should handle the error gracefully
        await expect(schedulerService.processDailyUpdateForUser(errorUserId)).rejects.toThrow();

        // Should not have called notification service due to error
        expect(mockNotificationService.generateDailyReport).not.toHaveBeenCalled();

      } finally {
        // Clean up error user
        await prisma.user.delete({
          where: { id: errorUserId }
        });
      }
    });
  });

  describe('Scheduler State Management', () => {
    it('should start and stop scheduler correctly', () => {
      expect(schedulerService.isSchedulerRunning()).toBe(false);

      schedulerService.startDailyUpdateScheduler();
      expect(schedulerService.isSchedulerRunning()).toBe(true);

      schedulerService.stopDailyUpdateScheduler();
      expect(schedulerService.isSchedulerRunning()).toBe(false);
    });

    it('should return correct scheduler status', () => {
      const status = schedulerService.getSchedulerStatus();

      expect(status).toMatchObject({
        isRunning: expect.any(Boolean),
        isProcessing: expect.any(Boolean),
        cronExpression: expect.any(String),
        timezone: expect.any(String)
      });
    });
  });

  describe('Error Recovery and Retry Logic', () => {
    it('should retry failed operations', async () => {
      jest.useFakeTimers();

      // Mock first call to fail, second to succeed
      mockNotificationService.generateDailyReport
        .mockRejectedValueOnce(new Error('Temporary network error'))
        .mockResolvedValueOnce(mockDailyReport);

      const promise = schedulerService.processDailyUpdateForUser(testUserId);

      // Fast-forward through retry delay
      jest.advanceTimersByTime(2000);

      await promise;

      // Should have retried and succeeded
      expect(mockNotificationService.generateDailyReport).toHaveBeenCalledTimes(2);
      expect(mockNotificationService.sendDailyUpdate).toHaveBeenCalledTimes(1);

      jest.useRealTimers();
    }, 10000);

    it('should fail after max retries', async () => {
      jest.useFakeTimers();

      // Mock all calls to fail
      mockNotificationService.generateDailyReport.mockRejectedValue(new Error('Persistent error'));

      const promise = schedulerService.processDailyUpdateForUser(testUserId);

      // Fast-forward through all retry delays
      jest.advanceTimersByTime(10000);

      await expect(promise).rejects.toThrow('Failed to process daily update');

      // Should have attempted multiple times
      expect(mockNotificationService.generateDailyReport).toHaveBeenCalledTimes(3); // Initial + 2 retries

      jest.useRealTimers();
    }, 15000);
  });

  describe('Weekend and Settings Filtering', () => {
    it('should respect weekend settings', async () => {
      // Update user to disable weekends
      await prisma.notificationSettings.update({
        where: { userId: testUserId },
        data: { weekendsEnabled: false }
      });

      // Mock weekend date
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2024-01-06')); // Saturday

      mockNotificationService.getNotificationSettings.mockResolvedValue({
        id: 'settings-1',
        userId: testUserId,
        emailEnabled: true,
        dailyUpdateEnabled: true,
        updateTime: '09:00',
        alertThreshold: 5.0,
        weekendsEnabled: false,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      // Should skip weekend processing
      await schedulerService.processDailyUpdateForUser(testUserId);

      expect(mockNotificationService.generateDailyReport).not.toHaveBeenCalled();

      jest.useRealTimers();

      // Reset weekend setting
      await prisma.notificationSettings.update({
        where: { userId: testUserId },
        data: { weekendsEnabled: false }
      });
    });

    it('should skip users with disabled notifications', async () => {
      // Disable email notifications
      await prisma.notificationSettings.update({
        where: { userId: testUserId },
        data: { emailEnabled: false }
      });

      mockNotificationService.getNotificationSettings.mockResolvedValue({
        id: 'settings-1',
        userId: testUserId,
        emailEnabled: false,
        dailyUpdateEnabled: true,
        updateTime: '09:00',
        alertThreshold: 5.0,
        weekendsEnabled: false,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      await schedulerService.processDailyUpdateForUser(testUserId);

      expect(mockNotificationService.generateDailyReport).not.toHaveBeenCalled();

      // Re-enable for cleanup
      await prisma.notificationSettings.update({
        where: { userId: testUserId },
        data: { emailEnabled: true }
      });
    });
  });

  describe('Manual Trigger Integration', () => {
    it('should handle manual trigger correctly', async () => {
      const stats = await schedulerService.triggerManualDailyUpdate();

      expect(stats).toMatchObject({
        startTime: expect.any(Date),
        endTime: expect.any(Date)
      });

      // Should have processed the test user
      expect(mockNotificationService.generateDailyReport).toHaveBeenCalledWith(testUserId);
    });
  });
});