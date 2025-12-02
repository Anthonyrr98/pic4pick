import { createClient } from 'webdav';

// 获取 WebDAV 配置（实时读取）
const getConfig = () => {
  return {
    baseURL: localStorage.getItem('webdav_url') || '',
    username: localStorage.getItem('webdav_username') || '',
    password: localStorage.getItem('webdav_password') || '',
  };
};

// 创建 WebDAV 客户端
export const getWebDAVClient = () => {
  const config = getConfig();
  
  if (!config.baseURL || !config.username || !config.password) {
    throw new Error('WebDAV 配置不完整，请在设置中配置 WebDAV 信息');
  }

  // 确保 URL 格式正确
  let baseURL = config.baseURL.trim();
  if (!baseURL.startsWith('http://') && !baseURL.startsWith('https://')) {
    throw new Error('WebDAV 服务器地址必须以 http:// 或 https:// 开头');
  }
  
  // 对于坚果云，确保 URL 以 /dav/ 结尾
  if (baseURL.includes('jianguoyun.com')) {
    if (!baseURL.endsWith('/dav/') && !baseURL.endsWith('/dav')) {
      baseURL = baseURL.replace(/\/$/, '') + '/dav';
    }
  }
  
  // 移除末尾的斜杠（但保留 /dav/ 中的斜杠）
  if (!baseURL.endsWith('/dav/')) {
    baseURL = baseURL.replace(/\/$/, '');
  }

  return createClient(baseURL, {
    username: config.username,
    password: config.password,
  });
};

// 上传文件到 WebDAV
export const uploadToWebDAV = async (file, filename) => {
  try {
    const client = getWebDAVClient();
    const config = getConfig();
    
    // 确保目录存在
    const remotePath = `/pic4pick/${filename}`;
    const directory = '/pic4pick';
    
    try {
      await client.createDirectory(directory, { recursive: true });
    } catch (error) {
      // 目录可能已存在，忽略错误
      if (!error.message?.includes('405') && !error.message?.includes('exists')) {
        console.log('创建目录时出错:', error);
      }
    }
    
    // 上传文件
    await client.putFileContents(remotePath, file, {
      overwrite: true,
    });
    
    // 返回文件的访问 URL
    let baseURL = config.baseURL.trim();
    
    // 对于坚果云，确保 URL 格式正确
    if (baseURL.includes('jianguoyun.com')) {
      if (!baseURL.endsWith('/dav/') && !baseURL.endsWith('/dav')) {
        baseURL = baseURL.replace(/\/$/, '') + '/dav';
      }
    } else {
      baseURL = baseURL.replace(/\/$/, '');
    }
    
    const fileURL = `${baseURL}${remotePath}`;
    
    return fileURL;
  } catch (error) {
    console.error('WebDAV 上传失败:', error);
    const errorMessage = error.message || error.toString();
    throw new Error(`上传失败: ${errorMessage}`);
  }
};

// 删除 WebDAV 中的文件
export const deleteFromWebDAV = async (fileURL) => {
  try {
    const client = getWebDAVClient();
    
    // 从完整 URL 中提取路径
    const url = new URL(fileURL);
    const remotePath = url.pathname;
    
    await client.deleteFile(remotePath);
    return true;
  } catch (error) {
    console.error('WebDAV 删除失败:', error);
    throw new Error(`删除失败: ${error.message}`);
  }
};

// 检查 WebDAV 连接
export const testWebDAVConnection = async () => {
  try {
    const config = getConfig();
    
    if (!config.baseURL || !config.username || !config.password) {
      return { success: false, message: '请填写完整的 WebDAV 配置信息' };
    }

    if (!config.baseURL.startsWith('http://') && !config.baseURL.startsWith('https://')) {
      return { success: false, message: '服务器地址必须以 http:// 或 https:// 开头' };
    }

    console.log('测试 WebDAV 连接:', {
      url: config.baseURL,
      username: config.username,
      passwordLength: config.password.length
    });

    const client = getWebDAVClient();
    
    try {
      console.log('尝试获取根目录内容...');
      const contents = await client.getDirectoryContents('/');
      console.log('连接成功，根目录内容:', contents);
      return { success: true, message: '连接成功' };
    } catch (error) {
      console.error('获取根目录失败:', error);
      const errorMsg = error.message || error.toString();
      
      // 检查是否是 CORS 错误
      if (errorMsg.includes('Failed to fetch') || errorMsg.includes('CORS') || errorMsg.includes('NetworkError')) {
        return { 
          success: false, 
          message: `CORS 跨域错误：浏览器阻止了请求。\n\n这是浏览器的安全限制，无法直接从前端访问 WebDAV。\n\n解决方案：\n1. 使用后端代理服务器转发请求\n2. 或使用支持 CORS 的 WebDAV 服务` 
        };
      }
      
      // 尝试创建目录
      try {
        console.log('尝试创建 pic4pick 目录...');
        await client.createDirectory('/pic4pick', { recursive: true });
        console.log('目录创建成功');
        return { success: true, message: '连接成功' };
      } catch (createError) {
        console.error('创建目录失败:', createError);
        const createErrorMsg = createError.message || createError.toString();
        
        if (createErrorMsg.includes('Failed to fetch') || createErrorMsg.includes('CORS') || createErrorMsg.includes('NetworkError')) {
          return { 
            success: false, 
            message: `CORS 跨域错误：浏览器阻止了请求。\n\n这是浏览器的安全限制，无法直接从前端访问 WebDAV。\n\n解决方案：\n1. 使用后端代理服务器转发请求\n2. 或使用支持 CORS 的 WebDAV 服务` 
          };
        }
        
        return { 
          success: false, 
          message: `连接失败: ${errorMsg}\n创建目录失败: ${createErrorMsg}` 
        };
      }
    }
  } catch (error) {
    console.error('WebDAV 连接测试异常:', error);
    const errorMsg = error.message || error.toString();
    
    if (errorMsg.includes('Failed to fetch') || errorMsg.includes('CORS') || errorMsg.includes('NetworkError')) {
      return { 
        success: false, 
        message: `CORS 跨域错误：浏览器阻止了请求。\n\n这是浏览器的安全限制，无法直接从前端访问 WebDAV。\n\n解决方案：\n1. 使用后端代理服务器转发请求\n2. 或使用支持 CORS 的 WebDAV 服务` 
      };
    }
    
    return { 
      success: false, 
      message: `连接失败: ${errorMsg}` 
    };
  }
};

// 保存 WebDAV 配置
export const saveWebDAVConfig = (url, username, password) => {
  localStorage.setItem('webdav_url', url);
  localStorage.setItem('webdav_username', username);
  localStorage.setItem('webdav_password', password);
};

// 获取 WebDAV 配置
export const getWebDAVConfig = () => {
  return {
    url: localStorage.getItem('webdav_url') || '',
    username: localStorage.getItem('webdav_username') || '',
    password: localStorage.getItem('webdav_password') || '',
  };
};

