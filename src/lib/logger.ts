import fs from 'fs';
import path from 'path';

export interface LogEntry {
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug';
  category: string;
  message: string;
  data?: any;
  userId?: string;
  correlationId?: string;
}

export interface SchedulerLogEntry extends LogEntry {
  category: 'scheduler';
  schedulerEvent: 'start' | 'stop' | 'batch_start' | 'batch_complete' | 'user_success' | 'user_failure' | 'complete' | 'error';
  batchId?: string;
  userId?: string;
  duration?: number;
  stats?: {
    totalUsers?: number;
    successful?: number;
    failed?: number;
    skipped?: number;
  };
}

class Logger {
  private logDir: string;
  private maxLogFiles: number = 30; // Keep 30 days of logs
  private maxLogSize: number = 10 * 1024 * 1024; // 10MB per file

  constructor() {
    this.logDir = process.env.LOG_DIR || path.join(process.cwd(), 'logs');
    this.ensureLogDirectory();
  }

  /**
   * Ensure log directory exists
   */
  private ensureLogDirectory(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * Get log file path for today
   */
  private getLogFilePath(category: string = 'general'): string {
    const today = new Date().toISOString().split('T')[0];
    return path.join(this.logDir, `${category}-${today}.log`);
  }

  /**
   * Write log entry to file
   */
  private async writeToFile(entry: LogEntry): Promise<void> {
    try {
      const logFile = this.getLogFilePath(entry.category);
      const logLine = JSON.stringify({
        ...entry,
        timestamp: entry.timestamp.toISOString()
      }) + '\n';

      // Check file size and rotate if necessary
      await this.rotateLogIfNeeded(logFile);

      // Append to log file
      fs.appendFileSync(logFile, logLine);
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  /**
   * Rotate log file if it exceeds max size
   */
  private async rotateLogIfNeeded(logFile: string): Promise<void> {
    try {
      if (fs.existsSync(logFile)) {
        const stats = fs.statSync(logFile);
        if (stats.size > this.maxLogSize) {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const rotatedFile = logFile.replace('.log', `-${timestamp}.log`);
          fs.renameSync(logFile, rotatedFile);
        }
      }
    } catch (error) {
      console.error('Failed to rotate log file:', error);
    }
  }

  /**
   * Clean up old log files
   */
  private cleanupOldLogs(): void {
    try {
      const files = fs.readdirSync(this.logDir);
      const logFiles = files
        .filter(file => file.endsWith('.log'))
        .map(file => ({
          name: file,
          path: path.join(this.logDir, file),
          mtime: fs.statSync(path.join(this.logDir, file)).mtime
        }))
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

      // Keep only the most recent files
      if (logFiles.length > this.maxLogFiles) {
        const filesToDelete = logFiles.slice(this.maxLogFiles);
        filesToDelete.forEach(file => {
          try {
            fs.unlinkSync(file.path);
            console.log(`Deleted old log file: ${file.name}`);
          } catch (error) {
            console.error(`Failed to delete log file ${file.name}:`, error);
          }
        });
      }
    } catch (error) {
      console.error('Failed to cleanup old logs:', error);
    }
  }

  /**
   * Log general message
   */
  async log(level: LogEntry['level'], category: string, message: string, data?: any, userId?: string): Promise<void> {
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      category,
      message,
      data,
      userId,
      correlationId: this.generateCorrelationId()
    };

    // Write to console
    const consoleMessage = `[${entry.timestamp.toISOString()}] ${level.toUpperCase()} [${category}] ${message}`;
    switch (level) {
      case 'error':
        console.error(consoleMessage, data || '');
        break;
      case 'warn':
        console.warn(consoleMessage, data || '');
        break;
      case 'debug':
        if (process.env.NODE_ENV === 'development') {
          console.debug(consoleMessage, data || '');
        }
        break;
      default:
        console.log(consoleMessage, data || '');
    }

    // Write to file
    await this.writeToFile(entry);
  }

  /**
   * Log scheduler-specific events
   */
  async logScheduler(
    level: LogEntry['level'],
    schedulerEvent: SchedulerLogEntry['schedulerEvent'],
    message: string,
    options: {
      batchId?: string;
      userId?: string;
      duration?: number;
      stats?: SchedulerLogEntry['stats'];
      data?: any;
    } = {}
  ): Promise<void> {
    const entry: SchedulerLogEntry = {
      timestamp: new Date(),
      level,
      category: 'scheduler',
      schedulerEvent,
      message,
      correlationId: this.generateCorrelationId(),
      ...options
    };

    // Enhanced console output for scheduler events
    const consoleMessage = `[${entry.timestamp.toISOString()}] ${level.toUpperCase()} [SCHEDULER:${schedulerEvent}] ${message}`;
    
    if (entry.stats) {
      console.log(consoleMessage, entry.stats);
    } else if (entry.data) {
      console.log(consoleMessage, entry.data);
    } else {
      console.log(consoleMessage);
    }

    // Write to file
    await this.writeToFile(entry);
  }

  /**
   * Generate correlation ID for tracking related log entries
   */
  private generateCorrelationId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get recent log entries from file
   */
  async getRecentLogs(category: string = 'scheduler', limit: number = 100): Promise<LogEntry[]> {
    try {
      const logFile = this.getLogFilePath(category);
      
      if (!fs.existsSync(logFile)) {
        return [];
      }

      const content = fs.readFileSync(logFile, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.length > 0);
      
      // Get the last 'limit' lines
      const recentLines = lines.slice(-limit);
      
      return recentLines.map(line => {
        try {
          const entry = JSON.parse(line);
          return {
            ...entry,
            timestamp: new Date(entry.timestamp)
          };
        } catch (error) {
          // Return a fallback entry for malformed lines
          return {
            timestamp: new Date(),
            level: 'error' as const,
            category,
            message: 'Failed to parse log entry',
            data: { originalLine: line }
          };
        }
      });
    } catch (error) {
      console.error('Failed to read log file:', error);
      return [];
    }
  }

  /**
   * Get scheduler statistics from logs
   */
  async getSchedulerStats(days: number = 7): Promise<{
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
    averageDuration: number;
    totalUsersProcessed: number;
    averageUsersPerRun: number;
    errorRate: number;
  }> {
    try {
      const logs = await this.getRecentLogs('scheduler', 1000);
      const schedulerLogs = logs.filter(log => 
        (log as SchedulerLogEntry).schedulerEvent === 'complete' &&
        log.timestamp > new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      ) as SchedulerLogEntry[];

      if (schedulerLogs.length === 0) {
        return {
          totalRuns: 0,
          successfulRuns: 0,
          failedRuns: 0,
          averageDuration: 0,
          totalUsersProcessed: 0,
          averageUsersPerRun: 0,
          errorRate: 0
        };
      }

      const totalRuns = schedulerLogs.length;
      const successfulRuns = schedulerLogs.filter(log => log.level !== 'error').length;
      const failedRuns = totalRuns - successfulRuns;
      
      const durations = schedulerLogs
        .filter(log => log.duration)
        .map(log => log.duration!);
      const averageDuration = durations.length > 0 
        ? durations.reduce((sum, duration) => sum + duration, 0) / durations.length 
        : 0;

      const totalUsersProcessed = schedulerLogs
        .filter(log => log.stats?.totalUsers)
        .reduce((sum, log) => sum + (log.stats!.totalUsers || 0), 0);
      
      const averageUsersPerRun = totalRuns > 0 ? totalUsersProcessed / totalRuns : 0;
      const errorRate = totalRuns > 0 ? (failedRuns / totalRuns) * 100 : 0;

      return {
        totalRuns,
        successfulRuns,
        failedRuns,
        averageDuration: Math.round(averageDuration),
        totalUsersProcessed,
        averageUsersPerRun: Math.round(averageUsersPerRun * 100) / 100,
        errorRate: Math.round(errorRate * 100) / 100
      };
    } catch (error) {
      console.error('Failed to calculate scheduler stats:', error);
      return {
        totalRuns: 0,
        successfulRuns: 0,
        failedRuns: 0,
        averageDuration: 0,
        totalUsersProcessed: 0,
        averageUsersPerRun: 0,
        errorRate: 0
      };
    }
  }

  /**
   * Initialize logger (cleanup old logs)
   */
  init(): void {
    this.cleanupOldLogs();
    console.log(`Logger initialized. Log directory: ${this.logDir}`);
  }
}

export const logger = new Logger();

// Initialize logger on import
logger.init();