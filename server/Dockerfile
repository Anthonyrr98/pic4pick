# Fly.io Dockerfile
FROM node:22-alpine

WORKDIR /app

# 复制 package 文件
COPY package*.json ./

# 安装依赖
RUN npm ci --only=production

# 复制应用代码
COPY . .

# 创建必要的目录
RUN mkdir -p uploads/pic4pick public/pic4pick logs

# 暴露端口
EXPOSE 3002

# 启动应用
CMD ["node", "server-enhanced.js"]

