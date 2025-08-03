import axios, { AxiosResponse } from 'axios';
import { StockPrice, HistoricalPrice } from '../types';

export interface MarketDataProvider {
  getCurrentPrice(symbol: string): Promise<StockPrice>;
  validateSymbol(symbol: string): Promise<boolean>;
  getBatchPrices(symbols: string[]): Promise<StockPrice[]>;
  getHistoricalData(symbol: string, period: string): Promise<HistoricalPrice[]>;
}

export class MarketDataService implements MarketDataProvider {
  private readonly alphaVantageApiKey: string;
  private readonly yahooFinanceApiKey: string;
  private readonly alphaVantageBaseUrl = 'https://www.alphavantage.co/query';
  private readonly yahooFinanceBaseUrl = 'https://yfapi.net';
  private readonly retryAttempts = 3;
  private readonly retryDelay = 1000; // 1 second

  constructor() {
    this.alphaVantageApiKey = process.env.ALPHA_VANTAGE_API_KEY || '';
    this.yahooFinanceApiKey = process.env.YAHOO_FINANCE_API_KEY || '';

    if (!this.alphaVantageApiKey) {
      console.warn('ALPHA_VANTAGE_API_KEY not set in environment variables');
    }
    if (!this.yahooFinanceApiKey) {
      console.warn('YAHOO_FINANCE_API_KEY not set in environment variables');
    }
  }

  /**
   * Get current stock price with fallback mechanism
   */
  async getCurrentPrice(symbol: string): Promise<StockPrice> {
    const normalizedSymbol = symbol.toUpperCase().trim();
    
    try {
      // Try Alpha Vantage first
      return await this.getCurrentPriceFromAlphaVantage(normalizedSymbol);
    } catch (alphaVantageError: any) {
      // If it's a specific Alpha Vantage error (rate limit or API error), don't fallback
      if (alphaVantageError.message?.includes('Alpha Vantage')) {
        throw alphaVantageError;
      }
      
      console.warn(`Alpha Vantage failed for ${normalizedSymbol}:`, alphaVantageError);
      
      try {
        // Fallback to Yahoo Finance
        return await this.getCurrentPriceFromYahoo(normalizedSymbol);
      } catch (yahooError) {
        console.error(`Both providers failed for ${normalizedSymbol}:`, { alphaVantageError, yahooError });
        throw new Error(`Unable to fetch price data for ${normalizedSymbol}. Both Alpha Vantage and Yahoo Finance failed.`);
      }
    }
  }

  /**
   * Validate stock symbol using Alpha Vantage search endpoint
   */
  async validateSymbol(symbol: string): Promise<boolean> {
    const normalizedSymbol = symbol.toUpperCase().trim();
    
    try {
      // Try Alpha Vantage symbol search first
      return await this.validateSymbolWithAlphaVantage(normalizedSymbol);
    } catch (alphaVantageError) {
      console.warn(`Alpha Vantage symbol validation failed for ${normalizedSymbol}:`, alphaVantageError);
      
      try {
        // Fallback to Yahoo Finance validation
        return await this.validateSymbolWithYahoo(normalizedSymbol);
      } catch (yahooError) {
        console.error(`Both providers failed to validate ${normalizedSymbol}:`, { alphaVantageError, yahooError });
        return false;
      }
    }
  }

  /**
   * Get batch prices for multiple symbols
   */
  async getBatchPrices(symbols: string[]): Promise<StockPrice[]> {
    const normalizedSymbols = symbols.map(s => s.toUpperCase().trim());
    const results: StockPrice[] = [];
    const errors: string[] = [];

    // Process symbols in batches to avoid rate limits
    const batchSize = 5;
    for (let i = 0; i < normalizedSymbols.length; i += batchSize) {
      const batch = normalizedSymbols.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (symbol) => {
        try {
          return await this.getCurrentPrice(symbol);
        } catch (error) {
          errors.push(`Failed to fetch price for ${symbol}: ${error}`);
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.filter(result => result !== null) as StockPrice[]);

      // Add delay between batches to respect rate limits
      if (i + batchSize < normalizedSymbols.length) {
        await this.delay(200);
      }
    }

    if (errors.length > 0) {
      console.warn('Batch price fetch errors:', errors);
    }

    return results;
  }

  /**
   * Get historical data for a symbol
   */
  async getHistoricalData(symbol: string, period: string = '1mo'): Promise<HistoricalPrice[]> {
    const normalizedSymbol = symbol.toUpperCase().trim();
    
    try {
      // Try Alpha Vantage first
      return await this.getHistoricalDataFromAlphaVantage(normalizedSymbol, period);
    } catch (alphaVantageError: any) {
      // If it's a specific Alpha Vantage error (rate limit or API error), don't fallback
      if (alphaVantageError.message?.includes('Alpha Vantage')) {
        throw alphaVantageError;
      }
      
      console.warn(`Alpha Vantage historical data failed for ${normalizedSymbol}:`, alphaVantageError);
      
      try {
        // Fallback to Yahoo Finance
        return await this.getHistoricalDataFromYahoo(normalizedSymbol, period);
      } catch (yahooError) {
        console.error(`Both providers failed for historical data ${normalizedSymbol}:`, { alphaVantageError, yahooError });
        throw new Error(`Unable to fetch historical data for ${normalizedSymbol}. Both providers failed.`);
      }
    }
  }

  /**
   * Alpha Vantage implementation for current price
   */
  private async getCurrentPriceFromAlphaVantage(symbol: string): Promise<StockPrice> {
    const url = `${this.alphaVantageBaseUrl}?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${this.alphaVantageApiKey}`;
    
    const response = await this.makeRequestWithRetry(url);
    const data = response.data;

    if (data['Error Message']) {
      throw new Error(`Alpha Vantage error: ${data['Error Message']}`);
    }

    if (data['Note']) {
      throw new Error('Alpha Vantage API rate limit exceeded');
    }

    const quote = data['Global Quote'];
    if (!quote || !quote['05. price']) {
      throw new Error(`No price data found for symbol ${symbol}`);
    }

    const price = parseFloat(quote['05. price']);
    const change = parseFloat(quote['09. change']);
    const changePercent = parseFloat(quote['10. change percent'].replace('%', ''));

    return {
      symbol,
      price,
      change,
      changePercent,
      volume: parseInt(quote['06. volume']) || undefined,
      lastUpdated: new Date()
    };
  }

  /**
   * Yahoo Finance implementation for current price
   */
  private async getCurrentPriceFromYahoo(symbol: string): Promise<StockPrice> {
    const url = `${this.yahooFinanceBaseUrl}/v6/finance/quote`;
    const headers = {
      'X-API-KEY': this.yahooFinanceApiKey
    };
    
    const response = await this.makeRequestWithRetry(url, { 
      params: { symbols: symbol },
      headers 
    });
    
    const data = response.data;
    
    if (!data.quoteResponse || !data.quoteResponse.result || data.quoteResponse.result.length === 0) {
      throw new Error(`No price data found for symbol ${symbol} from Yahoo Finance`);
    }

    const quote = data.quoteResponse.result[0];
    
    return {
      symbol,
      price: quote.regularMarketPrice || 0,
      change: quote.regularMarketChange || 0,
      changePercent: quote.regularMarketChangePercent || 0,
      volume: quote.regularMarketVolume || undefined,
      lastUpdated: new Date()
    };
  }

  /**
   * Alpha Vantage symbol validation
   */
  private async validateSymbolWithAlphaVantage(symbol: string): Promise<boolean> {
    const url = `${this.alphaVantageBaseUrl}?function=SYMBOL_SEARCH&keywords=${symbol}&apikey=${this.alphaVantageApiKey}`;
    
    try {
      const response = await this.makeRequestWithRetry(url);
      const data = response.data;

      if (data['Error Message'] || data['Note']) {
        return false;
      }

      const matches = data['bestMatches'] || [];
      return matches.some((match: any) => 
        match['1. symbol'] && match['1. symbol'].toUpperCase() === symbol.toUpperCase()
      );
    } catch (error) {
      return false;
    }
  }

  /**
   * Yahoo Finance symbol validation
   */
  private async validateSymbolWithYahoo(symbol: string): Promise<boolean> {
    try {
      const stockPrice = await this.getCurrentPriceFromYahoo(symbol);
      return stockPrice.price > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Alpha Vantage historical data
   */
  private async getHistoricalDataFromAlphaVantage(symbol: string, period: string): Promise<HistoricalPrice[]> {
    // Map period to Alpha Vantage function
    const functionName = period.includes('d') ? 'TIME_SERIES_DAILY' : 'TIME_SERIES_MONTHLY';
    const url = `${this.alphaVantageBaseUrl}?function=${functionName}&symbol=${symbol}&apikey=${this.alphaVantageApiKey}`;
    
    const response = await this.makeRequestWithRetry(url);
    const data = response.data;

    if (data['Error Message']) {
      throw new Error(`Alpha Vantage error: ${data['Error Message']}`);
    }

    if (data['Note']) {
      throw new Error('Alpha Vantage API rate limit exceeded');
    }

    const timeSeriesKey = functionName === 'TIME_SERIES_DAILY' ? 'Time Series (Daily)' : 'Monthly Time Series';
    const timeSeries = data[timeSeriesKey];
    
    if (!timeSeries) {
      throw new Error(`No historical data found for symbol ${symbol}`);
    }

    const historicalData: HistoricalPrice[] = [];
    
    for (const [date, values] of Object.entries(timeSeries)) {
      const dayData = values as any;
      historicalData.push({
        date: new Date(date),
        open: parseFloat(dayData['1. open']),
        high: parseFloat(dayData['2. high']),
        low: parseFloat(dayData['3. low']),
        close: parseFloat(dayData['4. close']),
        volume: parseInt(dayData['5. volume'])
      });
    }

    // Sort by date (most recent first)
    return historicalData.sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  /**
   * Yahoo Finance historical data
   */
  private async getHistoricalDataFromYahoo(symbol: string, period: string): Promise<HistoricalPrice[]> {
    const url = `${this.yahooFinanceBaseUrl}/v8/finance/chart/${symbol}`;
    const headers = {
      'X-API-KEY': this.yahooFinanceApiKey
    };
    
    // Map period to Yahoo Finance range
    const range = this.mapPeriodToYahooRange(period);
    
    const response = await this.makeRequestWithRetry(url, {
      params: { range, interval: '1d' },
      headers
    });
    
    const data = response.data;
    
    if (!data.chart || !data.chart.result || data.chart.result.length === 0) {
      throw new Error(`No historical data found for symbol ${symbol} from Yahoo Finance`);
    }

    const result = data.chart.result[0];
    const timestamps = result.timestamp;
    const quotes = result.indicators.quote[0];
    
    const historicalData: HistoricalPrice[] = [];
    
    for (let i = 0; i < timestamps.length; i++) {
      historicalData.push({
        date: new Date(timestamps[i] * 1000),
        open: quotes.open[i] || 0,
        high: quotes.high[i] || 0,
        low: quotes.low[i] || 0,
        close: quotes.close[i] || 0,
        volume: quotes.volume[i] || 0
      });
    }

    return historicalData.sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  /**
   * Map period string to Yahoo Finance range
   */
  private mapPeriodToYahooRange(period: string): string {
    const periodMap: { [key: string]: string } = {
      '1d': '1d',
      '5d': '5d',
      '1mo': '1mo',
      '3mo': '3mo',
      '6mo': '6mo',
      '1y': '1y',
      '2y': '2y',
      '5y': '5y',
      '10y': '10y',
      'ytd': 'ytd',
      'max': 'max'
    };
    
    return periodMap[period] || '1mo';
  }

  /**
   * Make HTTP request with retry logic
   */
  private async makeRequestWithRetry(url: string, config: any = {}): Promise<AxiosResponse> {
    let lastError: any;
    
    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const response = await axios.get(url, {
          timeout: 10000,
          ...config
        });
        
        return response;
      } catch (error: any) {
        lastError = error;
        
        // Don't retry on client errors (4xx) - these are permanent failures
        if (error.response && error.response.status >= 400 && error.response.status < 500) {
          throw error;
        }
        
        // Wait before retrying (exponential backoff) only if we have more attempts
        if (attempt < this.retryAttempts) {
          const delay = this.retryDelay * Math.pow(2, attempt - 1);
          await this.delay(delay);
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Utility method for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const marketDataService = new MarketDataService();