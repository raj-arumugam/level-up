import express, { Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { validateAnalyticsQuery } from '../middleware/validation';
import { portfolioService } from '../services/portfolioService';
import { analyticsService } from '../services/analyticsService';
import { ApiResponse } from '../types';

const router = express.Router();

// Validation rules are now imported from middleware/validation.ts

/**
 * GET /api/analytics/sectors
 * Get sector breakdown of user's portfolio
 */
router.get('/sectors', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const portfolio = await portfolioService.getPortfolio(userId);

    if (portfolio.positions.length === 0) {
      const response: ApiResponse = {
        success: true,
        data: [],
        message: 'No positions found for sector analysis'
      };
      res.status(200).json(response);
      return;
    }

    const sectorAllocation = await analyticsService.calculateSectorAllocation(portfolio);

    const response: ApiResponse = {
      success: true,
      data: sectorAllocation,
      message: 'Sector allocation retrieved successfully'
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Error retrieving sector allocation:', error);
    
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to retrieve sector allocation'
    };

    res.status(500).json(response);
  }
});

/**
 * GET /api/analytics/performance
 * Get portfolio performance metrics
 */
router.get('/performance', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const portfolioMetrics = await portfolioService.calculatePortfolioMetrics(userId);

    const response: ApiResponse = {
      success: true,
      data: portfolioMetrics,
      message: 'Portfolio performance metrics retrieved successfully'
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Error retrieving portfolio performance:', error);
    
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to retrieve portfolio performance'
    };

    res.status(500).json(response);
  }
});

/**
 * GET /api/analytics/historical
 * Get historical portfolio performance data
 */
router.get('/historical', authenticateToken, validateAnalyticsQuery, async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { period = '1m', startDate, endDate } = req.query;

    // Calculate date range based on period or custom dates
    let dateRange: { startDate: Date; endDate: Date };
    
    if (startDate && endDate) {
      dateRange = {
        startDate: new Date(startDate as string),
        endDate: new Date(endDate as string)
      };
    } else {
      const now = new Date();
      const start = new Date();
      
      switch (period) {
        case '1d':
          start.setDate(now.getDate() - 1);
          break;
        case '1w':
          start.setDate(now.getDate() - 7);
          break;
        case '1m':
          start.setMonth(now.getMonth() - 1);
          break;
        case '3m':
          start.setMonth(now.getMonth() - 3);
          break;
        case '6m':
          start.setMonth(now.getMonth() - 6);
          break;
        case '1y':
          start.setFullYear(now.getFullYear() - 1);
          break;
        case 'all':
          start.setFullYear(2020); // Set to a reasonable start date
          break;
        default:
          start.setMonth(now.getMonth() - 1);
      }
      
      dateRange = { startDate: start, endDate: now };
    }

    const performanceReport = await analyticsService.generatePerformanceReport(userId, {
      period: period as string,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate
    });

    const response: ApiResponse = {
      success: true,
      data: performanceReport,
      message: 'Historical performance data retrieved successfully'
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Error retrieving historical performance:', error);
    
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to retrieve historical performance'
    };

    res.status(500).json(response);
  }
});

/**
 * GET /api/analytics/benchmark
 * Compare portfolio performance with market benchmarks
 */
router.get('/benchmark', authenticateToken, validateAnalyticsQuery, async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { benchmark = 'SPY', period = '1m' } = req.query;

    const portfolio = await portfolioService.getPortfolio(userId);
    
    if (portfolio.positions.length === 0) {
      const response: ApiResponse = {
        success: true,
        data: {
          portfolioReturn: 0,
          benchmarkReturn: 0,
          outperformance: 0,
          correlation: 0,
          beta: 0
        },
        message: 'No positions found for benchmark comparison'
      };
      res.status(200).json(response);
      return;
    }

    const benchmarkComparison = await analyticsService.compareWithBenchmark(
      portfolio, 
      benchmark as string,
      period as string
    );

    const response: ApiResponse = {
      success: true,
      data: benchmarkComparison,
      message: 'Benchmark comparison retrieved successfully'
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Error retrieving benchmark comparison:', error);
    
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to retrieve benchmark comparison'
    };

    res.status(500).json(response);
  }
});

/**
 * GET /api/analytics/summary
 * Get comprehensive portfolio analytics summary
 */
router.get('/summary', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    
    // Get all analytics data in parallel
    const [portfolio, portfolioMetrics] = await Promise.all([
      portfolioService.getPortfolio(userId),
      portfolioService.calculatePortfolioMetrics(userId)
    ]);

    let sectorAllocation: any[] = [];
    let benchmarkComparison: any = null;

    if (portfolio.positions.length > 0) {
      [sectorAllocation, benchmarkComparison] = await Promise.all([
        analyticsService.calculateSectorAllocation(portfolio),
        analyticsService.compareWithBenchmark(portfolio, 'SPY', '1m').catch(() => null)
      ]);
    }

    const summary = {
      portfolio: {
        totalValue: portfolio.totalValue,
        totalCost: portfolio.totalCost,
        unrealizedGainLoss: portfolio.unrealizedGainLoss,
        unrealizedGainLossPercent: portfolio.unrealizedGainLossPercent,
        positionCount: portfolio.positions.length
      },
      performance: {
        dailyChange: portfolioMetrics.dailyChange,
        dailyChangePercent: portfolioMetrics.dailyChangePercent,
        totalReturn: portfolioMetrics.totalReturn,
        totalReturnPercent: portfolioMetrics.totalReturnPercent
      },
      allocation: {
        sectors: sectorAllocation,
        marketCap: portfolioMetrics.marketCapDistribution
      },
      topPositions: {
        performers: portfolioMetrics.topPerformers.slice(0, 3),
        losers: portfolioMetrics.topLosers.slice(0, 3)
      },
      benchmark: benchmarkComparison,
      lastUpdated: portfolio.lastUpdated
    };

    const response: ApiResponse = {
      success: true,
      data: summary,
      message: 'Portfolio analytics summary retrieved successfully'
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Error retrieving analytics summary:', error);
    
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to retrieve analytics summary'
    };

    res.status(500).json(response);
  }
});

export default router;