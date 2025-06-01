/**
 * Structured logging utility for the HTLC bridge coordinator
 */

/**
 * Log levels
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Log context data
 */
export interface LogContext {
  [key: string]: unknown;
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
  level: LogLevel;
  json?: boolean;
  timestamp?: boolean;
}

/**
 * Log entry structure
 */
export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: LogContext;
}

/**
 * Logger implementation
 */
export class Logger {
  private static logLevels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  private level: LogLevel;
  private json: boolean;
  private timestamp: boolean;

  constructor(config: LoggerConfig) {
    this.level = config.level;
    this.json = config.json ?? false;
    this.timestamp = config.timestamp ?? true;
  }

  /**
   * Check if a log level is enabled
   */
  private isEnabled(level: LogLevel): boolean {
    return Logger.logLevels[level] >= Logger.logLevels[this.level];
  }

  /**
   * Format log entry
   */
  private format(entry: LogEntry): string {
    if (this.json) {
      return JSON.stringify(entry);
    }

    const parts: string[] = [];
    
    if (this.timestamp) {
      parts.push(`[${entry.timestamp}]`);
    }
    
    parts.push(`[${entry.level.toUpperCase()}]`);
    parts.push(entry.message);
    
    if (entry.context && Object.keys(entry.context).length > 0) {
      parts.push(JSON.stringify(entry.context));
    }
    
    return parts.join(" ");
  }

  /**
   * Log a message
   */
  private log(level: LogLevel, message: string, context?: LogContext): void {
    if (!this.isEnabled(level)) {
      return;
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context,
    };

    const formatted = this.format(entry);

    switch (level) {
      case "error":
        console.error(formatted);
        break;
      case "warn":
        console.warn(formatted);
        break;
      default:
        console.log(formatted);
    }
  }

  /**
   * Log debug message
   * @example
   * ```typescript
   * logger.debug("Processing swap", { swapId: "123", amount: 1000 });
   * ```
   */
  debug(message: string, context?: LogContext): void {
    this.log("debug", message, context);
  }

  /**
   * Log info message
   * @example
   * ```typescript
   * logger.info("Swap completed", { swapId: "123", duration: 45 });
   * ```
   */
  info(message: string, context?: LogContext): void {
    this.log("info", message, context);
  }

  /**
   * Log warning message
   * @example
   * ```typescript
   * logger.warn("Low balance detected", { chain: "evm", balance: 50 });
   * ```
   */
  warn(message: string, context?: LogContext): void {
    this.log("warn", message, context);
  }

  /**
   * Log error message
   * @example
   * ```typescript
   * logger.error("Swap failed", { swapId: "123", error: error.message });
   * ```
   */
  error(message: string, context?: LogContext): void {
    this.log("error", message, context);
  }

  /**
   * Create a child logger with additional context
   * @example
   * ```typescript
   * const swapLogger = logger.child({ swapId: "123" });
   * swapLogger.info("Starting swap"); // Includes swapId in context
   * ```
   */
  child(defaultContext: LogContext): Logger {
    const parent = this;
    
    return {
      debug(message: string, context?: LogContext) {
        parent.debug(message, { ...defaultContext, ...context });
      },
      info(message: string, context?: LogContext) {
        parent.info(message, { ...defaultContext, ...context });
      },
      warn(message: string, context?: LogContext) {
        parent.warn(message, { ...defaultContext, ...context });
      },
      error(message: string, context?: LogContext) {
        parent.error(message, { ...defaultContext, ...context });
      },
      child(additionalContext: LogContext) {
        return parent.child({ ...defaultContext, ...additionalContext });
      },
    } as Logger;
  }
}

/**
 * Create a logger instance
 */
export function createLogger(config: LoggerConfig): Logger {
  return new Logger(config);
}

/**
 * Default logger instance
 */
export const logger = createLogger({
  level: "info",
  json: false,
  timestamp: true,
});