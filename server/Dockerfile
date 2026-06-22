FROM node:20-alpine

WORKDIR /app

# パッケージファイルのコピーとインストール
COPY package*.json ./
RUN npm install

# ソースコードのコピー
COPY . .

# ヘルスチェック
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -f http://localhost:3001/api/v1/health || exit 1

EXPOSE 3001

CMD ["npm", "start"]
