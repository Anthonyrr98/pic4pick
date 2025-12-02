// WebDAV 配置组件
import { useState, useEffect } from 'react';
import {
  getWebDAVConfig,
  saveWebDAVConfig,
  testWebDAVConnection
} from '../utils/webdav';

export default function WebDAVConfig() {
  const [config, setConfig] = useState({
    url: '',
    username: '',
    password: ''
  });
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  // 加载保存的配置
  useEffect(() => {
    const savedConfig = getWebDAVConfig();
    setConfig(savedConfig);
  }, []);

  // 保存配置
  const handleSave = () => {
    setSaving(true);
    saveWebDAVConfig(
      config.url.trim(),
      config.username.trim(),
      config.password.trim()
    );
    setSaving(false);
    setTestResult({
      type: 'info',
      message: '配置已保存'
    });
    setTimeout(() => setTestResult(null), 3000);
  };

  // 测试连接
  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      const result = await testWebDAVConnection();
      setTestResult({
        type: result.success ? 'success' : 'error',
        message: result.message
      });
    } catch (error) {
      setTestResult({
        type: 'error',
        message: error.message
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="webdav-config-section">
      <h2>WebDAV 云存储配置</h2>
      <p className="section-description">
        配置 WebDAV 服务器用于云存储，支持坚果云、OwnCloud 等服务
      </p>

      <div className="webdav-config-grid">
        <div className="config-field">
          <label>服务器地址</label>
          <input
            type="text"
            value={config.url}
            onChange={(e) => setConfig(prev => ({ ...prev, url: e.target.value }))}
            placeholder="https://your-webdav.com/dav/"
          />
          <small>示例：坚果云使用 https://domain.com/dav/</small>
        </div>

        <div className="config-field">
          <label>用户名</label>
          <input
            type="text"
            value={config.username}
            onChange={(e) => setConfig(prev => ({ ...prev, username: e.target.value }))}
            placeholder="请输入用户名"
          />
        </div>

        <div className="config-field">
          <label>密码</label>
          <input
            type="password"
            value={config.password}
            onChange={(e) => setConfig(prev => ({ ...prev, password: e.target.value }))}
            placeholder="请输入密码"
          />
        </div>
      </div>

      <div className="config-actions">
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-secondary"
        >
          {saving ? '保存中...' : '保存配置'}
        </button>

        <button
          onClick={handleTest}
          disabled={testing || !config.url || !config.username}
          className="btn-primary"
        >
          {testing ? '测试中...' : '测试连接'}
        </button>
      </div>

      {testResult && (
        <div className={`test-result ${testResult.type}`}>
          {testResult.message}
        </div>
      )}
    </div>
  );
}