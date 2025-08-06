import { testDb, testPrisma } from './testDatabase';
import { portfolioService } from '../../services/portfolioService';
import { authService } from '../../services/authService';
import { notificationService } from '../../services/notificationService';

// Mock external services
jest.mock('../../services/marketDataService');
jest.mock('nodemailer');

describe('Database Transaction and Rollback Tests', () => {
  beforeAll(async () => {
    await testDb.setupTestDatabase();
  });

  afterAll(async () => {
    await testDb.teardownTestDatabase();
  });

  beforeEach(async () => {
    await testDb.cleanupTestDatabase();
  });

  describe('User Registration Transaction Integrity', () => {
    it('should rollback user creation if notification settings fail', async () => {
      const userData = {
        email: 'transaction-test@example.com',
        password: 'TestPassword123!',
        firstName: 'Transaction',
        lastName: 'Test'
      };

      // Mock notification settings creation to fail
      const originalCreate = testPrisma.notificationSettings.create;
      testPrisma.notificationSettings.create = jest.fn().mockRejectedValue(
        new Error('Notification settings constraint violation')
      );

      try {
        await expect(authService.register(userData)).rejects.toThrow();

        // Verify user was not created due to transaction rollback
        const userCount = await testPrisma.user.count({
          where: { email: userData.email }
        });
        expect(userCount).toBe(0);

        // Verify no orphaned notification settings
        const settingsCount = await testPrisma.notificationSettings.count();
        expect(settingsCount).toBe(0);

      } finally {
        // Restore original method
        testPrisma.notificationSettings.create = originalCreate;
      }
    });

    it('should maintain referential integrity on user deletion', async () => {
      // Create user with related data
      const user = await testDb.createTestUser();
      
      // Create related data
      const position = await testDb.createTestStockPosition(user.id);
      await testPrisma.dailyReport.create({
        data: {
          userId: user.id,
          reportDate: new Date(),
          portfolioValue: 1000,
          dailyChange: 50,
          dailyChangePercent: 5.0,
          significantMovers: JSON.stringify([]),
          sectorPerformance: JSON.stringify([]),
          marketSummary: 'Test summary'
        }
      });

      // Delete user (should cascade)
      await testPrisma.user.delete({
        where: { id: user.id }
      });

      // Verify all related data was deleted
      const remainingPositions = await testPrisma.stockPosition.count({
        where: { userId: user.id }
      });
      expect(remainingPositions).toBe(0);

      const remainingSettings = await testPrisma.notificationSettings.count({
        where: { userId: user.id }
      });
      expect(remainingSettings).toBe(0);

      const remainingReports = await testPrisma.dailyReport.count({
        where: { userId: user.id }
      });
      expect(remainingReports).toBe(0);
    });

    it('should handle concurrent user registrations with same email', async () => {
      const userData = {
        email: 'concurrent@example.com',
        password: 'TestPassword123!',
        firstName: 'Concurrent',
        lastName: 'Test'
      };

      // Attempt concurrent registrations
      const registrationPromises = Array(3).fill(null).map(() =>
        authService.register(userData).catch(err => err)
      );

      const results = await Promise.all(registrationPromises);

      // Only one should succeed
      const successful = results.filter(r => r && r.user && r.token);
      const failed = results.filter(r => r instanceof Error);

      expect(successful).toHaveLength(1);
      expect(failed).toHaveLength(2);

      // Verify only one user exists
      const userCount = await testPrisma.user.count({
        where: { email: userData.email }
      });
      expect(userCount).toBe(1);

      // Verify only one notification settings record
      const settingsCount = await testPrisma.notificationSettings.count();
      expect(settingsCount).toBe(1);
    });
  });

  describe('Portfolio Management Transaction Integrity', () => {
    let testUser: any;

    beforeEach(async () => {
      testUser = await testDb.createTestUser();
    });

    it('should rollback position creation on market data failure', async () => {
      const positionData = {
        symbol: 'AAPL',
        quantity: 10,
        purchasePrice: 145.50,
        purchaseDate: new Date('2024-01-15')
      };

      // Mock market data service to fail after validation
      const { marketDataService } = require('../../services/marketDataService');
      marketDataService.validateSymbol = jest.fn().mockResolvedValue(true);
      marketDataService.getCompanyInfo = jest.fn().mockRejectedValue(
        new Error('Market data service unavailable')
      );

      await expect(portfolioService.addPosition(testUser.id, positionData))
        .rejects.toThrow();

      // Verify no position was created
      const positionCount = await testPrisma.stockPosition.count({
        where: { userId: testUser.id }
      });
      expect(positionCount).toBe(0);
    });

    it('should handle concurrent position updates correctly', async () => {
      const position = await testDb.createTestStockPosition(testUser.id, {
        quantity: 10,
        purchasePrice: 100.00
      });

      // Attempt concurrent updates
      const updatePromises = [
        portfolioService.updatePosition(position.id, { quantity: 15 }),
        portfolioService.updatePosition(position.id, { quantity: 20 }),
        portfolioService.updatePosition(position.id, { purchasePrice: 110.00 })
      ];

      const results = await Promise.allSettled(updatePromises);

      // At least one should succeed
      const successful = results.filter(r => r.status === 'fulfilled');
      expect(successful.length).toBeGreaterThan(0);

      // Verify final state is consistent
      const finalPosition = await testPrisma.stockPosition.findUnique({
        where: { id: position.id }
      });
      expect(finalPosition).toBeTruthy();
      expect(finalPosition?.updatedAt).not.toEqual(position.updatedAt);
    });

    it('should maintain data consistency during batch operations', async () => {
      const positions = [
        { symbol: 'AAPL', quantity: 10, purchasePrice: 150.00 },
        { symbol: 'GOOGL', quantity: 5, purchasePrice: 2800.00 },
        { symbol: 'MSFT', quantity: 8, purchasePrice: 300.00 }
      ];

      // Use transaction for batch creation
      await testPrisma.$transaction(async (tx) => {
        for (const positionData of positions) {
          await tx.stockPosition.create({
            data: {
              userId: testUser.id,
              symbol: positionData.symbol,
              companyName: `${positionData.symbol} Inc.`,
              quantity: positionData.quantity,
              purchasePrice: positionData.purchasePrice,
              purchaseDate: new Date(),
              sector: 'Technology',
              marketCap: 'Large Cap'
            }
          });
        }
      });

      // Verify all positions were created
      const createdPositions = await testPrisma.stockPosition.findMany({
        where: { userId: testUser.id }
      });
      expect(createdPositions).toHaveLength(3);
    });

    it('should rollback batch operations on any failure', async () => {
      const positions = [
        { symbol: 'AAPL', quantity: 10, purchasePrice: 150.00 },
        { symbol: 'INVALID', quantity: -5, purchasePrice: 2800.00 }, // Invalid quantity
        { symbol: 'MSFT', quantity: 8, purchasePrice: 300.00 }
      ];

      // Attempt batch creation with one invalid item
      await expect(
        testPrisma.$transaction(async (tx) => {
          for (const positionData of positions) {
            if (positionData.quantity < 0) {
              throw new Error('Invalid quantity');
            }
            await tx.stockPosition.create({
              data: {
                userId: testUser.id,
                symbol: positionData.symbol,
                companyName: `${positionData.symbol} Inc.`,
                quantity: positionData.quantity,
                purchasePrice: positionData.purchasePrice,
                purchaseDate: new Date(),
                sector: 'Technology',
                marketCap: 'Large Cap'
              }
            });
          }
        })
      ).rejects.toThrow('Invalid quantity');

      // Verify no positions were created due to rollback
      const positionCount = await testPrisma.stockPosition.count({
        where: { userId: testUser.id }
      });
      expect(positionCount).toBe(0);
    });
  });

  describe('Daily Report Generation Transaction Integrity', () => {
    let testUser: any;

    beforeEach(async () => {
      testUser = await testDb.createTestUser();
      await testDb.createTestStockPosition(testUser.id);
    });

    it('should rollback report creation on email sending failure', async () => {
      // Mock email service to fail
      const nodemailer = require('nodemailer');
      const mockTransporter = {
        sendMail: jest.fn().mockRejectedValue(new Error('SMTP error'))
      };
      nodemailer.createTransporter = jest.fn().mockReturnValue(mockTransporter);

      const reportData = {
        userId: testUser.id,
        reportDate: new Date(),
        portfolioValue: 1000,
        dailyChange: 50,
        dailyChangePercent: 5.0,
        significantMovers: [],
        sectorPerformance: [],
        marketSummary: 'Test summary'
      };

      await expect(notificationService.sendDailyUpdate(testUser.id, reportData))
        .rejects.toThrow();

      // Verify report was not saved due to transaction rollback
      const reportCount = await testPrisma.dailyReport.count({
        where: { userId: testUser.id }
      });
      expect(reportCount).toBe(0);
    });

    it('should prevent duplicate daily reports', async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const reportData = {
        userId: testUser.id,
        reportDate: today,
        portfolioValue: 1000,
        dailyChange: 50,
        dailyChangePercent: 5.0,
        significantMovers: JSON.stringify([]),
        sectorPerformance: JSON.stringify([]),
        marketSummary: 'Test summary'
      };

      // Create first report
      await testPrisma.dailyReport.create({ data: reportData });

      // Attempt to create duplicate
      await expect(
        testPrisma.dailyReport.create({ data: reportData })
      ).rejects.toThrow();

      // Verify only one report exists
      const reportCount = await testPrisma.dailyReport.count({
        where: { 
          userId: testUser.id,
          reportDate: today
        }
      });
      expect(reportCount).toBe(1);
    });

    it('should handle concurrent daily report generation', async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const reportData = {
        userId: testUser.id,
        reportDate: today,
        portfolioValue: 1000,
        dailyChange: 50,
        dailyChangePercent: 5.0,
        significantMovers: JSON.stringify([]),
        sectorPerformance: JSON.stringify([]),
        marketSummary: 'Test summary'
      };

      // Attempt concurrent report creation
      const createPromises = Array(3).fill(null).map(() =>
        testPrisma.dailyReport.create({ data: reportData }).catch(err => err)
      );

      const results = await Promise.all(createPromises);

      // Only one should succeed due to unique constraint
      const successful = results.filter(r => r && r.id);
      const failed = results.filter(r => r instanceof Error);

      expect(successful).toHaveLength(1);
      expect(failed).toHaveLength(2);

      // Verify only one report exists
      const reportCount = await testPrisma.dailyReport.count({
        where: { 
          userId: testUser.id,
          reportDate: today
        }
      });
      expect(reportCount).toBe(1);
    });
  });

  describe('Complex Multi-Table Transaction Scenarios', () => {
    it('should handle portfolio rebalancing transaction', async () => {
      const user = await testDb.createTestUser();
      
      // Create initial positions
      const position1 = await testDb.createTestStockPosition(user.id, {
        symbol: 'AAPL',
        quantity: 10,
        purchasePrice: 150.00
      });
      
      const position2 = await testDb.createTestStockPosition(user.id, {
        symbol: 'GOOGL',
        quantity: 5,
        purchasePrice: 2800.00
      });

      // Perform rebalancing transaction
      await testPrisma.$transaction(async (tx) => {
        // Update existing positions
        await tx.stockPosition.update({
          where: { id: position1.id },
          data: { quantity: 15 }
        });

        await tx.stockPosition.update({
          where: { id: position2.id },
          data: { quantity: 3 }
        });

        // Add new position
        await tx.stockPosition.create({
          data: {
            userId: user.id,
            symbol: 'MSFT',
            companyName: 'Microsoft Corporation',
            quantity: 8,
            purchasePrice: 300.00,
            purchaseDate: new Date(),
            sector: 'Technology',
            marketCap: 'Large Cap'
          }
        });

        // Log the rebalancing activity
        await tx.dailyReport.create({
          data: {
            userId: user.id,
            reportDate: new Date(),
            portfolioValue: 2000,
            dailyChange: 0,
            dailyChangePercent: 0,
            significantMovers: JSON.stringify([]),
            sectorPerformance: JSON.stringify([]),
            marketSummary: 'Portfolio rebalanced'
          }
        });
      });

      // Verify all changes were applied
      const positions = await testPrisma.stockPosition.findMany({
        where: { userId: user.id }
      });
      expect(positions).toHaveLength(3);
      
      const applePosition = positions.find(p => p.symbol === 'AAPL');
      expect(applePosition?.quantity).toBe(15);

      const report = await testPrisma.dailyReport.findFirst({
        where: { userId: user.id }
      });
      expect(report?.marketSummary).toBe('Portfolio rebalanced');
    });

    it('should rollback complex transaction on any failure', async () => {
      const user = await testDb.createTestUser();
      const position = await testDb.createTestStockPosition(user.id);

      // Attempt complex transaction with intentional failure
      await expect(
        testPrisma.$transaction(async (tx) => {
          // Update position
          await tx.stockPosition.update({
            where: { id: position.id },
            data: { quantity: 20 }
          });

          // Create new position
          await tx.stockPosition.create({
            data: {
              userId: user.id,
              symbol: 'MSFT',
              companyName: 'Microsoft Corporation',
              quantity: 8,
              purchasePrice: 300.00,
              purchaseDate: new Date(),
              sector: 'Technology',
              marketCap: 'Large Cap'
            }
          });

          // Intentional failure
          throw new Error('Simulated transaction failure');
        })
      ).rejects.toThrow('Simulated transaction failure');

      // Verify no changes were applied
      const updatedPosition = await testPrisma.stockPosition.findUnique({
        where: { id: position.id }
      });
      expect(updatedPosition?.quantity).toBe(position.quantity); // Unchanged

      const positionCount = await testPrisma.stockPosition.count({
        where: { userId: user.id }
      });
      expect(positionCount).toBe(1); // No new position created
    });
  });

  describe('Database Connection and Recovery', () => {
    it('should handle connection timeouts gracefully', async () => {
      // Mock connection timeout
      const originalQuery = testPrisma.$queryRaw;
      testPrisma.$queryRaw = jest.fn().mockRejectedValue(
        new Error('Connection timeout')
      );

      try {
        await expect(
          testPrisma.user.findMany()
        ).rejects.toThrow('Connection timeout');

      } finally {
        // Restore original method
        testPrisma.$queryRaw = originalQuery;
      }
    });

    it('should retry failed transactions', async () => {
      let attemptCount = 0;
      const user = await testDb.createTestUser();

      const retryableOperation = async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Temporary database error');
        }
        
        return await testPrisma.stockPosition.create({
          data: {
            userId: user.id,
            symbol: 'AAPL',
            companyName: 'Apple Inc.',
            quantity: 10,
            purchasePrice: 150.00,
            purchaseDate: new Date(),
            sector: 'Technology',
            marketCap: 'Large Cap'
          }
        });
      };

      // Implement retry logic
      let lastError;
      for (let i = 0; i < 3; i++) {
        try {
          const result = await retryableOperation();
          expect(result.symbol).toBe('AAPL');
          break;
        } catch (error) {
          lastError = error;
          if (i === 2) throw error; // Last attempt
          await new Promise(resolve => setTimeout(resolve, 100)); // Wait before retry
        }
      }

      expect(attemptCount).toBe(3);
    });

    it('should maintain data integrity during connection recovery', async () => {
      const user = await testDb.createTestUser();
      
      // Simulate connection interruption during transaction
      let connectionLost = false;
      const originalCreate = testPrisma.stockPosition.create;
      
      testPrisma.stockPosition.create = jest.fn().mockImplementation(async (args) => {
        if (!connectionLost) {
          connectionLost = true;
          throw new Error('Connection lost');
        }
        return originalCreate.call(testPrisma.stockPosition, args);
      });

      try {
        // First attempt should fail
        await expect(
          testPrisma.stockPosition.create({
            data: {
              userId: user.id,
              symbol: 'AAPL',
              companyName: 'Apple Inc.',
              quantity: 10,
              purchasePrice: 150.00,
              purchaseDate: new Date(),
              sector: 'Technology',
              marketCap: 'Large Cap'
            }
          })
        ).rejects.toThrow('Connection lost');

        // Second attempt should succeed (connection recovered)
        const position = await testPrisma.stockPosition.create({
          data: {
            userId: user.id,
            symbol: 'GOOGL',
            companyName: 'Alphabet Inc.',
            quantity: 5,
            purchasePrice: 2800.00,
            purchaseDate: new Date(),
            sector: 'Technology',
            marketCap: 'Large Cap'
          }
        });

        expect(position.symbol).toBe('GOOGL');

      } finally {
        // Restore original method
        testPrisma.stockPosition.create = originalCreate;
      }
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large transaction volumes efficiently', async () => {
      const user = await testDb.createTestUser();
      const batchSize = 100;

      const startTime = Date.now();

      // Create large batch of positions in transaction
      await testPrisma.$transaction(async (tx) => {
        const positions = [];
        for (let i = 0; i < batchSize; i++) {
          positions.push({
            userId: user.id,
            symbol: `STOCK${i}`,
            companyName: `Company ${i}`,
            quantity: Math.floor(Math.random() * 100) + 1,
            purchasePrice: Math.random() * 1000 + 50,
            purchaseDate: new Date(),
            sector: 'Technology',
            marketCap: 'Large Cap'
          });
        }

        // Use createMany for better performance
        await tx.stockPosition.createMany({
          data: positions
        });
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Verify all positions were created
      const positionCount = await testPrisma.stockPosition.count({
        where: { userId: user.id }
      });
      expect(positionCount).toBe(batchSize);

      // Should complete within reasonable time
      expect(duration).toBeLessThan(5000); // Less than 5 seconds
    });

    it('should maintain performance with concurrent transactions', async () => {
      const users = await Promise.all([
        testDb.createTestUser({ email: 'user1@example.com' }),
        testDb.createTestUser({ email: 'user2@example.com' }),
        testDb.createTestUser({ email: 'user3@example.com' })
      ]);

      const startTime = Date.now();

      // Run concurrent transactions for different users
      const transactionPromises = users.map(user =>
        testPrisma.$transaction(async (tx) => {
          // Create multiple positions for each user
          for (let i = 0; i < 10; i++) {
            await tx.stockPosition.create({
              data: {
                userId: user.id,
                symbol: `STOCK${i}`,
                companyName: `Company ${i}`,
                quantity: 10,
                purchasePrice: 100.00,
                purchaseDate: new Date(),
                sector: 'Technology',
                marketCap: 'Large Cap'
              }
            });
          }
        })
      );

      await Promise.all(transactionPromises);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Verify all positions were created
      const totalPositions = await testPrisma.stockPosition.count();
      expect(totalPositions).toBe(30); // 3 users × 10 positions

      // Should handle concurrent transactions efficiently
      expect(duration).toBeLessThan(10000); // Less than 10 seconds
    });
  });
});