FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json

RUN npm ci

COPY . .

RUN npm run build

ENV NODE_ENV=production

CMD ["npm", "run", "start"]
