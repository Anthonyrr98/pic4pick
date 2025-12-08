/**
 * 配置面板组件
 * 环境变量配置、品牌 Logo、品牌标题等
 */

import { useRef, useState, useEffect } from 'react';
import { getEnvValue, updateEnvOverrides, resetEnvOverrides, ENV_OVERRIDE_KEYS } from '../../utils/envConfig';
import {
  BRAND_LOGO_MAX_SIZE,
  BRAND_LOGO_SUPABASE_TABLE,
  BRAND_LOGO_SUPABASE_ID,
  saveBrandLogo,
  removeBrandLogo,
  saveBrandText,
  getStoredBrandText,
  resetBrandText,
} from '../../utils/branding';
import { handleError, formatErrorMessage, ErrorType } from '../../utils/errorHandler';
import { StorageString, STORAGE_KEYS } from '../../utils/storage';

export const ConfigPanel = ({
  supabase,
  envConfigForm,
  setEnvConfigForm,
  envConfigMessage,
  setEnvConfigMessage,
  brandLogo,
  setBrandLogo,
  logoMessage,
  setLogoMessage,
  brandText,
  setBrandText,
  brandTextMessage,
  setBrandTextMessage,
  onExportPhotos,
  onImportPhotos,
  importFileInputRef,
}) => {
  const logoFileInputRef = useRef(null);
  
  // 后端 URL 配置状态
  const [backendUrl, setBackendUrl] = useState(() => {
    return StorageString.get(STORAGE_KEYS.ALIYUN_OSS_BACKEND_URL, '');
  });
  const [backendUrlMessage, setBackendUrlMessage] = useState({ type: '', text: '' });
  // OSS 上传模式：签名直传（默认）或后端代理
  const [ossMode, setOssMode] = useState(() => {
    const stored = StorageString.get('aliyun_oss_use_sign', '');
    return stored === 'false' ? 'proxy' : 'sign';
  });

  const handleLogoUploadClick = () => {
    if (logoFileInputRef.current) {
      logoFileInputRef.current.value = '';
      logoFileInputRef.current.click();
    }
  };

  const handleLogoFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > BRAND_LOGO_MAX_SIZE) {
      setLogoMessage({ type: 'error', text: `文件大小超过限制（${BRAND_LOGO_MAX_SIZE / 1024 / 1024}MB）` });
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const dataUrl = reader.result?.toString() || '';
        saveBrandLogo(dataUrl);
        setBrandLogo(dataUrl);
        setLogoMessage({ type: 'success', text: supabase ? 'Logo 已上传并同步到云端' : 'Logo 已更新' });
      } catch (error) {
        const appError = handleError(error, {
          context: 'handleLogoUpload',
          type: ErrorType.STORAGE,
        });
        setLogoMessage({ type: 'error', text: `保存失败：${formatErrorMessage(appError)}` });
      }
    };
    reader.onerror = () => {
      setLogoMessage({ type: 'error', text: '读取文件失败，请重试' });
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const handleResetLogo = async () => {
    try {
      if (supabase) {
        const { error } = await supabase
          .from('brand_settings')
          .delete()
          .eq('id', 'camarts_brand');
        if (error) throw error;
      }
      removeBrandLogo();
      setBrandLogo('');
      setLogoMessage({ type: 'info', text: '已恢复默认圆环 Logo' });
    } catch (error) {
      const appError = handleError(error, {
        context: 'handleResetLogo',
        type: ErrorType.NETWORK,
      });
      setLogoMessage({ type: 'error', text: `重置失败：${formatErrorMessage(appError)}` });
    }
  };

  const handleEnvConfigChange = (event) => {
    const { name, value } = event.target;
    setEnvConfigForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSaveEnvConfig = () => {
    const updates = {};
    Object.keys(envConfigForm).forEach((key) => {
      if (envConfigForm[key]) {
        updates[key] = envConfigForm[key];
      }
    });
    updateEnvOverrides(updates);
    setEnvConfigMessage({ type: 'success', text: '环境变量配置已保存，请刷新页面生效' });
    setTimeout(() => setEnvConfigMessage({ type: '', text: '' }), 3000);
  };

  const handleResetEnvConfig = () => {
    resetEnvOverrides(ENV_OVERRIDE_KEYS);
    setEnvConfigForm({
      supabaseUrl: getEnvValue('VITE_SUPABASE_URL', ''),
      supabaseAnonKey: getEnvValue('VITE_SUPABASE_ANON_KEY', ''),
      amapKey: getEnvValue('VITE_AMAP_KEY', ''),
    });
    setEnvConfigMessage({ type: 'info', text: '环境变量配置已重置为默认值，请刷新页面生效' });
    setTimeout(() => setEnvConfigMessage({ type: '', text: '' }), 3000);
  };

  const handleSaveBrandText = async () => {
    try {
      saveBrandText(brandText);
      if (supabase) {
        await supabase
          .from(BRAND_LOGO_SUPABASE_TABLE)
          .upsert({
            id: BRAND_LOGO_SUPABASE_ID,
            site_title: brandText.siteTitle,
            site_subtitle: brandText.siteSubtitle,
            admin_title: brandText.adminTitle,
            admin_subtitle: brandText.adminSubtitle,
            updated_at: new Date().toISOString(),
          });
      }
      setBrandTextMessage({ type: 'success', text: '标题文案已保存' });
    } catch (error) {
      handleError(error, {
        context: 'handleSaveBrandText',
        type: ErrorType.NETWORK,
        silent: true,
      });
      setBrandTextMessage({ type: 'error', text: '保存失败，请稍后重试' });
    }
  };

  const handleImportClick = () => {
    if (importFileInputRef?.current) {
      importFileInputRef.current.value = '';
      importFileInputRef.current.click();
    }
  };

  return (
    <>
      {/* 环境变量配置 */}
      <section className="admin-settings-card">
        <div className="admin-settings-card-header">
          <div>
            <h2 className="admin-settings-card-title">环境变量配置</h2>
            <p className="admin-settings-card-subtitle">
              配置 Supabase、高德地图等服务的 API Key。修改后需要刷新页面才能生效。
            </p>
          </div>
        </div>

        {envConfigMessage.text && (
          <div className={`admin-message ${envConfigMessage.type}`} style={{ marginBottom: '12px' }}>
            {envConfigMessage.text}
          </div>
        )}

        <div className="form-grid">
          <div className="form-group">
            <label>Supabase URL</label>
            <input
              type="text"
              name="supabaseUrl"
              value={envConfigForm.supabaseUrl}
              onChange={handleEnvConfigChange}
              placeholder="https://xxx.supabase.co"
            />
          </div>
          <div className="form-group">
            <label>Supabase Anon Key</label>
            <input
              type="text"
              name="supabaseAnonKey"
              value={envConfigForm.supabaseAnonKey}
              onChange={handleEnvConfigChange}
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
            />
          </div>
          <div className="form-group">
            <label>高德地图 API Key</label>
            <input
              type="text"
              name="amapKey"
              value={envConfigForm.amapKey}
              onChange={handleEnvConfigChange}
              placeholder="你的高德地图 API Key"
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
          <button type="button" className="btn-primary" onClick={handleSaveEnvConfig}>
            保存配置
          </button>
          <button type="button" className="btn-secondary" onClick={handleResetEnvConfig}>
            重置为默认
          </button>
        </div>
      </section>

      {/* 阿里云 OSS 后端配置 */}
      <section className="admin-settings-card">
        <div className="admin-settings-card-header">
          <div>
            <h2 className="admin-settings-card-title">阿里云 OSS 后端配置</h2>
            <p className="admin-settings-card-subtitle">
              配置后端服务器 URL，用于处理阿里云 OSS 上传。如果部署在 GitHub Pages，需要单独部署后端服务器。
            </p>
          </div>
        </div>

        {backendUrlMessage.text && (
          <div className={`admin-message ${backendUrlMessage.type}`} style={{ marginBottom: '12px' }}>
            {backendUrlMessage.text}
          </div>
        )}

        <div className="form-grid">
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>后端服务器 URL</label>
            <input
              type="text"
              value={backendUrl}
              onChange={(e) => setBackendUrl(e.target.value)}
              placeholder="https://your-backend-server.com/api/upload/oss"
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '10px',
                border: '1px solid var(--border)',
                background: 'rgba(255, 255, 255, 0.05)',
                color: 'var(--text)',
              }}
            />
            <div style={{ marginTop: '8px', fontSize: '0.85rem', color: 'var(--muted)' }}>
              {backendUrl ? (
                <span>当前配置: <code style={{ background: 'rgba(255, 255, 255, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>{backendUrl}</code></span>
              ) : (
                <span>未配置，将使用默认值（开发环境: localhost:3002，生产环境: 相对路径或 Supabase Edge Functions）</span>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              if (backendUrl) {
                StorageString.set(STORAGE_KEYS.ALIYUN_OSS_BACKEND_URL, backendUrl.trim());
                setBackendUrlMessage({ type: 'success', text: '后端 URL 已保存，刷新页面后生效' });
              } else {
                StorageString.remove(STORAGE_KEYS.ALIYUN_OSS_BACKEND_URL);
                setBackendUrlMessage({ type: 'info', text: '已清除后端 URL 配置，将使用默认值' });
              }
              setTimeout(() => setBackendUrlMessage({ type: '', text: '' }), 3000);
            }}
          >
            保存配置
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              StorageString.remove(STORAGE_KEYS.ALIYUN_OSS_BACKEND_URL);
              setBackendUrl('');
              setBackendUrlMessage({ type: 'info', text: '已清除配置，将使用默认值' });
              setTimeout(() => setBackendUrlMessage({ type: '', text: '' }), 3000);
            }}
          >
            清除配置
          </button>
        </div>

        <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: '0.9rem', marginBottom: '8px', color: 'var(--text)' }}>配置说明：</h3>
          <ul style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: 0, paddingLeft: '20px', lineHeight: '1.6' }}>
            <li>如果后端服务器部署在独立域名，请输入完整 URL，例如：<code>https://api.example.com/api/upload/oss</code></li>
            <li>如果后端和前端在同一域名，可以输入相对路径，例如：<code>/api/upload/oss</code></li>
            <li>如果使用 Supabase Edge Functions，可以留空，系统会自动检测并使用</li>
            <li>开发环境默认使用 <code>http://localhost:3002/api/upload/oss</code></li>
          </ul>
        </div>
      </section>

      {/* OSS 上传模式切换 */}
      <section className="admin-settings-card">
        <div className="admin-settings-card-header">
          <div>
            <h2 className="admin-settings-card-title">OSS 上传模式</h2>
            <p className="admin-settings-card-subtitle">
              默认使用“签名直传”减少中转流量；如需旧的“后端代理”模式可切换。
            </p>
          </div>
        </div>

        <div className="form-grid">
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>上传模式</label>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <input
                  type="radio"
                  name="ossMode"
                  value="sign"
                  checked={ossMode === 'sign'}
                  onChange={() => setOssMode('sign')}
                />
                <span>签名直传（推荐）</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <input
                  type="radio"
                  name="ossMode"
                  value="proxy"
                  checked={ossMode === 'proxy'}
                  onChange={() => setOssMode('proxy')}
                />
                <span>后端代理（兼容旧模式）</span>
              </label>
            </div>
            <div style={{ marginTop: '8px', fontSize: '0.85rem', color: 'var(--muted)' }}>
              {ossMode === 'sign'
                ? '前端先获取签名，再直接 PUT 到 OSS，避开中转流量。'
                : '文件先上传到后端，再由后端转发到 OSS。'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              if (ossMode === 'sign') {
                StorageString.remove('aliyun_oss_use_sign');
              } else {
                StorageString.set('aliyun_oss_use_sign', 'false');
              }
              setBackendUrlMessage({ type: 'success', text: '上传模式已保存，刷新页面后生效' });
              setTimeout(() => setBackendUrlMessage({ type: '', text: '' }), 3000);
            }}
          >
            保存模式
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              StorageString.remove('aliyun_oss_use_sign');
              setOssMode('sign');
              setBackendUrlMessage({ type: 'info', text: '已恢复默认：签名直传' });
              setTimeout(() => setBackendUrlMessage({ type: '', text: '' }), 3000);
            }}
          >
            恢复默认
          </button>
        </div>
      </section>

      {/* 品牌 Logo 设置 */}
      <section className="admin-settings-card">
        <div className="admin-settings-card-header">
          <div>
            <h2 className="admin-settings-card-title">品牌 Logo</h2>
            <p className="admin-settings-card-subtitle">
              上传自定义 Logo，将替换默认的圆环图标。支持 PNG、JPG 格式，建议尺寸 320×320 以内。
            </p>
            <div style={{ marginTop: '8px', fontSize: '0.85rem', color: 'var(--muted)' }}>
              {brandLogo ? '已启用自定义 Logo' : '当前使用默认圆环'}
            </div>
          </div>
        </div>

        <div className="admin-logo-preview-wrapper">
          <div className="admin-logo-ring-frame">
            {brandLogo ? (
              <img
                src={brandLogo}
                alt="当前 Logo 预览"
                className="brand-logo-img"
                style={{ width: '72px', height: '72px' }}
              />
            ) : (
              <div className="logo-mark" aria-hidden="true" style={{ width: '72px', height: '72px' }} />
            )}
          </div>

          <div style={{ flex: 1, minWidth: '240px' }}>
            <p style={{ fontSize: '0.9rem', color: 'var(--muted)', marginBottom: '12px' }}>
              建议尺寸 320×320 以内，背景建议透明或纯色。更新后无需刷新即可在所有页面生效。
            </p>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button type="button" className="btn-primary" onClick={handleLogoUploadClick}>
                上传新 Logo
              </button>
              <button type="button" className="btn-secondary" onClick={handleResetLogo} disabled={!brandLogo}>
                使用默认
              </button>
            </div>
            {logoMessage.text && (
              <div className={`admin-message ${logoMessage.type}`} style={{ marginTop: '12px' }}>
                {logoMessage.text}
              </div>
            )}
          </div>
        </div>

        <input
          ref={logoFileInputRef}
          type="file"
          accept="image/*"
          onChange={handleLogoFileChange}
          style={{ display: 'none' }}
        />
      </section>

      {/* 品牌标题设置 */}
      <section className="admin-settings-card">
        <div className="admin-settings-card-header">
          <div>
            <h2 className="admin-settings-card-title">品牌标题文案</h2>
            <p className="admin-settings-card-subtitle">
              配置前台和后台顶部 Logo 旁边显示的主标题与副标题，例如「CAMARTS / PHOTOGRAPHY」「CAMARTS / ADMIN PANEL」。
            </p>
          </div>
        </div>

        {brandTextMessage.text && (
          <div className={`admin-message ${brandTextMessage.type}`} style={{ marginBottom: '12px' }}>
            {brandTextMessage.text}
          </div>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '16px',
            marginBottom: '16px',
          }}
        >
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>前台主标题</span>
            <input
              type="text"
              value={brandText.siteTitle}
              onChange={(e) => setBrandText((prev) => ({ ...prev, siteTitle: e.target.value }))}
              placeholder="CAMARTS"
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '10px',
                border: '1px solid var(--border)',
                background: 'rgba(255, 255, 255, 0.05)',
                color: 'var(--text)',
              }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>前台副标题</span>
            <input
              type="text"
              value={brandText.siteSubtitle}
              onChange={(e) => setBrandText((prev) => ({ ...prev, siteSubtitle: e.target.value }))}
              placeholder="PHOTOGRAPHY"
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '10px',
                border: '1px solid var(--border)',
                background: 'rgba(255, 255, 255, 0.05)',
                color: 'var(--text)',
              }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>后台主标题</span>
            <input
              type="text"
              value={brandText.adminTitle}
              onChange={(e) => setBrandText((prev) => ({ ...prev, adminTitle: e.target.value }))}
              placeholder="CAMARTS"
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '10px',
                border: '1px solid var(--border)',
                background: 'rgba(255, 255, 255, 0.05)',
                color: 'var(--text)',
              }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>后台副标题</span>
            <input
              type="text"
              value={brandText.adminSubtitle}
              onChange={(e) => setBrandText((prev) => ({ ...prev, adminSubtitle: e.target.value }))}
              placeholder="ADMIN PANEL"
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '10px',
                border: '1px solid var(--border)',
                background: 'rgba(255, 255, 255, 0.05)',
                color: 'var(--text)',
              }}
            />
          </label>
        </div>

        <div className="admin-settings-actions-row">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              resetBrandText();
              const fresh = getStoredBrandText();
              setBrandText(fresh);
              setBrandTextMessage({ type: 'info', text: '已恢复默认标题文案' });
            }}
            style={{ minWidth: '120px' }}
          >
            恢复默认
          </button>
          <button type="button" className="btn-primary" onClick={handleSaveBrandText} style={{ minWidth: '120px' }}>
            保存标题
          </button>
        </div>
      </section>
    </>
  );
};

