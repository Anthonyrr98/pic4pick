#!/bin/bash

# Pic4Pick 全量构建脚本

echo "========================================="
echo "      Pic4Pick 全量构建脚本"
echo "========================================="
echo ""

# 设置颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ 错误：未安装 Node.js${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Node.js 版本: $(node -v)${NC}"
echo ""

# 1. 构建前端
echo "📦 步骤 1/3: 构建前端..."
if [ ! -d "node_modules" ]; then
    echo "安装前端依赖..."
    npm install

    if [ $? -ne 0 ]; then
        echo -e "${RED}❌ 前端依赖安装失败${NC}"
        exit 1
    fi
fi

echo "执行前端构建..."
npm run build

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ 前端构建失败${NC}"
    exit 1
fi

echo -e "${GREEN}✅ 前端构建完成${NC}"
echo ""

# 2. 安装服务器依赖
echo "📦 步骤 2/3: 安装服务器依赖..."
cd server

if [ ! -d "node_modules" ]; then
    echo "安装服务器依赖..."
    npm install

    if [ $? -ne 0 ]; then
        echo -e "${RED}❌ 服务器依赖安装失败${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}✅ 服务器依赖安装完成${NC}"
cd ..
echo ""

# 3. 创建必要目录
echo "📦 步骤 3/3: 创建必要目录..."
echo "创建 uploads 目录..."
mkdir -p server/uploads/pic4pick

echo "创建 public 目录..."
mkdir -p server/public/pic4pick

echo "创建 logs 目录..."
mkdir -p server/logs

echo -e "${GREEN}✅ 所有目录创建完成${NC}"
echo ""

# 显示结果
echo "========================================="
echo -e "${GREEN}🎉 构建完成！${NC}"
echo "========================================="
echo ""
echo "前端构建输出: ./dist/"
echo "服务器目录: ./server/"
echo ""
echo "启动服务器："
echo "  cd server && npm run dev"
echo ""
echo "启动前端："
echo "  npm run dev"
echo ""
echo "生产环境部署："
echo "  - 复制 ./dist/ 到 Web 服务器"
echo "  - 配置 ./server/ （生产环境）"
echo "  - 使用_pm2_ 或 _systemd_ 管理服务"
echo ""
echo "========================================="