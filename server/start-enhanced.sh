#!/bin/bash

# Pic4Pick 增强版服务器启动脚本

echo "==================================="
echo "  Pic4Pick 增强版服务器启动器"
echo "==================================="
echo ""

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 错误：未安装 Node.js"
    echo "请访问 https://nodejs.org/ 安装 Node.js"
    exit 1
fi

echo "✅ Node.js 版本: $(node -v)"
echo ""

# 检查服务器目录
if [ ! -d "server" ]; then
    echo "❌ 错误：未找到 server 目录"
    echo "请在项目根目录运行此脚本"
    exit 1
fi

# 进入服务器目录
cd $(dirname "$0")

# 检查 .env 文件
if [ ! -f ".env" ]; then
    echo "⚠️  警告：未找到 .env 文件"
    echo ""
    echo "正在创建 .env 文件..."

    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo "✅ 已从 .env.example 创建 .env 文件"
        echo ""
        echo "⚠️  重要：请编辑 .env 文件并设置你的 JWT_SECRET："
        echo "JWT_SECRET=your-super-secret-jwt-key-2024-change-in-production"
        echo ""
    else
        echo "❌ 未找到 .env.example 文件，请检查服务器配置"
        exit 1
    fi
fi

# 安装依赖
if [ ! -d "node_modules" ]; then
    echo "📦 首次运行，正在安装依赖..."
    npm install

    if [ $? -ne 0 ]; then
        echo "❌ 依赖安装失败"
        exit 1
    fi
    echo "✅ 依赖安装完成"
    echo ""
fi

# 检查日志目录
if [ ! -d "logs" ]; then
    echo "📁 创建日志目录..."
    mkdir -p logs
fi

echo "🚀 正在启动 Pic4Pick 增强版服务器..."
echo ""
echo "服务器信息："
echo "  - 端口：$(grep PORT .env | cut -d '=' -f2 || echo 3001)"
echo "  - 环境：$(grep NODE_ENV .env | cut -d '=' -f2 || echo development)"
echo "  - 日志：$(pwd)/logs"
echo ""
echo "可用的 API 端点："
echo "  - 健康检查：GET  /api/health"
echo "  - 用户认证：POST /api/auth/login"
echo "  - WebDAV 代理：POST /api/webdav/upload"
echo ""
echo "==================================="
echo ""

# 检查是否有增强版服务器文件
if [ -f "server-enhanced.js" ]; then
    echo "使用增强版服务器（WebDAV 代理 + JWT认证）..."
    node server-enhanced.js
else
    echo "⚠️  未找到 server-enhanced.js，使用原始服务器..."
    node server.js
fi