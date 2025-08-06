import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import portfolioRoutes from '../../routes/portfolio';
import { testDb, testPrisma } from './testDatabase';
import { marketDataService } from '../../services/marketDataService';

// Mock market data service
jest.mock('../../services/marketDataService');
const mockMarketDataService = marketDataService as jest.Mocked<typeof marketDataService>;

// Create test app
const app = express();
app.use(express.json());
app.use('/api', portfolioRoutes);

describe('Portfolio Integration Tests', () => {
  let testUser: any;
  let authToken: string;

  beforeAll(async () => {
    await testDb.setupTestDatabase();
  });

  afterAll(async () => {
    await testDb.teardownTestDatabase();
  });

  beforeEach(async () => {
    await testDb.cleanupTestDatabase();
    
    // Create test user
    testUser = await testDb.createTestUser({
      email: 'portfolio-test@example.com'
    });

    // Generate auth token
    authToken = jwt.sign(
      { userId: testUser.id },
      process.env.JWT_SECRET || 'test-jwt-secret',
      { expiresIn: '24h' }
    );

    // Reset mocks
    jest.clearAllMocks();

    // Setup default market data mocks
    mockMarketDataService.validateSymbol.mockResolvedValue(true);
    mockMarketDataService.getCurrentPrice.mockResolvedValue({
      symbol: 'AAPL',
      price: 155.00,
      change: 5.00,
      changePercent: 3.33,
      lastUpdated: new Date()
    });
  });

  describe('POST /api/positions', () => {
    const validPositionData = {
      symbol: 'AAPL',
      quantity: 10,
      purchasePrice: 145.50,
      purchaseDate: '2024-01-15T00:00:00.000Z'
    };

    it('should create stock position and store in database', async () => {
      const response = await request(app)
        .post('/api/positions')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validPositionData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.symbol).toBe('AAPL');
      expect(response.body.data.quantity).toBe(10);
      expect(response.body.data.userId).toBe(testUser.id);

      // Verify position was created in database
      const positionInDb = await testPrisma.stockPosition.findFirst({
        where: {
          userId: testUser.id,
          symbol: 'AAPL'
        }
      });

      expect(positionInDb).toBeTruthy();
      expect(positionInDb?.quantity).toBe(10);
      expect(positionInDb?.purchasePrice).toBe(145.50);
      expect(positionInDb?.companyName).toBe('Apple Inc.');
      expect(positionInDb?.sector).toBe('Technology');

      // Verify market data service was called
      expect(mockMarketDataService.validateSymbol).toHaveBeenCalledWith('AAPL');
      expect(mockMarketDataService.getCurrentPrice).toHaveBeenCalledWith('AAPL');
    });

    it('should reject invalid stock symbol', async () => {
      mockMarketDataService.validateSymbol.mockResolvedValue(false);

      const invalidData = {
        ...validPositionData,
        symbol: 'INVALID'
      };

      const response = await request(app)
        .post('/api/positions')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid stock symbol');

      // Verify no position was created
      const positionCount = await testPrisma.stockPosition.count({
        where: { userId: testUser.id }
      });
      expect(positionCount).toBe(0);
    });

    it('should handle market data service failures gracefully', async () => {
      mockMarketDataService.validateSymbol.mockRejectedValue(new Error('API Error'));

      const response = await request(app)
        .post('/api/positions')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validPositionData)
        .expect(500);

      expect(response.body.success).toBe(false);

      // Verify no position was created
      const positionCount = await testPrisma.stockPosition.count({
        where: { userId: testUser.id }
      });
      expect(positionCount).toBe(0);
    });

    it('should validate quantity constraints', async () => {
      const invalidData = {
        ...validPositionData,
        quantity: -5
      };

      const response = await request(app)
        .post('/api/positions')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.details).toBeDefined();

      // Verify no position was created
      const positionCount = await testPrisma.stockPosition.count({
        where: { userId: testUser.id }
      });
      expect(positionCount).toBe(0);
    });

    it('should validate purchase date constraints', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);

      const invalidData = {
        ...validPositionData,
        purchaseDate: futureDate.toISOString()
      };

      const response = await request(app)
        .post('/api/positions')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.details).toBeDefined();

      // Verify no position was created
      const positionCount = await testPrisma.stockPosition.count({
        where: { userId: testUser.id }
      });
      expect(positionCount).toBe(0);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/positions')
        .send(validPositionData)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('token required');
    });
  });

  describe('PUT /api/positions/:id', () => {
    let testPosition: any;

    beforeEach(async () => {
      testPosition = await testDb.createTestStockPosition(testUser.id, {
        symbol: 'AAPL',
        quantity: 10,
        purchasePrice: 145.50
      });
    });

    it('should update stock position in database', async () => {
      const updateData = {
        quantity: 15,
        purchasePrice: 140.00
      };

      const response = await request(app)
        .put(`/api/positions/${testPosition.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.quantity).toBe(15);
      expect(response.body.data.purchasePrice).toBe(140.00);

      // Verify position was updated in database
      const updatedPosition = await testPrisma.stockPosition.findUnique({
        where: { id: testPosition.id }
      });

      expect(updatedPosition?.quantity).toBe(15);
      expect(updatedPosition?.purchasePrice).toBe(140.00);
      expect(updatedPosition?.updatedAt).not.toEqual(testPosition.updatedAt);
    });

    it('should reject updates to non-existent position', async () => {
      const updateData = { quantity: 15 };

      const response = await request(app)
        .put('/api/positions/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });

    it('should prevent users from updating other users positions', async () => {
      // Create another user and position
      const otherUser = await testDb.createTestUser({
        email: 'other-user@example.com'
      });
      const otherPosition = await testDb.createTestStockPosition(otherUser.id);

      const updateData = { quantity: 15 };

      const response = await request(app)
        .put(`/api/positions/${otherPosition.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found or access denied');

      // Verify position was not updated
      const unchangedPosition = await testPrisma.stockPosition.findUnique({
        where: { id: otherPosition.id }
      });
      expect(unchangedPosition?.quantity).toBe(otherPosition.quantity);
    });

    it('should validate update data', async () => {
      const invalidData = {
        quantity: -5,
        purchasePrice: -100
      };

      const response = await request(app)
        .put(`/api/positions/${testPosition.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.details).toBeDefined();

      // Verify position was not updated
      const unchangedPosition = await testPrisma.stockPosition.findUnique({
        where: { id: testPosition.id }
      });
      expect(unchangedPosition?.quantity).toBe(testPosition.quantity);
    });
  });

  describe('DELETE /api/positions/:id', () => {
    let testPosition: any;

    beforeEach(async () => {
      testPosition = await testDb.createTestStockPosition(testUser.id);
    });

    it('should delete stock position from database', async () => {
      const response = await request(app)
        .delete(`/api/positions/${testPosition.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('deleted successfully');

      // Verify position was deleted from database
      const deletedPosition = await testPrisma.stockPosition.findUnique({
        where: { id: testPosition.id }
      });
      expect(deletedPosition).toBeNull();
    });

    it('should reject deletion of non-existent position', async () => {
      const response = await request(app)
        .delete('/api/positions/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });

    it('should prevent users from deleting other users positions', async () => {
      // Create another user and position
      const otherUser = await testDb.createTestUser({
        email: 'other-user@example.com'
      });
      const otherPosition = await testDb.createTestStockPosition(otherUser.id);

      const response = await request(app)
        .delete(`/api/positions/${otherPosition.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found or access denied');

      // Verify position still exists
      const existingPosition = await testPrisma.stockPosition.findUnique({
        where: { id: otherPosition.id }
      });
      expect(existingPosition).toBeTruthy();
    });
  });

  describe('GET /api/portfolio', () => {
    beforeEach(async () => {
      // Create multiple test positions
      await testDb.createTestStockPosition(testUser.id, {
        symbol: 'AAPL',
        quantity: 10,
        purchasePrice: 145.50,
        currentPrice: 155.00
      });

      await testDb.createTestStockPosition(testUser.id, {
        symbol: 'GOOGL',
        quantity: 5,
        purchasePrice: 2800.00,
        currentPrice: 2850.00
      });

      await testDb.createTestStockPosition(testUser.id, {
        symbol: 'MSFT',
        quantity: 8,
        purchasePrice: 300.00,
        currentPrice: 310.00
      });
    });

    it('should retrieve complete portfolio from database', async () => {
      const response = await request(app)
        .get('/api/portfolio')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.userId).toBe(testUser.id);
      expect(response.body.data.positions).toHaveLength(3);

      // Verify portfolio calculations
      const portfolio = response.body.data;
      expect(portfolio.totalValue).toBeGreaterThan(0);
      expect(portfolio.totalCost).toBeGreaterThan(0);
      expect(portfolio.unrealizedGainLoss).toBeDefined();
      expect(portfolio.unrealizedGainLossPercent).toBeDefined();

      // Verify positions contain required fields
      portfolio.positions.forEach((position: any) => {
        expect(position.symbol).toBeDefined();
        expect(position.quantity).toBeGreaterThan(0);
        expect(position.purchasePrice).toBeGreaterThan(0);
        expect(position.userId).toBe(testUser.id);
      });
    });

    it('should return empty portfolio for user with no positions', async () => {
      // Clean up existing positions
      await testPrisma.stockPosition.deleteMany({
        where: { userId: testUser.id }
      });

      const response = await request(app)
        .get('/api/portfolio')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.userId).toBe(testUser.id);
      expect(response.body.data.positions).toHaveLength(0);
      expect(response.body.data.totalValue).toBe(0);
      expect(response.body.data.totalCost).toBe(0);
      expect(response.body.data.unrealizedGainLoss).toBe(0);
    });

    it('should only return positions for authenticated user', async () => {
      // Create another user with positions
      const otherUser = await testDb.createTestUser({
        email: 'other-user@example.com'
      });
      await testDb.createTestStockPosition(otherUser.id, {
        symbol: 'TSLA',
        quantity: 20
      });

      const response = await request(app)
        .get('/api/portfolio')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.positions).toHaveLength(3); // Only testUser's positions
      
      // Verify no TSLA position (belongs to other user)
      const symbols = response.body.data.positions.map((p: any) => p.symbol);
      expect(symbols).not.toContain('TSLA');
    });

    it('should handle database errors gracefully', async () => {
      // Mock database error
      const originalFindMany = testPrisma.stockPosition.findMany;
      testPrisma.stockPosition.findMany = jest.fn().mockRejectedValue(
        new Error('Database connection error')
      );

      try {
        const response = await request(app)
          .get('/api/portfolio')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(500);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toBeDefined();

      } finally {
        // Restore original method
        testPrisma.stockPosition.findMany = originalFindMany;
      }
    });
  });

  describe('Database Transaction Integrity', () => {
    it('should rollback position creation on market data failure', async () => {
      // Mock market data service to fail after validation
      mockMarketDataService.validateSymbol.mockResolvedValue(true);
      mockMarketDataService.getCurrentPrice.mockRejectedValue(
        new Error('Market data service error')
      );

      const positionData = {
        symbol: 'AAPL',
        quantity: 10,
        purchasePrice: 145.50,
        purchaseDate: '2024-01-15T00:00:00.000Z'
      };

      const response = await request(app)
        .post('/api/positions')
        .set('Authorization', `Bearer ${authToken}`)
        .send(positionData)
        .expect(500);

      expect(response.body.success).toBe(false);

      // Verify no position was created due to transaction rollback
      const positionCount = await testPrisma.stockPosition.count({
        where: { userId: testUser.id }
      });
      expect(positionCount).toBe(0);
    });

    it('should handle concurrent position updates correctly', async () => {
      const testPosition = await testDb.createTestStockPosition(testUser.id);

      // Attempt concurrent updates
      const updatePromises = [
        request(app)
          .put(`/api/positions/${testPosition.id}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ quantity: 15 }),
        request(app)
          .put(`/api/positions/${testPosition.id}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ quantity: 20 }),
        request(app)
          .put(`/api/positions/${testPosition.id}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ quantity: 25 })
      ];

      const results = await Promise.allSettled(updatePromises);

      // At least one should succeed
      const successful = results.filter(r => 
        r.status === 'fulfilled' && (r.value as any).status === 200
      );
      expect(successful.length).toBeGreaterThan(0);

      // Verify final state is consistent
      const finalPosition = await testPrisma.stockPosition.findUnique({
        where: { id: testPosition.id }
      });
      expect(finalPosition?.quantity).toBeOneOf([15, 20, 25]);
    });

    it('should maintain referential integrity on user deletion', async () => {
      // Create positions for user
      const position1 = await testDb.createTestStockPosition(testUser.id);
      const position2 = await testDb.createTestStockPosition(testUser.id, {
        symbol: 'GOOGL'
      });

      // Delete user (should cascade delete positions)
      await testPrisma.user.delete({
        where: { id: testUser.id }
      });

      // Verify positions were deleted
      const remainingPositions = await testPrisma.stockPosition.findMany({
        where: { userId: testUser.id }
      });
      expect(remainingPositions).toHaveLength(0);

      // Verify notification settings were also deleted
      const remainingSettings = await testPrisma.notificationSettings.findUnique({
        where: { userId: testUser.id }
      });
      expect(remainingSettings).toBeNull();
    });
  });
});