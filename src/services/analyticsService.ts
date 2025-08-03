import { prisma } from '../lib/database';
import { marketDataService } from './marketDataService';
import {
  Portfolio,
  StockPosition,
  SectorAllocation,
  MarketCapDistribution,
  PerformanceReport,
  BenchmarkComparison,
  SectorPerformance,
  HistoricalPrice
} from '../types';

export interface AnalyticsServiceInterface {
  calculateSectorAllocation(portfolio: Portfolio): Promise<SectorAllocation[]>;
  calculateMarketCapDistribution(portfolio: Portfolio): Promise<MarketCapDistribution>;
  generatePerformanceReport(userId: string, options?: { period: string; startDate: Date; endDate: Date }): Promise<PerformanceReport>;
  compareWithBenchmark(portfolio: Portfolio, benchmark: string, period?: string): Promise<BenchmarkComparison>;
}

export class AnalyticsService implements AnalyticsServiceInterface {
  /**
   * Calculate sector allocation for a portfolio
   */
  async calculateSectorAllocation(portfolio: Portfolio): Promise<SectorAllocation[]> {
    if (portfolio.positions.length === 0 || portfolio.totalValue === 0) {
      return [];
    }

    const sectorMap = new Map<string, { value: number; positions: number }>();

    // Group positions by sector
    portfolio.positions.forEach(position => {
      const sector = position.sector || 'Unknown';
      const positionValue = position.quantity * (position.currentPrice || position.purchasePrice);
      
      const existing = sectorMap.get(sector) || { value: 0, positions: 0 };
      sectorMap.set(sector, {
        value: existing.value + positionValue,
        positions: existing.positions + 1
      });
    });

    // Convert to SectorAllocation array and sort by value
    const sectorAllocations: SectorAllocation[] = Array.from(sectorMap.entries())
      .map(([sector, data]) => ({
        sector,
        value: data.value,
        percentage: (data.value / portfolio.totalValue) * 100,
        positions: data.positions
      }))
      .sort((a, b) => b.value - a.value);

    return sectorAllocations;
  }

  /**
   * Calculate market cap distribution for a portfolio
   */
  async calculateMarketCapDistribution(portfolio: Portfolio): Promise<MarketCapDistribution> {
    const distribution: MarketCapDistribution = {
      largeCap: { value: 0, percentage: 0, count: 0 },
      midCap: { value: 0, percentage: 0, count: 0 },
      smallCap: { value: 0, percentage: 0, count: 0 }
    };

    if (portfolio.positions.length === 0 || portfolio.totalValue === 0) {
      return distribution;
    }

    // Categorize positions by market cap
    portfolio.positions.forEach(position => {
      const positionValue = position.quantity * (position.currentPrice || position.purchasePrice);
      const marketCap = position.marketCap || 'Unknown';
      
      if (this.isLargeCap(marketCap)) {
        distribution.largeCap.value += positionValue;
        distribution.largeCap.count += 1;
      } else if (this.isMidCap(marketCap)) {
        distribution.midCap.value += positionValue;
        distribution.midCap.count += 1;
      } else if (this.isSmallCap(marketCap)) {
        distribution.smallCap.value += positionValue;
        distribution.smallCap.count += 1;
      } else {
        // Default unknown to large cap for conservative estimation
        distribution.largeCap.value += positionValue;
        distribution.largeCap.count += 1;
      }
    });

    // Calculate percentages
    distribution.largeCap.percentage = (distribution.largeCap.value / portfolio.totalValue) * 100;
    distribution.midCap.percentage = (distribution.midCap.value / portfolio.totalValue) * 100;
    distribution.smallCap.percentage = (distribution.smallCap.value / portfolio.totalValue) * 100;

    return distribution;
  }

  /**
   * Generate comprehensive performance report for a user's portfolio
   */
  async generatePerformanceReport(userId: string, options?: { period: string; startDate: Date; endDate: Date }): Promise<PerformanceReport> {
    const period = options?.period || '1mo';
    // Get current portfolio
    const currentPositions = await prisma.stockPosition.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });

    if (currentPositions.length === 0) {
      return {
        period,
        startValue: 0,
        endValue: 0,
        totalReturn: 0,
        totalReturnPercent: 0,
        sectorPerformance: []
      };
    }

    // Calculate current portfolio value
    const symbols = [...new Set(currentPositions.map(pos => pos.symbol))];
    let currentPrices: Map<string, number>;
    
    try {
      const priceData = await marketDataService.getBatchPrices(symbols);
      currentPrices = new Map(priceData.map(price => [price.symbol, price.price]));
    } catch (error) {
      console.warn('Failed to fetch current prices for performance report:', error);
      currentPrices = new Map();
    }

    const endValue = currentPositions.reduce((sum, pos) => {
      const currentPrice = currentPrices.get(pos.symbol) || pos.currentPrice || pos.purchasePrice;
      return sum + (pos.quantity * currentPrice);
    }, 0);

    // Calculate start value (this is simplified - in a real implementation, 
    // you'd need historical portfolio data)
    const startValue = currentPositions.reduce((sum, pos) => 
      sum + (pos.quantity * pos.purchasePrice), 0
    );

    const totalReturn = endValue - startValue;
    const totalReturnPercent = startValue > 0 ? (totalReturn / startValue) * 100 : 0;

    // Calculate sector performance
    const sectorPerformance = await this.calculateSectorPerformance(currentPositions, currentPrices);

    // Get benchmark comparison if requested
    let benchmarkComparison: BenchmarkComparison | undefined;
    try {
      const portfolio = {
        userId,
        positions: currentPositions,
        totalValue: endValue,
        totalCost: startValue,
        unrealizedGainLoss: totalReturn,
        unrealizedGainLossPercent: totalReturnPercent,
        lastUpdated: new Date()
      };
      benchmarkComparison = await this.compareWithBenchmark(portfolio, 'SPY');
    } catch (error) {
      console.warn('Failed to get benchmark comparison:', error);
    }

    return {
      period,
      startValue,
      endValue,
      totalReturn,
      totalReturnPercent,
      benchmarkComparison,
      sectorPerformance
    };
  }

  /**
   * Compare portfolio performance with a benchmark
   */
  async compareWithBenchmark(portfolio: Portfolio, benchmark: string = 'SPY', period: string = '1mo'): Promise<BenchmarkComparison> {
    try {
      // Get benchmark historical data
      const benchmarkData = await marketDataService.getHistoricalData(benchmark, period);
      
      if (benchmarkData.length < 2) {
        throw new Error('Insufficient benchmark data');
      }

      // Calculate benchmark return (simplified - using first and last data points)
      const benchmarkStartPrice = benchmarkData[benchmarkData.length - 1].close;
      const benchmarkEndPrice = benchmarkData[0].close;
      const benchmarkReturn = ((benchmarkEndPrice - benchmarkStartPrice) / benchmarkStartPrice) * 100;

      // Portfolio return
      const portfolioReturn = portfolio.unrealizedGainLossPercent;

      // Calculate outperformance
      const outperformance = portfolioReturn - benchmarkReturn;

      // Calculate correlation and beta (simplified calculations)
      // In a real implementation, you'd need more sophisticated statistical analysis
      const correlation = this.calculateCorrelation(portfolio, benchmarkData);
      const beta = this.calculateBeta(portfolio, benchmarkData);

      return {
        portfolioReturn,
        benchmarkReturn,
        outperformance,
        correlation,
        beta
      };
    } catch (error) {
      console.error('Failed to compare with benchmark:', error);
      throw new Error(`Unable to compare with benchmark ${benchmark}`);
    }
  }

  /**
   * Calculate sector performance for positions
   */
  private async calculateSectorPerformance(
    positions: StockPosition[], 
    currentPrices: Map<string, number>
  ): Promise<SectorPerformance[]> {
    const sectorMap = new Map<string, { 
      totalCost: number; 
      totalValue: number; 
      positions: number 
    }>();

    // Group by sector and calculate totals
    positions.forEach(position => {
      const sector = position.sector || 'Unknown';
      const positionCost = position.quantity * position.purchasePrice;
      const currentPrice = currentPrices.get(position.symbol) || position.currentPrice || position.purchasePrice;
      const positionValue = position.quantity * currentPrice;

      const existing = sectorMap.get(sector) || { totalCost: 0, totalValue: 0, positions: 0 };
      sectorMap.set(sector, {
        totalCost: existing.totalCost + positionCost,
        totalValue: existing.totalValue + positionValue,
        positions: existing.positions + 1
      });
    });

    // Calculate performance metrics for each sector
    const sectorPerformance: SectorPerformance[] = Array.from(sectorMap.entries())
      .map(([sector, data]) => {
        const sectorReturn = data.totalValue - data.totalCost;
        const sectorReturnPercent = data.totalCost > 0 ? (sectorReturn / data.totalCost) * 100 : 0;
        
        // Calculate contribution to total portfolio performance
        const totalPortfolioValue = Array.from(sectorMap.values())
          .reduce((sum, s) => sum + s.totalValue, 0);
        const contribution = totalPortfolioValue > 0 ? (sectorReturn / totalPortfolioValue) * 100 : 0;

        return {
          sector,
          return: sectorReturn,
          returnPercent: sectorReturnPercent,
          contribution
        };
      })
      .sort((a, b) => b.returnPercent - a.returnPercent);

    return sectorPerformance;
  }

  /**
   * Helper method to determine if a market cap is large cap
   */
  private isLargeCap(marketCap: string): boolean {
    const lowerCap = marketCap.toLowerCase();
    return lowerCap.includes('large') || lowerCap.includes('mega') || lowerCap.includes('giant');
  }

  /**
   * Helper method to determine if a market cap is mid cap
   */
  private isMidCap(marketCap: string): boolean {
    const lowerCap = marketCap.toLowerCase();
    return lowerCap.includes('mid');
  }

  /**
   * Helper method to determine if a market cap is small cap
   */
  private isSmallCap(marketCap: string): boolean {
    const lowerCap = marketCap.toLowerCase();
    return lowerCap.includes('small') || lowerCap.includes('micro') || lowerCap.includes('nano');
  }

  /**
   * Calculate correlation between portfolio and benchmark (simplified)
   */
  private calculateCorrelation(portfolio: Portfolio, benchmarkData: HistoricalPrice[]): number {
    // This is a simplified correlation calculation
    // In a real implementation, you'd need daily portfolio values and more sophisticated analysis
    
    // For now, return a placeholder value based on sector diversification
    const sectorCount = new Set(portfolio.positions.map(pos => pos.sector || 'Unknown')).size;
    
    // More diversified portfolios tend to have higher correlation with broad market indices
    if (sectorCount >= 5) return 0.85;
    if (sectorCount >= 3) return 0.70;
    return 0.55;
  }

  /**
   * Calculate beta relative to benchmark (simplified)
   */
  private calculateBeta(portfolio: Portfolio, benchmarkData: HistoricalPrice[]): number {
    // This is a simplified beta calculation
    // In a real implementation, you'd need historical portfolio returns and regression analysis
    
    // For now, estimate beta based on portfolio composition
    const techWeight = portfolio.positions
      .filter(pos => pos.sector?.toLowerCase().includes('tech'))
      .reduce((sum, pos) => sum + (pos.quantity * (pos.currentPrice || pos.purchasePrice)), 0) / portfolio.totalValue;
    
    // Tech-heavy portfolios tend to have higher beta
    if (techWeight > 0.5) return 1.2;
    if (techWeight > 0.3) return 1.1;
    return 1.0;
  }
}

export const analyticsService = new AnalyticsService();