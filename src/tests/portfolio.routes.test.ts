// Mock all dependencies before importing
jest.mock('../lib/database');
jest.mock('../services/marketDataService');
jest.mock('../services/portfolioService');
jest.mock('../middleware/auth');

import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import portfolioRoutes from '../routes/portfolio';
import { portfolioService } from '../services/portfolioService';
import { authenticateToken } from '../middleware/auth';

// Mock implementations
const mockPortfolioService = portfolioService as jest.Mocked<typeof portfolioService>;
const mockAuthenticateToken = authenticateToken as jest.MockedFunction<typeof authenticateToken>;

// Create test app
const app = express();
app.use(express.json());
app.use('/api', portfolioRoutes);

describe('Portfolio Routes', () => {
  const mockUserId = 'test-user-123';
  let authToken: string;

  beforeAll(() => {
    // Generate auth token directly using jwt
    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
    authToken = jwt.sign({ userId: mockUserId }, JWT_SECRET, { expiresIn: '24h' });
  });

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock authentication middleware to pass through with mock user
    mockAuthenticateToken.mockImplementation(async (req: any, res: any, next: any) => {
      req.user = { id: mockUserId };
      next();
    });
  });

  describe('POST /api/positions', () => {
    it('should create a new stock position successfully', async () => {
      const positionData = {
        symbol: 'AAPL',
        quantity: 10,
        purchasePrice: 145.50,
        purchaseDate: '2024-01-15T00:00:00.000Z'
      };

      const mockCreatedPosition = {
        id: 'position-123',
        userId: mockUserId,
        symbol: 'AAPL',
        companyName: 'Apple Inc.',
        quantity: 10,
        purchasePrice: 145.50,
        purchaseDate: new Date('2024-01-15T00:00:00.000Z'),
        currentPrice: 150.00,
        sector: 'Technology',
        marketCap: 'Large Cap',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPortfolioService.addPosition.mockResolvedValue(mockCreatedPosition);

      const response = await request(app)
        .post('/api/positions')
        .set('Authorization', `Bearer ${authToken}`)
        .send(positionData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        symbol: 'AAPL',
        quantity: 10,
        purchasePrice: 145.50,
        userId: mockUserId
      });
      expect(response.body.message).toBe('Stock position added successfully');

      expect(mockPortfolioService.addPosition).toHaveBeenCalledWith(mockUserId, {
        symbol: 'AAPL',
        quantity: 10,
        purchasePrice: 145.50,
        purchaseDate: new Date('2024-01-15T00:00:00.000Z')
      });
    });

    it('should return 400 for invalid stock symbol', async () => {
      const positionData = {
        symbol: 'INVALID',
        quantity: 10,
        purchasePrice: 145.50,
        purchaseDate: '2024-01-15T00:00:00.000Z'
      };

      mockPortfolioService.addPosition.mockRejectedValue(new Error('Invalid stock symbol: INVALID'));

      const response = await request(app)
        .post('/api/positions')
        .set('Authorization', `Bearer ${authToken}`)
        .send(positionData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid stock symbol');
    });

    it('should return 400 for invalid quantity', async () => {
      const positionData = {
        symbol: 'AAPL',
        quantity: -5,
        purchasePrice: 145.50,
        purchaseDate: '2024-01-15T00:00:00.000Z'
      };

      const response = await request(app)
        .post('/api/positions')
        .set('Authorization', `Bearer ${authToken}`)
        .send(positionData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.details).toBeDefined();
    });

    it('should return 400 for future purchase date', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);

      const positionData = {
        symbol: 'AAPL',
        quantity: 10,
        purchasePrice: 145.50,
        purchaseDate: futureDate.toISOString()
      };

      const response = await request(app)
        .post('/api/positions')
        .set('Authorization', `Bearer ${authToken}`)
        .send(positionData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.details).toBeDefined();
    });

    it('should return 401 without authentication', async () => {
      // Mock authentication middleware to reject
      mockAuthenticateToken.mockImplementation(async (req: any, res: any, next: any) => {
        res.status(401).json({
          success: false,
          error: 'Access token required'
        });
      });

      const positionData = {
        symbol: 'AAPL',
        quantity: 10,
        purchasePrice: 145.50,
        purchaseDate: '2024-01-15T00:00:00.000Z'
      };

      const response = await request(app)
        .post('/api/positions')
        .send(positionData)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Access token required');
    });
  });

  describe('PUT /api/positions/:id', () => {
    const mockPositionId = 'position-123';

    it('should update a stock position successfully', async () => {
      const updateData = {
        quantity: 15,
        purchasePrice: 140.00
      };

      const mockPortfolio = {
        userId: mockUserId,
        positions: [{
          id: mockPositionId,
          userId: mockUserId,
          symbol: 'AAPL',
          companyName: 'Apple Inc.',
          quantity: 10,
          purchasePrice: 145.50,
          purchaseDate: new Date('2024-01-15'),
          currentPrice: 150.00,
          sector: 'Technology',
          marketCap: 'Large Cap',
          createdAt: new Date(),
          updatedAt: new Date(),
        }],
        totalValue: 1500,
        totalCost: 1455,
        unrealizedGainLoss: 45,
        unrealizedGainLossPercent: 3.09,
        lastUpdated: new Date()
      };

      const mockUpdatedPosition = {
        ...mockPortfolio.positions[0],
        quantity: 15,
        purchasePrice: 140.00,
        updatedAt: new Date()
      };

      mockPortfolioService.getPortfolio.mockResolvedValue(mockPortfolio);
      mockPortfolioService.updatePosition.mockResolvedValue(mockUpdatedPosition);

      const response = await request(app)
        .put(`/api/positions/${mockPositionId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        id: mockPositionId,
        quantity: 15,
        purchasePrice: 140.00
      });
      expect(response.body.message).toBe('Stock position updated successfully');

      expect(mockPortfolioService.updatePosition).toHaveBeenCalledWith(mockPositionId, {
        quantity: 15,
        purchasePrice: 140.00
      });
    });

    it('should return 404 for non-existent position', async () => {
      const updateData = {
        quantity: 15
      };

      const mockEmptyPortfolio = {
        userId: mockUserId,
        positions: [],
        totalValue: 0,
        totalCost: 0,
        unrealizedGainLoss: 0,
        unrealizedGainLossPercent: 0,
        lastUpdated: new Date()
      };

      mockPortfolioService.getPortfolio.mockResolvedValue(mockEmptyPortfolio);

      const response = await request(app)
        .put('/api/positions/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Stock position not found or access denied');
    });

    it('should return 400 for invalid quantity', async () => {
      const updateData = {
        quantity: -5
      };

      const response = await request(app)
        .put(`/api/positions/${mockPositionId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.details).toBeDefined();
    });

    it('should return 401 without authentication', async () => {
      // Mock authentication middleware to reject
      mockAuthenticateToken.mockImplementation(async (req: any, res: any, next: any) => {
        res.status(401).json({
          success: false,
          error: 'Access token required'
        });
      });

      const updateData = {
        quantity: 15
      };

      const response = await request(app)
        .put(`/api/positions/${mockPositionId}`)
        .send(updateData)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Access token required');
    });
  });

  describe('DELETE /api/positions/:id', () => {
    const mockPositionId = 'position-123';

    it('should delete a stock position successfully', async () => {
      const mockPortfolio = {
        userId: mockUserId,
        positions: [{
          id: mockPositionId,
          userId: mockUserId,
          symbol: 'AAPL',
          companyName: 'Apple Inc.',
          quantity: 10,
          purchasePrice: 145.50,
          purchaseDate: new Date('2024-01-15'),
          currentPrice: 150.00,
          sector: 'Technology',
          marketCap: 'Large Cap',
          createdAt: new Date(),
          updatedAt: new Date(),
        }],
        totalValue: 1500,
        totalCost: 1455,
        unrealizedGainLoss: 45,
        unrealizedGainLossPercent: 3.09,
        lastUpdated: new Date()
      };

      mockPortfolioService.getPortfolio.mockResolvedValue(mockPortfolio);
      mockPortfolioService.deletePosition.mockResolvedValue(undefined);

      const response = await request(app)
        .delete(`/api/positions/${mockPositionId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Stock position deleted successfully');

      expect(mockPortfolioService.deletePosition).toHaveBeenCalledWith(mockPositionId);
    });

    it('should return 404 for non-existent position', async () => {
      const mockEmptyPortfolio = {
        userId: mockUserId,
        positions: [],
        totalValue: 0,
        totalCost: 0,
        unrealizedGainLoss: 0,
        unrealizedGainLossPercent: 0,
        lastUpdated: new Date()
      };

      mockPortfolioService.getPortfolio.mockResolvedValue(mockEmptyPortfolio);

      const response = await request(app)
        .delete('/api/positions/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Stock position not found or access denied');
    });

    it('should return 401 without authentication', async () => {
      // Mock authentication middleware to reject
      mockAuthenticateToken.mockImplementation(async (req: any, res: any, next: any) => {
        res.status(401).json({
          success: false,
          error: 'Access token required'
        });
      });

      const response = await request(app)
        .delete(`/api/positions/${mockPositionId}`)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Access token required');
    });
  });

  describe('GET /api/portfolio', () => {
    it('should retrieve user portfolio successfully', async () => {
      const mockPortfolio = {
        userId: mockUserId,
        positions: [
          {
            id: 'position-1',
            userId: mockUserId,
            symbol: 'AAPL',
            companyName: 'Apple Inc.',
            quantity: 10,
            purchasePrice: 145.50,
            purchaseDate: new Date('2024-01-15'),
            currentPrice: 150.00,
            sector: 'Technology',
            marketCap: 'Large Cap',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: 'position-2',
            userId: mockUserId,
            symbol: 'GOOGL',
            companyName: 'Alphabet Inc.',
            quantity: 5,
            purchasePrice: 2800.00,
            purchaseDate: new Date('2024-01-10'),
            currentPrice: 2850.00,
            sector: 'Technology',
            marketCap: 'Large Cap',
            createdAt: new Date(),
            updatedAt: new Date(),
          }
        ],
        totalValue: 15750, // (10 * 150) + (5 * 2850)
        totalCost: 15455, // (10 * 145.50) + (5 * 2800)
        unrealizedGainLoss: 295,
        unrealizedGainLossPercent: 1.91,
        lastUpdated: new Date()
      };

      mockPortfolioService.getPortfolio.mockResolvedValue(mockPortfolio);

      const response = await request(app)
        .get('/api/portfolio')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        userId: mockUserId,
        positions: expect.arrayContaining([
          expect.objectContaining({
            symbol: 'AAPL',
            quantity: 10,
            purchasePrice: 145.50
          }),
          expect.objectContaining({
            symbol: 'GOOGL',
            quantity: 5,
            purchasePrice: 2800.00
          })
        ])
      });
      expect(response.body.data.totalValue).toBe(15750);
      expect(response.body.data.totalCost).toBe(15455);
      expect(response.body.message).toBe('Portfolio retrieved successfully');

      expect(mockPortfolioService.getPortfolio).toHaveBeenCalledWith(mockUserId);
    });

    it('should return empty portfolio for user with no positions', async () => {
      const mockEmptyPortfolio = {
        userId: mockUserId,
        positions: [],
        totalValue: 0,
        totalCost: 0,
        unrealizedGainLoss: 0,
        unrealizedGainLossPercent: 0,
        lastUpdated: new Date()
      };

      mockPortfolioService.getPortfolio.mockResolvedValue(mockEmptyPortfolio);

      const response = await request(app)
        .get('/api/portfolio')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        userId: mockUserId,
        positions: [],
        totalValue: 0,
        totalCost: 0,
        unrealizedGainLoss: 0,
        unrealizedGainLossPercent: 0
      });
    });

    it('should return 401 without authentication', async () => {
      // Mock authentication middleware to reject
      mockAuthenticateToken.mockImplementation(async (req: any, res: any, next: any) => {
        res.status(401).json({
          success: false,
          error: 'Access token required'
        });
      });

      const response = await request(app)
        .get('/api/portfolio')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Access token required');
    });
  });

  describe('Error Handling', () => {
    it('should handle portfolio service errors gracefully', async () => {
      const positionData = {
        symbol: 'AAPL',
        quantity: 10,
        purchasePrice: 145.50,
        purchaseDate: '2024-01-15T00:00:00.000Z'
      };

      mockPortfolioService.addPosition.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/api/positions')
        .set('Authorization', `Bearer ${authToken}`)
        .send(positionData)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });

    it('should handle portfolio retrieval errors gracefully', async () => {
      mockPortfolioService.getPortfolio.mockRejectedValue(new Error('Service error'));

      const response = await request(app)
        .get('/api/portfolio')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });
  });
});