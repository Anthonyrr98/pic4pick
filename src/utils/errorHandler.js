/**
 * 统一的错误处理工具
 * 提供一致的错误处理接口和错误消息格式
 */

/**
 * 错误类型枚举
 */
export const ErrorType = {
  NETWORK: 'NETWORK',           // 网络错误
  VALIDATION: 'VALIDATION',     // 验证错误
  PERMISSION: 'PERMISSION',     // 权限错误
  STORAGE: 'STORAGE',           // 存储错误
  PARSE: 'PARSE',               // 解析错误
  UNKNOWN: 'UNKNOWN',           // 未知错误
};

/**
 * 错误严重程度
 */
export const ErrorSeverity = {
  LOW: 'LOW',           // 低：不影响主要功能
  MEDIUM: 'MEDIUM',     // 中：影响部分功能
  HIGH: 'HIGH',         // 高：影响主要功能
  CRITICAL: 'CRITICAL', // 严重：导致功能完全不可用
};

/**
 * 错误信息类
 */
export class AppError extends Error {
  constructor(message, type = ErrorType.UNKNOWN, severity = ErrorSeverity.MEDIUM, originalError = null) {
    super(message);
    this.name = 'AppError';
    this.type = type;
    this.severity = severity;
    this.originalError = originalError;
    this.timestamp = new Date().toISOString();
    
    // 保持堆栈跟踪
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }

  /**
   * 转换为用户友好的消息
   */
  getUserMessage() {
    const messages = {
      [ErrorType.NETWORK]: '网络连接失败，请检查网络设置',
      [ErrorType.VALIDATION]: '输入数据验证失败',
      [ErrorType.PERMISSION]: '权限不足，无法执行此操作',
      [ErrorType.STORAGE]: '存储操作失败',
      [ErrorType.PARSE]: '数据解析失败',
      [ErrorType.UNKNOWN]: '发生未知错误',
    };

    return messages[this.type] || this.message;
  }

  /**
   * 转换为日志消息
   */
  getLogMessage() {
    return `[${this.type}] ${this.message}${this.originalError ? ` (原始错误: ${this.originalError.message})` : ''}`;
  }
}

/**
 * 错误处理配置
 */
const errorConfig = {
  // 是否在控制台输出错误
  logToConsole: true,
  // 是否显示用户友好的错误消息
  showUserMessage: true,
  // 错误消息前缀
  prefix: '[错误]',
};

/**
 * 设置错误处理配置
 */
export const configureErrorHandler = (config) => {
  Object.assign(errorConfig, config);
};

/**
 * 创建错误对象
 */
export const createError = (message, type = ErrorType.UNKNOWN, severity = ErrorSeverity.MEDIUM, originalError = null) => {
  return new AppError(message, type, severity, originalError);
};

/**
 * 处理错误
 * @param {Error|AppError|any} error - 错误对象
 * @param {Object} options - 处理选项
 * @param {string} options.context - 错误上下文（如函数名、操作名）
 * @param {boolean} options.silent - 是否静默处理（不输出日志）
 * @param {Function} options.onError - 自定义错误处理回调
 * @returns {AppError} 标准化的错误对象
 */
export const handleError = (error, options = {}) => {
  const {
    context = '',
    silent = false,
    onError = null,
  } = options;

  // 转换为 AppError
  let appError;
  if (error instanceof AppError) {
    appError = error;
  } else if (error instanceof Error) {
    // 根据错误类型推断错误类型
    let type = ErrorType.UNKNOWN;
    if (error.name === 'NetworkError' || error.message.includes('fetch') || error.message.includes('network')) {
      type = ErrorType.NETWORK;
    } else if (error.name === 'SyntaxError' || error.message.includes('JSON')) {
      type = ErrorType.PARSE;
    } else if (error.name === 'QuotaExceededError' || error.message.includes('storage')) {
      type = ErrorType.STORAGE;
    }

    appError = createError(error.message, type, ErrorSeverity.MEDIUM, error);
  } else {
    // 处理非 Error 对象
    const message = typeof error === 'string' ? error : '发生未知错误';
    appError = createError(message, ErrorType.UNKNOWN, ErrorSeverity.MEDIUM, error);
  }

  // 添加上下文信息
  if (context) {
    appError.context = context;
  }

  // 输出日志
  if (!silent && errorConfig.logToConsole) {
    const logMessage = context
      ? `${errorConfig.prefix} [${context}] ${appError.getLogMessage()}`
      : `${errorConfig.prefix} ${appError.getLogMessage()}`;
    
    if (appError.severity === ErrorSeverity.CRITICAL || appError.severity === ErrorSeverity.HIGH) {
      console.error(logMessage, appError.originalError || '');
    } else {
      console.warn(logMessage);
    }
  }

  // 自定义错误处理
  if (onError && typeof onError === 'function') {
    onError(appError);
  }

  return appError;
};

/**
 * 安全执行异步函数（自动错误处理）
 * @param {Function} fn - 要执行的异步函数
 * @param {Object} options - 处理选项
 * @returns {Promise} 返回函数执行结果或错误
 */
export const safeAsync = async (fn, options = {}) => {
  try {
    return await fn();
  } catch (error) {
    const appError = handleError(error, options);
    
    // 如果设置了 throwError，重新抛出错误
    if (options.throwError !== false) {
      throw appError;
    }
    
    return { error: appError };
  }
};

/**
 * 安全执行同步函数（自动错误处理）
 * @param {Function} fn - 要执行的函数
 * @param {Object} options - 处理选项
 * @returns {any} 返回函数执行结果或错误对象
 */
export const safeSync = (fn, options = {}) => {
  try {
    return fn();
  } catch (error) {
    const appError = handleError(error, options);
    
    // 如果设置了 throwError，重新抛出错误
    if (options.throwError !== false) {
      throw appError;
    }
    
    return { error: appError };
  }
};

/**
 * 创建错误处理包装器
 * @param {Function} fn - 要包装的函数
 * @param {Object} options - 处理选项
 * @returns {Function} 包装后的函数
 */
export const withErrorHandling = (fn, options = {}) => {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      const appError = handleError(error, { ...options, context: fn.name || 'unknown' });
      
      if (options.throwError !== false) {
        throw appError;
      }
      
      return { error: appError };
    }
  };
};

/**
 * 格式化错误消息（用于显示给用户）
 * @param {Error|AppError|any} error - 错误对象
 * @param {string} defaultMessage - 默认消息
 * @returns {string} 用户友好的错误消息
 */
export const formatErrorMessage = (error, defaultMessage = '操作失败，请重试') => {
  if (!error) return defaultMessage;
  
  if (error instanceof AppError) {
    return error.getUserMessage();
  }
  
  // 处理 Supabase 错误对象（有 message、details、hint 属性）
  if (error && typeof error === 'object' && 'message' in error) {
    const supabaseError = error;
    if (supabaseError.message) {
      // Supabase 常见错误消息映射
      if (supabaseError.message.includes('permission denied') || supabaseError.message.includes('row-level security')) {
        return '权限不足，请检查数据库权限设置';
      }
      if (supabaseError.message.includes('duplicate key') || supabaseError.message.includes('unique constraint')) {
        return '数据已存在，无法重复添加';
      }
      if (supabaseError.message.includes('foreign key') || supabaseError.message.includes('constraint')) {
        return '数据关联错误，请检查数据完整性';
      }
      if (supabaseError.message.includes('null value') || supabaseError.message.includes('not null')) {
        return '缺少必填字段，请检查数据';
      }
      
      // 返回 Supabase 错误消息（如果看起来是用户友好的）
      const message = supabaseError.message;
      if (message.length < 150 && !message.includes('at ') && !message.includes('Error:')) {
        return message;
      }
    }
  }
  
  if (error instanceof Error) {
    // 过滤掉技术性错误消息
    const message = error.message || '';
    if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
      return '网络连接失败，请检查网络设置';
    }
    if (message.includes('JSON') || message.includes('parse')) {
      return '数据格式错误';
    }
    if (message.includes('storage') || message.includes('QuotaExceeded')) {
      return '存储空间不足';
    }
    
    // 返回原始消息（如果看起来是用户友好的）
    if (message.length < 100 && !message.includes('at ') && !message.includes('Error:')) {
      return message;
    }
  }
  
  if (typeof error === 'string') {
    return error;
  }
  
  return defaultMessage;
};

/**
 * 检查是否为网络错误
 */
export const isNetworkError = (error) => {
  if (error instanceof AppError) {
    return error.type === ErrorType.NETWORK;
  }
  if (error instanceof Error) {
    return error.name === 'NetworkError' || 
           error.message.includes('fetch') || 
           error.message.includes('network') ||
           error.message.includes('Failed to fetch');
  }
  return false;
};

/**
 * 检查是否为权限错误
 */
export const isPermissionError = (error) => {
  if (error instanceof AppError) {
    return error.type === ErrorType.PERMISSION;
  }
  if (error instanceof Error) {
    return error.message.includes('permission') || 
           error.message.includes('unauthorized') ||
           error.message.includes('forbidden');
  }
  return false;
};

