import axios from 'axios';
import { marketDataService } from '../../services/marketDataService';
import { testDb, testPrisma } from './testDatabase';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Market Data Service Integration Tests', () => {
  beforeAll(async () => {
    await testDb.setupTestDatabase();
  });

  afterAll(async () => {
    await testDb.teardownTestDatabase();
  });

  beforeEach(async () => {
    await testDb.cleanupTestDatabase();
    jest.clearAllMocks();
  });

  describe('validateSymbol', () => {
    it('should validate symbol using Alpha Vantage API', async () => {
      // Mock successful API response
      mockedAxios.get.mockResolvedValue({
        data: {
          'Global Quote': {
            '01. symbol': 'AAPL',
            '05. price': '155.00'
          }
        }
      });

      const isValid = await marketDataService.validateSymbol('AAPL');

      expect(isValid).toBe(true);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('GLOBAL_QUOTE'),
        expect.objectContaining({
          params: expect.objectContaining({
            symbol: 'AAPL'
          })
        })
      );
    });

    it('should return false for invalid symbol', async () => {
      // Mock API error response
      mockedAxios.get.mockResolvedValue({
        data: {
          'Error Message': 'Invalid API call'
        }
      });

      const isValid = await marketDataService.validateSymbol('INVALID');

      expect(isValid).toBe(false);
    });

    it('should fallback to Yahoo Finance on Alpha Vantage failure', async () => {
      // Mock Alpha Vantage failure
      mockedAxios.get
        .mockRejectedValueOnce(new Error('Alpha Vantage API error'))
        .mockResolvedValueOnce({
          data: {
            chart: {
              result: [{
                meta: {
                  symbol: 'AAPL',
                  regularMarketPrice: 155.00
                }
              }]
            }
          }
        });

      const isValid = await marketDataService.validateSymbol('AAPL');

      expect(isValid).toBe(true);
      expect(mockedAxios.get).toHaveBeenCalledTimes(2);
      
      // Should have called Yahoo Finance API
      expect(mockedAxios.get).toHaveBeenLastCalledWith(
        expect.stringContaining('yahoo'),
        expect.any(Object)
      );
    });

    it('should cache validation results in database', async () => {
      // Mock successful API response
      mockedAxios.get.mockResolvedValue({
        data: {
          'Global Quote': {
            '01. symbol': 'AAPL',
            '05. price': '155.00',
            '02. open': '154.00',
            '03. high': '156.00',
            '04. low': '153.00',
            '08. previous close': '152.00',
            '10. change percent': '1.97%'
          }
        }
      });

      await marketDataService.validateSymbol('AAPL');

      // Verify market data was cached in database
      const cachedData = await testPrisma.marketData.findUnique({
        where: { symbol: 'AAPL' }
      });

      expect(cachedData).toBeTruthy();
      expect(cachedData?.currentPrice).toBe(155.00);
      expect(cachedData?.previousClose).toBe(152.00);
      expect(cachedData?.companyName).toBeDefined();
    });

    it('should use cached data when available and fresh', async () => {
      // Create fresh cached data (within last hour)
      await testDb.createTestMarketData({
        symbol: 'AAPL',
        currentPrice: 155.00,
        lastUpdated: new Date() // Fresh data
      });

      const isValid = await marketDataService.validateSymbol('AAPL');

      expect(isValid).toBe(true);
      // Should not call external API when cache is fresh
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it('should refresh stale cached data', async () => {
      // Create stale cached data (older than 1 hour)
      const staleDate = new Date();
      staleDate.setHours(staleDate.getHours() - 2);
      
      await testDb.createTestMarketData({
        symbol: 'AAPL',
        currentPrice: 150.00,
        lastUpdated: staleDate
      });

      // Mock fresh API response
      mockedAxios.get.mockResolvedValue({
        data: {
          'Global Quote': {
            '01. symbol': 'AAPL',
            '05. price': '155.00',
            '08. previous close': '152.00'
          }
        }
      });

      const isValid = await marketDataService.validateSymbol('AAPL');

      expect(isValid).toBe(true);
      expect(mockedAxios.get).toHaveBeenCalled();

      // Verify cached data was updated
      const updatedData = await testPrisma.marketData.findUnique({
        where: { symbol: 'AAPL' }
      });
      expect(updatedData?.currentPrice).toBe(155.00);
      expect(updatedData?.lastUpdated.getTime()).toBeGreaterThan(staleDate.getTime());
    });
  });

  describe('getCurrentPrice', () => {
    it('should fetch current price from Alpha Vantage', async () => {
      mockedAxios.get.mockResolvedValue({
        data: {
          'Global Quote': {
            '01. symbol': 'AAPL',
            '05. price': '155.50',
            '08. previous close': '154.00',
            '10. change percent': '0.97%'
          }
        }
      });

      const priceData = await marketDataService.getCurrentPrice('AAPL');

      expect(priceData).toEqual({
        symbol: 'AAPL',
        price: 155.50,
        previousClose: 154.00,
        changePercent: 0.97,
        lastUpdated: expect.any(Date)
      });
    });

    it('should handle API rate limiting with retry', async () => {
      // Mock rate limit error then success
      mockedAxios.get
        .mockRejectedValueOnce({
          response: { status: 429, data: { Note: 'API call frequency limit' } }
        })
        .mockResolvedValueOnce({
          data: {
            'Global Quote': {
              '01. symbol': 'AAPL',
              '05. price': '155.50',
              '08. previous close': '154.00'
            }
          }
        });

      const priceData = await marketDataService.getCurrentPrice('AAPL');

      expect(priceData.price).toBe(155.50);
      expect(mockedAxios.get).toHaveBeenCalledTimes(2);
    });

    it('should fallback to cached data on API failure', async () => {
      // Create cached data
      await testDb.createTestMarketData({
        symbol: 'AAPL',
        currentPrice: 150.00,
        previousClose: 148.00,
        changePercent: 1.35
      });

      // Mock API failure
      mockedAxios.get.mockRejectedValue(new Error('API unavailable'));

      const priceData = await marketDataService.getCurrentPrice('AAPL');

      expect(priceData).toEqual({
        symbol: 'AAPL',
        price: 150.00,
        previousClose: 148.00,
        changePercent: 1.35,
        lastUpdated: expect.any(Date)
      });
    });

    it('should throw error when no data available', async () => {
      // Mock API failure
      mockedAxios.get.mockRejectedValue(new Error('API unavailable'));

      await expect(marketDataService.getCurrentPrice('UNKNOWN'))
        .rejects.toThrow('Unable to fetch price data');
    });
  });

  describe('getBatchPrices', () => {
    it('should fetch multiple stock prices efficiently', async () => {
      const symbols = ['AAPL', 'GOOGL', 'MSFT'];

      // Mock API responses for each symbol
      mockedAxios.get
        .mockResolvedValueOnce({
          data: {
            'Global Quote': {
              '01. symbol': 'AAPL',
              '05. price': '155.00',
              '08. previous close': '154.00'
            }
          }
        })
        .mockResolvedValueOnce({
          data: {
            'Global Quote': {
              '01. symbol': 'GOOGL',
              '05. price': '2850.00',
              '08. previous close': '2800.00'
            }
          }
        })
        .mockResolvedValueOnce({
          data: {
            'Global Quote': {
              '01. symbol': 'MSFT',
              '05. price': '310.00',
              '08. previous close': '305.00'
            }
          }
        });

      const prices = await marketDataService.getBatchPrices(symbols);

      expect(prices).toHaveLength(3);
      expect(prices[0].symbol).toBe('AAPL');
      expect(prices[1].symbol).toBe('GOOGL');
      expect(prices[2].symbol).toBe('MSFT');

      // Should have made 3 API calls
      expect(mockedAxios.get).toHaveBeenCalledTimes(3);
    });

    it('should handle partial failures in batch requests', async () => {
      const symbols = ['AAPL', 'INVALID', 'MSFT'];

      // Mock mixed responses
      mockedAxios.get
        .mockResolvedValueOnce({
          data: {
            'Global Quote': {
              '01. symbol': 'AAPL',
              '05. price': '155.00',
              '08. previous close': '154.00'
            }
          }
        })
        .mockRejectedValueOnce(new Error('Invalid symbol'))
        .mockResolvedValueOnce({
          data: {
            'Global Quote': {
              '01. symbol': 'MSFT',
              '05. price': '310.00',
              '08. previous close': '305.00'
            }
          }
        });

      const prices = await marketDataService.getBatchPrices(symbols);

      // Should return only successful results
      expect(prices).toHaveLength(2);
      expect(prices.map(p => p.symbol)).toEqual(['AAPL', 'MSFT']);
    });

    it('should respect API rate limits with delays', async () => {
      const symbols = ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'AMZN'];

      // Mock all successful responses
      mockedAxios.get.mockResolvedValue({
        data: {
          'Global Quote': {
            '01. symbol': 'TEST',
            '05. price': '100.00',
            '08. previous close': '99.00'
          }
        }
      });

      const startTime = Date.now();
      await marketDataService.getBatchPrices(symbols);
      const endTime = Date.now();

      // Should have introduced delays between requests
      const totalTime = endTime - startTime;
      expect(totalTime).toBeGreaterThan(1000); // At least 1 second for rate limiting
    });

    it('should use cached data to reduce API calls', async () => {
      const symbols = ['AAPL', 'GOOGL'];

      // Create cached data for AAPL
      await testDb.createTestMarketData({
        symbol: 'AAPL',
        currentPrice: 155.00,
        previousClose: 154.00,
        lastUpdated: new Date() // Fresh cache
      });

      // Mock API response only for GOOGL
      mockedAxios.get.mockResolvedValue({
        data: {
          'Global Quote': {
            '01. symbol': 'GOOGL',
            '05. price': '2850.00',
            '08. previous close': '2800.00'
          }
        }
      });

      const prices = await marketDataService.getBatchPrices(symbols);

      expect(prices).toHaveLength(2);
      // Should only make 1 API call (for GOOGL, AAPL from cache)
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    });
  });



  describe('getHistoricalData', () => {
    it('should fetch historical price data', async () => {
      mockedAxios.get.mockResolvedValue({
        data: {
          'Time Series (Daily)': {
            '2024-01-03': {
              '1. open': '154.00',
              '2. high': '156.00',
              '3. low': '153.00',
              '4. close': '155.00',
              '5. volume': '50000000'
            },
            '2024-01-02': {
              '1. open': '152.00',
              '2. high': '154.00',
              '3. low': '151.00',
              '4. close': '153.00',
              '5. volume': '45000000'
            },
            '2024-01-01': {
              '1. open': '150.00',
              '2. high': '152.00',
              '3. low': '149.00',
              '4. close': '151.00',
              '5. volume': '48000000'
            }
          }
        }
      });

      const historicalData = await marketDataService.getHistoricalData('AAPL', '1M');

      expect(historicalData).toHaveLength(3);
      expect(historicalData[0]).toEqual({
        date: new Date('2024-01-03'),
        price: 155.00,
        volume: 50000000
      });
    });

    it('should handle different time periods', async () => {
      const periods = ['1D', '1W', '1M', '3M', '6M', '1Y'];

      for (const period of periods) {
        mockedAxios.get.mockResolvedValue({
          data: {
            'Time Series (Daily)': {
              '2024-01-01': {
                '4. close': '150.00',
                '5. volume': '50000000'
              }
            }
          }
        });

        const data = await marketDataService.getHistoricalData('AAPL', period);
        expect(Array.isArray(data)).toBe(true);
      }
    });

    it('should validate period parameter', async () => {
      await expect(marketDataService.getHistoricalData('AAPL', 'INVALID'))
        .rejects.toThrow('Invalid period');
    });

    it('should handle API errors gracefully', async () => {
      mockedAxios.get.mockRejectedValue(new Error('API error'));

      await expect(marketDataService.getHistoricalData('AAPL', '1M'))
        .rejects.toThrow('Unable to fetch historical data');
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle network timeouts', async () => {
      mockedAxios.get.mockRejectedValue({
        code: 'ECONNABORTED',
        message: 'timeout of 5000ms exceeded'
      });

      await expect(marketDataService.getCurrentPrice('AAPL'))
        .rejects.toThrow('timeout');
    });

    it('should handle API quota exceeded', async () => {
      mockedAxios.get.mockRejectedValue({
        response: {
          status: 429,
          data: { Note: 'API call frequency limit reached' }
        }
      });

      await expect(marketDataService.getCurrentPrice('AAPL'))
        .rejects.toThrow('API call frequency limit');
    });

    it('should handle malformed API responses', async () => {
      mockedAxios.get.mockResolvedValue({
        data: {
          // Missing expected structure
          'Invalid': 'response'
        }
      });

      await expect(marketDataService.getCurrentPrice('AAPL'))
        .rejects.toThrow('Invalid API response');
    });

    it('should implement exponential backoff for retries', async () => {
      let callCount = 0;
      mockedAxios.get.mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          return Promise.reject(new Error('Temporary error'));
        }
        return Promise.resolve({
          data: {
            'Global Quote': {
              '01. symbol': 'AAPL',
              '05. price': '155.00',
              '08. previous close': '154.00'
            }
          }
        });
      });

      const startTime = Date.now();
      const result = await marketDataService.getCurrentPrice('AAPL');
      const endTime = Date.now();

      expect(result.price).toBe(155.00);
      expect(callCount).toBe(3);
      
      // Should have waited for exponential backoff
      const totalTime = endTime - startTime;
      expect(totalTime).toBeGreaterThan(1000); // At least 1 second for retries
    });
  });

  describe('Database Integration', () => {
    it('should maintain data consistency during concurrent updates', async () => {
      // Mock API response
      mockedAxios.get.mockResolvedValue({
        data: {
          'Global Quote': {
            '01. symbol': 'AAPL',
            '05. price': '155.00',
            '08. previous close': '154.00'
          }
        }
      });

      // Attempt concurrent price fetches
      const promises = Array(5).fill(null).map(() =>
        marketDataService.getCurrentPrice('AAPL')
      );

      const results = await Promise.all(promises);

      // All should return same data
      results.forEach(result => {
        expect(result.price).toBe(155.00);
      });

      // Should only have one record in database
      const marketDataCount = await testPrisma.marketData.count({
        where: { symbol: 'AAPL' }
      });
      expect(marketDataCount).toBe(1);
    });

    it('should clean up stale market data', async () => {
      // Create old market data
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 7); // 7 days old

      await testDb.createTestMarketData({
        symbol: 'OLD_STOCK',
        lastUpdated: oldDate
      });

      // Run cleanup (this would typically be a scheduled job)
      await testPrisma.marketData.deleteMany({
        where: {
          lastUpdated: {
            lt: new Date(Date.now() - 24 * 60 * 60 * 1000) // Older than 24 hours
          }
        }
      });

      // Verify old data was cleaned up
      const remainingData = await testPrisma.marketData.findUnique({
        where: { symbol: 'OLD_STOCK' }
      });
      expect(remainingData).toBeNull();
    });
  });
});