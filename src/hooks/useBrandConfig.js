/**
 * 品牌配置管理 Hook
 */

import { useState, useEffect, useCallback } from 'react';
import {
  BRAND_LOGO_SUPABASE_ID,
  BRAND_LOGO_SUPABASE_TABLE,
  getStoredBrandLogo,
  saveBrandLogo,
  removeBrandLogo,
  getStoredBrandText,
  saveBrandText,
} from '../utils/branding';
import { handleError, ErrorType } from '../utils/errorHandler';

export const useBrandConfig = (supabase) => {
  const [brandLogo, setBrandLogo] = useState(() => getStoredBrandLogo());
  const [logoMessage, setLogoMessage] = useState({ type: '', text: '' });
  const [brandText, setBrandText] = useState(() => getStoredBrandText());
  const [brandTextMessage, setBrandTextMessage] = useState({ type: '', text: '' });

  /**
   * 加载远程品牌 Logo
   */
  const loadRemoteBrandLogo = useCallback(async () => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from(BRAND_LOGO_SUPABASE_TABLE)
        .select('logo_data, logo_url')
        .eq('id', BRAND_LOGO_SUPABASE_ID)
        .limit(1);
      if (error) {
        handleError(error, {
          context: 'loadRemoteBrandLogo',
          type: ErrorType.NETWORK,
          silent: true,
        });
        return;
      }
      const record = Array.isArray(data) ? data[0] : null;
      const remoteLogo = record?.logo_data || record?.logo_url || '';
      const normalized = remoteLogo || '';
      if (normalized) {
        saveBrandLogo(normalized);
      } else {
        removeBrandLogo();
      }
      setBrandLogo(normalized);
    } catch (error) {
      handleError(error, {
        context: 'loadRemoteBrandLogo',
        type: ErrorType.NETWORK,
        silent: true,
      });
    }
  }, [supabase]);

  /**
   * 加载远程品牌文本
   */
  const loadRemoteBrandText = useCallback(async () => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from(BRAND_LOGO_SUPABASE_TABLE)
        .select('site_title, site_subtitle, admin_title, admin_subtitle')
        .eq('id', BRAND_LOGO_SUPABASE_ID)
        .limit(1);
      if (error) {
        handleError(error, {
          context: 'loadRemoteBrandText',
          type: ErrorType.NETWORK,
          silent: true,
        });
        return;
      }
      const record = Array.isArray(data) ? data[0] : null;
      if (!record) return;

      // 以本地已有配置为基础，只在为空时用远端覆盖
      const local = getStoredBrandText();
      const remoteText = {
        siteTitle: record.site_title || local.siteTitle,
        siteSubtitle: record.site_subtitle || local.siteSubtitle,
        adminTitle: record.admin_title || local.adminTitle,
        adminSubtitle: record.admin_subtitle || local.adminSubtitle,
      };
      saveBrandText(remoteText);
      setBrandText(remoteText);
    } catch (error) {
      handleError(error, {
        context: 'loadRemoteBrandText',
        type: ErrorType.NETWORK,
        silent: true,
      });
    }
  }, [supabase]);

  /**
   * 监听品牌 Logo 变化
   */
  useEffect(() => {
    const handleLogoBroadcast = (event) => {
      if (event.detail) {
        setBrandLogo(event.detail);
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('camarts-brand-logo-change', handleLogoBroadcast);
      return () => {
        window.removeEventListener('camarts-brand-logo-change', handleLogoBroadcast);
      };
    }
  }, []);

  /**
   * 初始化时加载远程配置
   */
  useEffect(() => {
    if (supabase) {
      loadRemoteBrandLogo();
      loadRemoteBrandText();
    }
  }, [supabase, loadRemoteBrandLogo, loadRemoteBrandText]);

  return {
    brandLogo,
    setBrandLogo,
    logoMessage,
    setLogoMessage,
    brandText,
    setBrandText,
    brandTextMessage,
    setBrandTextMessage,
    loadRemoteBrandLogo,
    loadRemoteBrandText,
  };
};

