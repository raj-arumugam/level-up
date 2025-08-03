import { NotificationService } from '../services/notificationService';
import { prisma } from '../lib/database';
import { portfolioService } from '../services/portfolioService';
import { analyticsService } from '../services/analyticsService';
import { marketDataService } from '../services/marketDataService';
import nodemailer from 'nodemailer';

// Mock dependencies
jest.mock('../lib/database', () => ({
  prisma: {
    user: {
      findUnique: jest.fn()
    },
    notificationSettings: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      create: jest.fn()
    },
    dailyReport: {
      upsert: jest.fn(),
      update: jest.fn()
    }
  }
}));

jest.mock('../services/portfolioService', () => ({
  portfolioService: {
    getPortfolio: jest.fn()
  }
}));

jest.mock('../services/analyticsService', () => ({
  analyticsService: {
    generatePerformanceReport: jest.fn()
  }
}));

jest.mock('../services/marketDataService', () => ({
  marketDataService: {
    getCurrentPrice: jest.fn()
  }
}));

jest.mock('nodemailer', () => ({
  createTransport: jest.fn()
}));

const mockPrisma = prisma as any;
const mockPortfolioService = portfolioService as any;
const mockAnalyticsService = analyticsService as any;
const mockMarketDataService = marketDataService as any;
const mockNodemailer = nodemailer as any;

describe('NotificationService', () => {
  let notificationService: NotificationService;
  let mockTransporter: any;

  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    firstName: 'John',
    lastName: 'Doe',
    passwordHash: 'hash',
    createdAt: new Date(),
    updatedAt: new Date()
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

  const mockStockPosition = {
    id: 'position-1',
    userId: 'user-1',
    symbol: 'AAPL',
    companyName: 'Apple Inc.',
    quantity: 100,
    purchasePrice: 150.00,
    purchaseDate: new Date('2024-01-01'),
    currentPrice: 160.00,
    sector: 'Technology',
    marketCap: 'Large Cap',
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const mockPortfolio = {
    userId: 'user-1',
    positions: [mockStockPosition],
    totalValue: 16000,
    totalCost: 15000,
    unrealizedGainLoss: 1000,
    unrealizedGainLossPercent: 6.67,
    lastUpdated: new Date()
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock environment variables
    process.env.EMAIL_HOST = 'smtp.test.com';
    process.env.EMAIL_PORT = '587';
    process.env.EMAIL_USER = 'test@test.com';
    process.env.EMAIL_PASSWORD = 'password';
    process.env.EMAIL_FROM = 'Test <test@test.com>';
    process.env.NOTIFICATION_RETRY_ATTEMPTS = '3';

    // Mock nodemailer transporter
    mockTransporter = {
      sendMail: jest.fn().mockResolvedValue({ messageId: 'test-message-id' }),
      verify: jest.fn().mockImplementation((callback) => callback(null, true))
    };
    mockNodemailer.createTransport.mockReturnValue(mockTransporter);

    notificationService = new NotificationService();
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env.EMAIL_HOST;
    delete process.env.EMAIL_PORT;
    delete process.env.EMAIL_USER;
    delete process.env.EMAIL_PASSWORD;
    delete process.env.EMAIL_FROM;
    delete process.env.NOTIFICATION_RETRY_ATTEMPTS;
  });

  describe('generateDailyReport', () => {
    beforeEach(() => {
      mockPortfolioService.getPortfolio.mockResolvedValue(mockPortfolio);
      mockPrisma.notificationSettings.findUnique.mockResolvedValue(mockNotificationSettings);
      mockMarketDataService.getCurrentPrice.mockResolvedValue({
        symbol: 'AAPL',
        price: 160.00,
        change: 10.00,
        changePercent: 6.67,
        lastUpdated: new Date()
      });
      mockAnalyticsService.generatePerformanceReport.mockResolvedValue({
        period: '1d',
        startValue: 15000,
        endValue: 16000,
        totalReturn: 1000,
        totalReturnPercent: 6.67,
        sectorPerformance: [{
          sector: 'Technology',
          return: 1000,
          returnPercent: 6.67,
          contribution: 6.67
        }]
      });
      mockPrisma.dailyReport.upsert.mockResolvedValue({
        id: 'report-1',
        userId: 'user-1',
        reportDate: new Date(),
        portfolioValue: 16000,
        dailyChange: 1000,
        dailyChangePercent: 6.67,
        significantMovers: JSON.stringify([]),
        sectorPerformance: JSON.stringify([]),
        marketSummary: 'Test summary',
        emailSent: false,
        emailSentAt: null,
        createdAt: new Date()
      });
    });

    it('should generate daily report for user with positions', async () => {
      const report = await notificationService.generateDailyReport('user-1');

      expect(report).toMatchObject({
        userId: 'user-1',
        portfolioValue: 16000,
        significantMovers: expect.any(Array),
        sectorPerformance: expect.any(Array),
        marketSummary: expect.any(String)
      });

      expect(mockPortfolioService.getPortfolio).toHaveBeenCalledWith('user-1');
      expect(mockPrisma.dailyReport.upsert).toHaveBeenCalled();
    });

    it('should handle empty portfolio', async () => {
      const emptyPortfolio = {
        ...mockPortfolio,
        positions: [],
        totalValue: 0,
        totalCost: 0,
        unrealizedGainLoss: 0,
        unrealizedGainLossPercent: 0
      };
      mockPortfolioService.getPortfolio.mockResolvedValue(emptyPortfolio);

      const report = await notificationService.generateDailyReport('user-1');

      expect(report).toMatchObject({
        userId: 'user-1',
        portfolioValue: 0,
        dailyChange: 0,
        dailyChangePercent: 0,
        significantMovers: [],
        sectorPerformance: [],
        marketSummary: 'No positions in portfolio'
      });
    });

    it('should handle portfolio service errors', async () => {
      mockPortfolioService.getPortfolio.mockRejectedValue(new Error('Portfolio service error'));

      await expect(notificationService.generateDailyReport('user-1')).rejects.toThrow('Unable to generate daily report');
    });
  });

  describe('detectSignificantMovers', () => {
    it('should detect positions with significant price movements', async () => {
      const positions = [
        { ...mockStockPosition, symbol: 'AAPL', purchasePrice: 100 },
        { ...mockStockPosition, symbol: 'GOOGL', purchasePrice: 200 }
      ];

      mockMarketDataService.getCurrentPrice
        .mockResolvedValueOnce({
          symbol: 'AAPL',
          price: 110, // 10% increase
          change: 10,
          changePercent: 10,
          lastUpdated: new Date()
        })
        .mockResolvedValueOnce({
          symbol: 'GOOGL',
          price: 190, // 5% decrease
          change: -10,
          changePercent: -5,
          lastUpdated: new Date()
        });

      const significantMovers = await notificationService.detectSignificantMovers(positions, 5);

      expect(significantMovers).toHaveLength(2);
      expect(significantMovers[0].symbol).toBe('AAPL'); // Should be sorted by absolute change
      expect(significantMovers[1].symbol).toBe('GOOGL');
    });

    it('should filter out positions below threshold', async () => {
      const positions = [mockStockPosition];

      mockMarketDataService.getCurrentPrice.mockResolvedValue({
        symbol: 'AAPL',
        price: 152, // 1.33% increase (below 5% threshold)
        change: 2,
        changePercent: 1.33,
        lastUpdated: new Date()
      });

      const significantMovers = await notificationService.detectSignificantMovers(positions, 5);

      expect(significantMovers).toHaveLength(0);
    });

    it('should handle market data service errors gracefully', async () => {
      const positions = [mockStockPosition];
      mockMarketDataService.getCurrentPrice.mockRejectedValue(new Error('API error'));

      const significantMovers = await notificationService.detectSignificantMovers(positions, 5);

      expect(significantMovers).toHaveLength(0);
    });
  });

  describe('sendDailyUpdate', () => {
    const mockReport = {
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
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        notificationSettings: mockNotificationSettings
      });
      mockPrisma.dailyReport.update.mockResolvedValue({} as any);
    });

    it('should send daily update email successfully', async () => {
      await notificationService.sendDailyUpdate('user-1', mockReport);

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: expect.stringContaining('Daily Portfolio Update'),
          html: expect.stringContaining('Portfolio Value'),
          text: expect.stringContaining('Portfolio Value')
        })
      );

      expect(mockPrisma.dailyReport.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            emailSent: true,
            emailSentAt: expect.any(Date)
          }
        })
      );
    });

    it('should skip sending if email is disabled', async () => {
      const disabledSettings = { ...mockNotificationSettings, emailEnabled: false };
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        notificationSettings: disabledSettings
      });

      await notificationService.sendDailyUpdate('user-1', mockReport);

      expect(mockTransporter.sendMail).not.toHaveBeenCalled();
    });

    it('should skip sending if daily updates are disabled', async () => {
      const disabledSettings = { ...mockNotificationSettings, dailyUpdateEnabled: false };
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        notificationSettings: disabledSettings
      });

      await notificationService.sendDailyUpdate('user-1', mockReport);

      expect(mockTransporter.sendMail).not.toHaveBeenCalled();
    });

    it('should handle user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(notificationService.sendDailyUpdate('user-1', mockReport)).rejects.toThrow('User user-1 not found');
    });

    it('should retry email sending on failure', async () => {
      mockTransporter.sendMail
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ messageId: 'success' });

      await notificationService.sendDailyUpdate('user-1', mockReport);

      expect(mockTransporter.sendMail).toHaveBeenCalledTimes(3);
    });

    it('should fail after max retry attempts', async () => {
      mockTransporter.sendMail.mockRejectedValue(new Error('Persistent error'));

      await expect(notificationService.sendDailyUpdate('user-1', mockReport)).rejects.toThrow('Failed to send email after 3 attempts');
    });
  });

  describe('updateNotificationSettings', () => {
    it('should update existing notification settings', async () => {
      const updates = {
        emailEnabled: false,
        alertThreshold: 10.0
      };

      mockPrisma.notificationSettings.upsert.mockResolvedValue({
        ...mockNotificationSettings,
        ...updates
      });

      const result = await notificationService.updateNotificationSettings('user-1', updates);

      expect(result).toMatchObject(updates);
      expect(mockPrisma.notificationSettings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1' },
          update: expect.objectContaining(updates)
        })
      );
    });

    it('should create default settings if none exist', async () => {
      const updates = { emailEnabled: false };

      mockPrisma.notificationSettings.upsert.mockResolvedValue({
        ...mockNotificationSettings,
        emailEnabled: false
      });

      await notificationService.updateNotificationSettings('user-1', updates);

      expect(mockPrisma.notificationSettings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            userId: 'user-1',
            emailEnabled: false
          })
        })
      );
    });

    it('should validate alert threshold range', async () => {
      await expect(
        notificationService.updateNotificationSettings('user-1', { alertThreshold: -5 })
      ).rejects.toThrow('Alert threshold must be between 0 and 100');

      await expect(
        notificationService.updateNotificationSettings('user-1', { alertThreshold: 150 })
      ).rejects.toThrow('Alert threshold must be between 0 and 100');
    });

    it('should validate time format', async () => {
      await expect(
        notificationService.updateNotificationSettings('user-1', { updateTime: '25:00' })
      ).rejects.toThrow('Update time must be in HH:MM format');

      await expect(
        notificationService.updateNotificationSettings('user-1', { updateTime: 'invalid' })
      ).rejects.toThrow('Update time must be in HH:MM format');
    });
  });

  describe('getNotificationSettings', () => {
    it('should return existing notification settings', async () => {
      mockPrisma.notificationSettings.findUnique.mockResolvedValue(mockNotificationSettings);

      const result = await notificationService.getNotificationSettings('user-1');

      expect(result).toEqual(mockNotificationSettings);
    });

    it('should create default settings if none exist', async () => {
      mockPrisma.notificationSettings.findUnique.mockResolvedValue(null);
      mockPrisma.notificationSettings.create.mockResolvedValue(mockNotificationSettings);

      const result = await notificationService.getNotificationSettings('user-1');

      expect(result).toEqual(mockNotificationSettings);
      expect(mockPrisma.notificationSettings.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            emailEnabled: true,
            dailyUpdateEnabled: true
          })
        })
      );
    });
  });

  describe('sendTestEmail', () => {
    beforeEach(() => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
    });

    it('should send test email successfully', async () => {
      await notificationService.sendTestEmail('user-1');

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: 'Portfolio Tracker - Test Email',
          html: expect.stringContaining('Test Email Successful'),
          text: expect.stringContaining('Test Email Successful')
        })
      );
    });

    it('should handle user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(notificationService.sendTestEmail('user-1')).rejects.toThrow('User user-1 not found');
    });

    it('should handle missing email transporter', async () => {
      // Create service without email configuration
      delete process.env.EMAIL_USER;
      delete process.env.EMAIL_PASSWORD;
      const serviceWithoutEmail = new NotificationService();

      await expect(serviceWithoutEmail.sendTestEmail('user-1')).rejects.toThrow('Email transporter not configured');
    });
  });

  describe('Email content generation', () => {
    it('should generate proper email content with significant movers', async () => {
      const reportWithMovers = {
        userId: 'user-1',
        reportDate: new Date('2024-01-15'),
        portfolioValue: 16000,
        dailyChange: 1000,
        dailyChangePercent: 6.67,
        significantMovers: [{
          ...mockStockPosition,
          priceChange: 10,
          priceChangePercent: 6.67,
          isPositive: true
        }] as any,
        sectorPerformance: [{
          sector: 'Technology',
          return: 1000,
          returnPercent: 6.67,
          contribution: 6.67
        }],
        marketSummary: 'Strong performance today'
      };

      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        notificationSettings: mockNotificationSettings
      });
      mockPrisma.notificationSettings.findUnique.mockResolvedValue(mockNotificationSettings);

      await notificationService.sendDailyUpdate('user-1', reportWithMovers);

      const emailCall = mockTransporter.sendMail.mock.calls[0][0];
      expect(emailCall.html).toContain('Significant Movers');
      expect(emailCall.html).toContain('AAPL');
      expect(emailCall.html).toContain('6.67%');
      expect(emailCall.text).toContain('Significant Movers');
    });
  });
});