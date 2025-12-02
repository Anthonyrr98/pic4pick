// WebDAV 配置组件 - 复制到 Admin.jsx 中

{/* WebDAV 云存储配置区域 */}
<div style={{
  marginBottom: '32px',
  padding: '24px',
  background: 'rgba(255, 255, 255, 0.03)',
  borderRadius: '16px',
  border: '1px solid var(--border)'
}}>
  <h2 style={{
    fontSize: '18px',
    fontWeight: '600',
    marginBottom: '20px',
    color: 'var(--text)'
  }}>
    WebDAV 云存储配置
  </h2>

  <p style={{
    fontSize: '14px',
    color: 'var(--muted)',
    marginBottom: '20px'
  }}>
    配置 WebDAV 服务器用于云存储，支持坚果云、OwnCloud 等服务
  </p>

  <div style={{
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: '16px',
    marginBottom: '20px'
  }}>
    <div>
      <label style={{
        display: 'block',
        marginBottom: '8px',
        fontSize: '14px',
        fontWeight: '500',
        color: 'var(--text)'
      }}>
        服务器地址
      </label>
      <input
        type="text"
        value={webdavConfig.url}
        onChange={(e) => setWebdavConfig(prev => ({ ...prev, url: e.target.value }))}
        style={{
          width: '100%',
          padding: '10px 12px',
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          color: 'var(--text)',
          fontSize: '14px'
        }}
        placeholder="https://your-webdav.com/dav/"
      />
      <small style={{
        display: 'block',
        marginTop: '4px',
        fontSize: '12px',
        color: 'var(--muted)'
      }}>
        坚果云格式：https://domain.com/dav/
      </small>
    </div>

    <div>
      <label style={{
        display: 'block',
        marginBottom: '8px',
        fontSize: '14px',
        fontWeight: '500',
        color: 'var(--text)'
      }}>
        用户名
      </label>
      <input
        type="text"
        value={webdavConfig.username}
        onChange={(e) => setWebdavConfig(prev => ({ ...prev, username: e.target.value }))}
        style={{
          width: '100%',
          padding: '10px 12px',
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          color: 'var(--text)',
          fontSize: '14px'
        }}
        placeholder="WebDAV 用户名"
      />
    </div>

    <div>
      <label style={{
        display: 'block',
        marginBottom: '8px',
        fontSize: '14px',
        fontWeight: '500',
        color: 'var(--text)'
      }}>
        密码
      </label>
      <input
        type="password"
        value={webdavConfig.password}
        onChange={(e) => setWebdavConfig(prev => ({ ...prev, password: e.target.value }))}
        style={{
          width: '100%',
          padding: '10px 12px',
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          color: 'var(--text)',
          fontSize: '14px'
        }}
        placeholder="WebDAV 密码"
      />
    </div>
  </div>

  {/* 操作按钮 */}
  <div style={{
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
    flexWrap: 'wrap'
  }}>
    <button
      onClick={handleSaveWebDAVConfig}
      style={{
        padding: '10px 20px',
        background: 'rgba(52, 152, 219, 0.2)',
        border: '1px solid rgba(52, 152, 219, 0.5)',
        borderRadius: '8px',
        color: '#3498db',
        cursor: 'pointer',
        fontSize: '14px',
        fontWeight: '500'
      }}
    >
      保存配置
    </button>

    <button
      onClick={handleTestWebDAV}
      disabled={webdavTesting}
      style={{
        padding: '10px 20px',
        background: 'rgba(46, 204, 113, 0.2)',
        border: '1px solid rgba(46, 204, 113, 0.5)',
        borderRadius: '8px',
        color: '#2ecc71',
        cursor: webdavTesting ? 'not-allowed' : 'pointer',
        fontSize: '14px',
        fontWeight: '500'
      }}
    >
      {webdavTesting ? '测试中...' : '测试连接'}
    </button>

    <div style={{
      marginLeft: 'auto',
      minHeight: '40px',
      display: 'flex',
      alignItems: 'center'
    }}>
      {webdavTestResult && (
        <div style={{
          padding: '10px 16px',
          background: webdavTestResult.type === 'success'
            ? 'rgba(46, 204, 113, 0.1)'
            : webdavTestResult.type === 'error'
            ? 'rgba(231, 76, 60, 0.1)'
            : 'rgba(52, 152, 219, 0.1)',
          border: `1px solid ${
            webdavTestResult.type === 'success'
              ? 'rgba(46, 204, 113, 0.3)'
              : webdavTestResult.type === 'error'
              ? 'rgba(231, 76, 60, 0.3)'
              : 'rgba(52, 152, 219, 0.3)'
          }`,
          borderRadius: '8px',
          fontSize: '13px',
          color: webdavTestResult.type === 'success'
            ? '#2ecc71'
            : webdavTestResult.type === 'error'
            ? '#e74c3c'
            : '#3498db',
          whiteSpace: 'pre-line',
          maxWidth: '500px'
        }}>
          {webdavTestResult.message}
        </div>
      )}
    </div>
  </div>
</div>