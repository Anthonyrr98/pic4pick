import React from 'react';
import { handleError, formatErrorMessage } from '../utils/errorHandler';

/**
 * React 错误边界组件
 * 捕获子组件树中的 JavaScript 错误，记录这些错误，并显示降级 UI
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error) {
    // 更新 state 使下一次渲染能够显示降级后的 UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // 记录错误信息
    const appError = handleError(error, {
      context: 'ErrorBoundary',
      silent: false,
    });

    this.setState({
      error: appError,
      errorInfo,
    });

    // 可以在这里将错误日志上报到错误监控服务
    // logErrorToService(error, errorInfo);
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      // 自定义降级 UI
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.handleReset);
      }

      // 默认降级 UI
      return (
        <div
          style={{
            padding: '48px 24px',
            textAlign: 'center',
            background: 'var(--bg)',
            minHeight: '400px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '24px',
          }}
        >
          <div
            style={{
              fontSize: '3rem',
              color: 'var(--muted)',
            }}
          >
            ⚠️
          </div>
          <h2
            style={{
              margin: 0,
              fontSize: '1.5rem',
              color: 'var(--text)',
            }}
          >
            出现了一些问题
          </h2>
          <p
            style={{
              margin: 0,
              color: 'var(--muted)',
              maxWidth: '500px',
            }}
          >
            {formatErrorMessage(this.state.error, '页面加载时发生错误')}
          </p>
          <button
            onClick={this.handleReset}
            style={{
              padding: '12px 24px',
              background: 'var(--accent)',
              color: 'var(--bg)',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '0.95rem',
              fontWeight: '500',
            }}
          >
            重试
          </button>
          {process.env.NODE_ENV === 'development' && this.state.errorInfo && (
            <details
              style={{
                marginTop: '24px',
                padding: '16px',
                background: 'rgba(0, 0, 0, 0.05)',
                borderRadius: '8px',
                maxWidth: '800px',
                width: '100%',
                textAlign: 'left',
              }}
            >
              <summary style={{ cursor: 'pointer', marginBottom: '8px' }}>
                错误详情（开发模式）
              </summary>
              <pre
                style={{
                  margin: 0,
                  fontSize: '0.85rem',
                  overflow: 'auto',
                  color: 'var(--text)',
                }}
              >
                {this.state.error && this.state.error.toString()}
                {this.state.errorInfo.componentStack}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * 高阶组件：为组件添加错误边界
 */
export const withErrorBoundary = (Component, fallback = null) => {
  return (props) => (
    <ErrorBoundary fallback={fallback}>
      <Component {...props} />
    </ErrorBoundary>
  );
};

